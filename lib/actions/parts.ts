"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  uploadImage,
  cutoutImagePath,
  sizeReferenceImagePath,
  compositingImagePath,
  soloPreviewImagePath,
  fetchImageBytes,
} from "@/lib/storage";
import { composePreview } from "@/lib/gemini";
import { COMPOSITE_PROMPT_VERSION } from "@/lib/prompt-templates";
import { mechanicalComposite, MECHANICAL_COMPOSITE_VERSION } from "@/lib/deterministic-composite";
import { MIN_WIDTH_PERCENT, MAX_WIDTH_PERCENT, AUTO_SIZE_SAFETY_MARGIN, VISUAL_SIZE_BOOST } from "@/lib/sizing-constants";
import type { AttachmentStyle } from "@prisma/client";

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "part"}-${Date.now().toString(36)}`;
}

export async function createPart(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const sizeNote = String(formData.get("sizeNote") ?? "").trim() || null;
  const realWidthCmRaw = Number(formData.get("realWidthCm"));
  const realWidthCm = Number.isFinite(realWidthCmRaw) && realWidthCmRaw > 0 ? realWidthCmRaw : null;
  const displayCategory = String(formData.get("displayCategory") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const addOnPriceJpy = Number(formData.get("addOnPriceJpy"));
  const attachmentStyle = String(formData.get("attachmentStyle") ?? "") as AttachmentStyle;
  const copiedFromPartId = String(formData.get("copiedFromPartId") ?? "").trim() || null;
  const file = formData.get("cutout") as File | null;
  const sizeRefFile = formData.get("sizeReference") as File | null;
  const compositingFile = formData.get("compositingImage") as File | null;

  if (!name || !Number.isFinite(addOnPriceJpy) || addOnPriceJpy < 0 || !attachmentStyle || !file || file.size === 0) {
    throw new Error("必須項目が入力されていません");
  }

  const key = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cutoutImageUrl = await uploadImage(cutoutImagePath(key, file.name), bytes, file.type || "image/png");

  let sizeReferenceImageUrl: string | null = null;
  if (sizeRefFile && sizeRefFile.size > 0) {
    const refKey = crypto.randomUUID();
    const refBytes = new Uint8Array(await sizeRefFile.arrayBuffer());
    sizeReferenceImageUrl = await uploadImage(
      sizeReferenceImagePath(refKey, sizeRefFile.name),
      refBytes,
      sizeRefFile.type || "image/png"
    );
  }

  let compositingImageUrl: string | null = null;
  if (compositingFile && compositingFile.size > 0) {
    const compKey = crypto.randomUUID();
    const compBytes = new Uint8Array(await compositingFile.arrayBuffer());
    compositingImageUrl = await uploadImage(
      compositingImagePath(compKey, compositingFile.name),
      compBytes,
      compositingFile.type || "image/png"
    );
  }

  const part = await db.part.create({
    data: {
      slug: slugify(name),
      name,
      description,
      sizeNote,
      realWidthCm,
      displayCategory,
      color,
      addOnPriceJpy,
      cutoutImageUrl,
      sizeReferenceImageUrl,
      compositingImageUrl,
      attachmentStyle,
      copiedFromPartId,
      status: "draft",
    },
  });

  await generateSoloPreviewsForPart(part.id);

  revalidatePath("/admin/parts");
  redirect(`/admin/parts/${part.id}`);
}

/** Generates any missing or previously-failed (part x active compatible base photo) solo QA previews. */
export async function generateSoloPreviewsForPart(partId: string) {
  const part = await db.part.findUniqueOrThrow({ where: { id: partId } });
  const basePhotos = await db.modelBasePhoto.findMany({
    where: { active: true, compatibleAttachmentStyles: { has: part.attachmentStyle } },
  });

  // Run all base photos concurrently instead of one-at-a-time — each Gemini call takes ~15-25s, so
  // this roughly halves the wait for registering a new part when there are 2 active base photos
  // (and scales better as more base photos are added).
  await Promise.all(
    basePhotos.map(async (basePhoto) => {
      const existing = await db.partSoloPreview.findUnique({
        where: { partId_basePhotoId: { partId, basePhotoId: basePhoto.id } },
      });
      if (existing && existing.status !== "failed") return;

      await generateSingleSoloPreview(partId, basePhoto.id);
    })
  );

  revalidatePath(`/admin/parts/${partId}`);
}

export async function generateSingleSoloPreview(
  partId: string,
  basePhotoId: string,
  layout?: { bytes: Uint8Array; contentType: string; xPercent?: number; yPercent?: number; widthPercent?: number },
  // Explicit "use this exact preview as the scale exemplar" override, from the admin clicking
  // "これを見本に他を再生成" — bypasses the automatic approved-only lookup below, since the whole
  // point is to let her point at a preview that looks right before it's been formally approved.
  exemplarPreviewIdOverride?: string,
  // Skip the mechanical/calibrated path entirely and let Gemini judge size + do the background
  // separation itself, from the admin clicking "Geminiにお任せで再生成". Exists because the
  // mechanical path's own background stripping is a plain color-threshold rule: it's reliably exact
  // on size, but for a source photo with a cast shadow whose color is genuinely close to the
  // accessory's own (confirmed directly on an アネモネ part — no threshold cleanly separated the
  // two without also eating petal), no amount of retuning fixes it, while Gemini's semantic
  // understanding of "this is a flower, not a shadow" handles it fine at the cost of reintroducing
  // the size-drift risk the mechanical path exists to avoid. A manual per-part escape hatch for that
  // tradeoff, not a replacement for the mechanical path.
  useLegacyGemini?: boolean
) {
  const [part, basePhoto] = await Promise.all([
    db.part.findUniqueOrThrow({ where: { id: partId } }),
    db.modelBasePhoto.findUniqueOrThrow({ where: { id: basePhotoId } }),
  ]);

  try {
    const hasManualLayout = layout?.xPercent !== undefined && layout?.yPercent !== undefined && layout?.widthPercent !== undefined;

    // When both the part and the base photo have a real-world cm measurement, we can compute the
    // true-to-life size ourselves instead of asking Gemini to judge scale — verified far more
    // reliable (a "shrink to 5%" text instruction still rendered oversized in testing; a
    // deterministically pasted 5%-wide draft, with Gemini only asked to blend it in, rendered
    // correctly). VISUAL_SIZE_BOOST then scales that true-to-life size up to match what actually
    // reads well in a product photo — see its definition for the approved reference it's calibrated
    // against. AUTO_SIZE_SAFETY_MARGIN is a separate, currently-inert hedge; see its own comment.
    const calibratedWidthPercent =
      part.realWidthCm != null && basePhoto.realWidthCm != null
        ? Math.min(
            MAX_WIDTH_PERCENT,
            Math.max(
              MIN_WIDTH_PERCENT,
              (part.realWidthCm / basePhoto.realWidthCm) * 100 * AUTO_SIZE_SAFETY_MARGIN * VISUAL_SIZE_BOOST
            )
          )
        : null;

    let result: { imageBytes: Buffer; mimeType: string; promptVersion: string };
    let draftXPercent: number | null = null;
    let draftYPercent: number | null = null;
    let draftWidthPercent: number | null = null;

    if (!useLegacyGemini && (hasManualLayout || calibratedWidthPercent != null)) {
      // Pure mechanical compositing (no Gemini call at all) — replaces the old "deterministic draft
      // + Gemini blend" pipeline. The blend step was the actual source of the recurring size-drift
      // complaints (confirmed: Gemini's photorealistic re-render drifted in scale call-to-call even
      // from a provably-correct draft). Size/position are exact pixel math here, so every generation
      // for a calibrated part comes out the correct size on the first try, every time.
      const [cutout, base] = await Promise.all([
        fetchImageBytes(part.compositingImageUrl || part.cutoutImageUrl),
        fetchImageBytes(basePhoto.imageUrl),
      ]);

      let xPercent: number;
      let yPercent: number;
      let widthPercent: number;

      if (hasManualLayout) {
        // Admin manually placed this via PartSizer — authoritative on its own, no sibling lookup.
        xPercent = layout!.xPercent!;
        yPercent = layout!.yPercent!;
        widthPercent = layout!.widthPercent!;
      } else {
        xPercent = basePhoto.defaultAttachmentXPercent ?? 50;
        yPercent = basePhoto.defaultAttachmentYPercent ?? 25;

        // When a family sibling (this part's copiedFromPartId chain, e.g. a color variant) already
        // has an approved result on this EXACT base photo, reuse its widthPercent instead of the
        // independently-computed cm calibration. Saki's ask was explicit: "シャンパンと同じサイズに"
        // (the same size as champagne) — cm math for two different parts can legitimately diverge
        // even when the visual result should match (different measured cm, rounding, etc.).
        let sibling: { layoutWidthPercent: number | null } | null = null;
        if (exemplarPreviewIdOverride) {
          sibling = await db.partSoloPreview.findUnique({ where: { id: exemplarPreviewIdOverride } });
        } else {
          const familyRootId = part.copiedFromPartId ?? part.id;
          sibling = await db.partSoloPreview.findFirst({
            where: {
              status: "approved",
              basePhotoId,
              partId: { not: partId },
              layoutWidthPercent: { not: null },
              part: { OR: [{ id: familyRootId }, { copiedFromPartId: familyRootId }] },
            },
            orderBy: { generatedAt: "desc" },
          });
        }
        widthPercent = sibling?.layoutWidthPercent ?? calibratedWidthPercent!;
      }

      const imageBytes = await mechanicalComposite(base.bytes, cutout.bytes, widthPercent, xPercent, yPercent);
      result = { imageBytes, mimeType: "image/png", promptVersion: MECHANICAL_COMPOSITE_VERSION };
      draftXPercent = xPercent;
      draftYPercent = yPercent;
      draftWidthPercent = widthPercent;
    } else {
      // Legacy fallback for parts or base photos without a real-world cm measurement registered
      // yet — let Gemini guess scale from text/coin/exemplar hints, as before calibration existed.
      const storeSetting = await db.storeSetting.findUnique({ where: { id: 1 } });
      const [cutout, base, sizeReference, exemplar] = await Promise.all([
        fetchImageBytes(part.compositingImageUrl || part.cutoutImageUrl),
        fetchImageBytes(basePhoto.imageUrl),
        part.sizeReferenceImageUrl ? fetchImageBytes(part.sizeReferenceImageUrl) : Promise.resolve(null),
        storeSetting?.scaleExemplarImageUrl ? fetchImageBytes(storeSetting.scaleExemplarImageUrl) : Promise.resolve(null),
      ]);
      result = await composePreview({
        mode: "compose",
        cutoutBytes: cutout.bytes,
        cutoutMimeType: cutout.contentType,
        baseBytes: base.bytes,
        baseMimeType: base.contentType,
        attachmentZone: basePhoto.attachmentZone,
        sizeNote: part.sizeNote,
        sizeReferenceBytes: sizeReference?.bytes,
        sizeReferenceMimeType: sizeReference?.contentType,
        exemplarBytes: exemplar?.bytes,
        exemplarMimeType: exemplar?.contentType,
      });
    }

    const imageUrl = await uploadImage(soloPreviewImagePath(partId, basePhotoId), result.imageBytes, result.mimeType);

    // Keep PartSizer's "% of the currently displayed image" baseline honest: persist whatever
    // size/position this generation actually used (manual or auto-calibrated), or clear it when
    // neither applied (legacy Gemini-guessed path) so a stale number never lingers disconnected
    // from what's actually on screen.
    const layoutPercents =
      draftXPercent !== null && draftYPercent !== null && draftWidthPercent !== null
        ? { layoutXPercent: draftXPercent, layoutYPercent: draftYPercent, layoutWidthPercent: draftWidthPercent }
        : { layoutXPercent: null, layoutYPercent: null, layoutWidthPercent: null };

    await db.partSoloPreview.upsert({
      where: { partId_basePhotoId: { partId, basePhotoId } },
      create: {
        partId,
        basePhotoId,
        imageUrl,
        status: "pending_review",
        promptVersion: result.promptVersion,
        ...layoutPercents,
      },
      update: {
        imageUrl,
        status: "pending_review",
        promptVersion: result.promptVersion,
        errorMessage: null,
        generatedAt: new Date(),
        ...layoutPercents,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.partSoloPreview.upsert({
      where: { partId_basePhotoId: { partId, basePhotoId } },
      create: {
        partId,
        basePhotoId,
        status: "failed",
        promptVersion: COMPOSITE_PROMPT_VERSION,
        errorMessage,
      },
      update: { status: "failed", errorMessage },
    });
  }
}

export async function activatePart(partId: string) {
  const approvedCount = await db.partSoloPreview.count({
    where: { partId, status: "approved" },
  });

  if (approvedCount === 0) {
    throw new Error("承認済みのプレビューが1件もないため有効化できません");
  }

  await db.part.update({ where: { id: partId }, data: { status: "active" } });
  revalidatePath(`/admin/parts/${partId}`);
  revalidatePath("/admin/parts");
  revalidatePath("/");
}

export async function deactivatePart(partId: string) {
  await db.part.update({ where: { id: partId }, data: { status: "inactive" } });
  revalidatePath(`/admin/parts/${partId}`);
  revalidatePath("/admin/parts");
  revalidatePath("/");
}

export async function deletePart(partId: string) {
  const orderCount = await db.orderItemPart.count({ where: { partId } });
  if (orderCount > 0) {
    throw new Error("注文実績のあるパーツは削除できません。「無効にする」で非公開にしてください。");
  }

  await db.part.delete({ where: { id: partId } });
  revalidatePath("/admin/parts");
  revalidatePath("/");
}

export async function updatePart(partId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const sizeNote = String(formData.get("sizeNote") ?? "").trim() || null;
  const realWidthCmRaw = Number(formData.get("realWidthCm"));
  const realWidthCm = Number.isFinite(realWidthCmRaw) && realWidthCmRaw > 0 ? realWidthCmRaw : null;
  const displayCategory = String(formData.get("displayCategory") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const addOnPriceJpy = Number(formData.get("addOnPriceJpy"));
  const attachmentStyle = String(formData.get("attachmentStyle") ?? "") as AttachmentStyle;
  const file = formData.get("cutout") as File | null;
  const sizeRefFile = formData.get("sizeReference") as File | null;
  const removeSizeReference = formData.get("removeSizeReference") === "1";
  const compositingFile = formData.get("compositingImage") as File | null;
  const removeCompositingImage = formData.get("removeCompositingImage") === "1";

  if (!name || !Number.isFinite(addOnPriceJpy) || addOnPriceJpy < 0 || !attachmentStyle) {
    throw new Error("必須項目が入力されていません");
  }

  const existing = await db.part.findUniqueOrThrow({ where: { id: partId } });

  const replacingPhoto = Boolean(file && file.size > 0);
  let cutoutImageUrl: string | undefined;
  if (file && file.size > 0) {
    const key = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    cutoutImageUrl = await uploadImage(cutoutImagePath(key, file.name), bytes, file.type || "image/png");
  }

  const replacingSizeReference = Boolean(sizeRefFile && sizeRefFile.size > 0);
  let sizeReferenceImageUrl: string | null | undefined;
  if (sizeRefFile && sizeRefFile.size > 0) {
    const refKey = crypto.randomUUID();
    const refBytes = new Uint8Array(await sizeRefFile.arrayBuffer());
    sizeReferenceImageUrl = await uploadImage(
      sizeReferenceImagePath(refKey, sizeRefFile.name),
      refBytes,
      sizeRefFile.type || "image/png"
    );
  } else if (removeSizeReference) {
    sizeReferenceImageUrl = null;
  }

  const replacingCompositingImage = Boolean(compositingFile && compositingFile.size > 0);
  let compositingImageUrl: string | null | undefined;
  if (compositingFile && compositingFile.size > 0) {
    const compKey = crypto.randomUUID();
    const compBytes = new Uint8Array(await compositingFile.arrayBuffer());
    compositingImageUrl = await uploadImage(
      compositingImagePath(compKey, compositingFile.name),
      compBytes,
      compositingFile.type || "image/png"
    );
  } else if (removeCompositingImage) {
    compositingImageUrl = null;
  }

  // Anything that feeds into the compositing prompt (photo, size reference, compositing image,
  // size note, attachment style) invalidates every prior solo-QA review — the generated images
  // no longer reflect the current inputs.
  const invalidatesPreviews =
    replacingPhoto ||
    replacingSizeReference ||
    removeSizeReference ||
    replacingCompositingImage ||
    removeCompositingImage ||
    sizeNote !== existing.sizeNote ||
    attachmentStyle !== existing.attachmentStyle;

  await db.part.update({
    where: { id: partId },
    data: {
      name,
      description,
      sizeNote,
      realWidthCm,
      displayCategory,
      color,
      addOnPriceJpy,
      attachmentStyle,
      ...(cutoutImageUrl ? { cutoutImageUrl } : {}),
      ...(sizeReferenceImageUrl !== undefined ? { sizeReferenceImageUrl } : {}),
      ...(compositingImageUrl !== undefined ? { compositingImageUrl } : {}),
      ...(invalidatesPreviews ? { status: "draft" } : {}),
    },
  });

  if (invalidatesPreviews) {
    await db.partSoloPreview.deleteMany({ where: { partId } });
    await generateSoloPreviewsForPart(partId);
  }

  revalidatePath(`/admin/parts/${partId}`);
  revalidatePath("/admin/parts");
  revalidatePath("/");
  redirect(`/admin/parts/${partId}`);
}
