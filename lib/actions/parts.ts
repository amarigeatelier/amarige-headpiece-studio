"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { uploadImage, cutoutImagePath, sizeReferenceImagePath, soloPreviewImagePath, fetchImageBytes } from "@/lib/storage";
import { composePreview } from "@/lib/gemini";
import { COMPOSITE_PROMPT_VERSION } from "@/lib/prompt-templates";
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
  const displayCategory = String(formData.get("displayCategory") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const addOnPriceJpy = Number(formData.get("addOnPriceJpy"));
  const attachmentStyle = String(formData.get("attachmentStyle") ?? "") as AttachmentStyle;
  const file = formData.get("cutout") as File | null;
  const sizeRefFile = formData.get("sizeReference") as File | null;

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

  const part = await db.part.create({
    data: {
      slug: slugify(name),
      name,
      description,
      sizeNote,
      displayCategory,
      color,
      addOnPriceJpy,
      cutoutImageUrl,
      sizeReferenceImageUrl,
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

export async function generateSingleSoloPreview(partId: string, basePhotoId: string) {
  const [part, basePhoto] = await Promise.all([
    db.part.findUniqueOrThrow({ where: { id: partId } }),
    db.modelBasePhoto.findUniqueOrThrow({ where: { id: basePhotoId } }),
  ]);

  try {
    const [cutout, base, sizeReference] = await Promise.all([
      fetchImageBytes(part.cutoutImageUrl),
      fetchImageBytes(basePhoto.imageUrl),
      part.sizeReferenceImageUrl ? fetchImageBytes(part.sizeReferenceImageUrl) : Promise.resolve(null),
    ]);

    const result = await composePreview({
      cutoutBytes: cutout.bytes,
      cutoutMimeType: cutout.contentType,
      baseBytes: base.bytes,
      baseMimeType: base.contentType,
      attachmentZone: basePhoto.attachmentZone,
      sizeNote: part.sizeNote,
      sizeReferenceBytes: sizeReference?.bytes,
      sizeReferenceMimeType: sizeReference?.contentType,
    });

    const imageUrl = await uploadImage(soloPreviewImagePath(partId, basePhotoId), result.imageBytes, result.mimeType);

    await db.partSoloPreview.upsert({
      where: { partId_basePhotoId: { partId, basePhotoId } },
      create: {
        partId,
        basePhotoId,
        imageUrl,
        status: "pending_review",
        promptVersion: result.promptVersion,
      },
      update: {
        imageUrl,
        status: "pending_review",
        promptVersion: result.promptVersion,
        errorMessage: null,
        generatedAt: new Date(),
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
  const displayCategory = String(formData.get("displayCategory") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const addOnPriceJpy = Number(formData.get("addOnPriceJpy"));
  const attachmentStyle = String(formData.get("attachmentStyle") ?? "") as AttachmentStyle;
  const file = formData.get("cutout") as File | null;
  const sizeRefFile = formData.get("sizeReference") as File | null;

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
  let sizeReferenceImageUrl: string | undefined;
  if (sizeRefFile && sizeRefFile.size > 0) {
    const refKey = crypto.randomUUID();
    const refBytes = new Uint8Array(await sizeRefFile.arrayBuffer());
    sizeReferenceImageUrl = await uploadImage(
      sizeReferenceImagePath(refKey, sizeRefFile.name),
      refBytes,
      sizeRefFile.type || "image/png"
    );
  }

  // Anything that feeds into the compositing prompt (photo, size reference, size note, attachment
  // style) invalidates every prior solo-QA review — the generated images no longer reflect the
  // current inputs.
  const invalidatesPreviews =
    replacingPhoto || replacingSizeReference || sizeNote !== existing.sizeNote || attachmentStyle !== existing.attachmentStyle;

  await db.part.update({
    where: { id: partId },
    data: {
      name,
      description,
      sizeNote,
      displayCategory,
      color,
      addOnPriceJpy,
      attachmentStyle,
      ...(cutoutImageUrl ? { cutoutImageUrl } : {}),
      ...(sizeReferenceImageUrl ? { sizeReferenceImageUrl } : {}),
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
