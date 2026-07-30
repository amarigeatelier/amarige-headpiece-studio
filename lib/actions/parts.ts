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
import { COMPOSITE_PROMPT_VERSION, describeAdjustment } from "@/lib/prompt-templates";
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

  for (const basePhoto of basePhotos) {
    const existing = await db.partSoloPreview.findUnique({
      where: { partId_basePhotoId: { partId, basePhotoId: basePhoto.id } },
    });
    if (existing && existing.status !== "failed") continue;

    await generateSingleSoloPreview(partId, basePhoto.id);
  }

  revalidatePath(`/admin/parts/${partId}`);
}

export async function generateSingleSoloPreview(
  partId: string,
  basePhotoId: string,
  layout?: { bytes: Uint8Array; contentType: string; xPercent?: number; yPercent?: number; widthPercent?: number }
) {
  const [part, basePhoto, existing] = await Promise.all([
    db.part.findUniqueOrThrow({ where: { id: partId } }),
    db.modelBasePhoto.findUniqueOrThrow({ where: { id: basePhotoId } }),
    db.partSoloPreview.findUnique({ where: { partId_basePhotoId: { partId, basePhotoId } } }),
  ]);

  try {
    const hasNewLayout = layout?.xPercent !== undefined && layout?.yPercent !== undefined && layout?.widthPercent !== undefined;
    const hasPreviousLayout =
      existing?.layoutXPercent != null && existing?.layoutYPercent != null && existing?.layoutWidthPercent != null;

    let result: Awaited<ReturnType<typeof composePreview>>;

    if (hasNewLayout && existing?.imageUrl && hasPreviousLayout) {
      // A previous manually-placed generation exists — edit that known-good photo directly
      // instead of recomposing from a crude draft, which is far more reliable for small changes.
      const previous = await fetchImageBytes(existing.imageUrl);
      const adjustmentDescription = describeAdjustment(
        layout!.xPercent! - existing.layoutXPercent!,
        layout!.yPercent! - existing.layoutYPercent!,
        (layout!.widthPercent! / existing.layoutWidthPercent!) * 100
      );
      result = await composePreview({
        mode: "adjust",
        previousResultBytes: previous.bytes,
        previousResultMimeType: previous.contentType,
        adjustmentDescription,
      });
    } else {
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
        layoutBytes: layout?.bytes,
        layoutMimeType: layout?.contentType,
      });
    }

    const imageUrl = await uploadImage(soloPreviewImagePath(partId, basePhotoId), result.imageBytes, result.mimeType);

    const layoutPercents =
      layout?.xPercent !== undefined && layout?.yPercent !== undefined && layout?.widthPercent !== undefined
        ? { layoutXPercent: layout.xPercent, layoutYPercent: layout.yPercent, layoutWidthPercent: layout.widthPercent }
        : undefined;

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
