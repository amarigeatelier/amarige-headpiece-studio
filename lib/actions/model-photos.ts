"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { uploadImage, modelPhotoPath } from "@/lib/storage";
import type { AttachmentStyle, HairState, StyleCategory } from "@prisma/client";

export async function createModelBasePhoto(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const styleCategory = String(formData.get("styleCategory") ?? "") as StyleCategory;
  const hairState = String(formData.get("hairState") ?? "") as HairState;
  const attachmentZone = String(formData.get("attachmentZone") ?? "").trim();
  const compatibleAttachmentStyles = formData
    .getAll("compatibleAttachmentStyles")
    .map(String) as AttachmentStyle[];
  const file = formData.get("photo") as File | null;

  if (!label || !attachmentZone || !file || file.size === 0 || compatibleAttachmentStyles.length === 0) {
    throw new Error("必須項目が入力されていません（ラベル・装着位置・写真・対応スタイルは必須）");
  }

  const key = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageUrl = await uploadImage(modelPhotoPath(key, file.name), bytes, file.type || "image/png");

  await db.modelBasePhoto.create({
    data: {
      label,
      styleCategory,
      hairState,
      attachmentZone,
      compatibleAttachmentStyles,
      imageUrl,
      active: true,
    },
  });

  revalidatePath("/admin/model-photos");
  redirect("/admin/model-photos");
}

export async function toggleModelBasePhotoActive(id: string, active: boolean) {
  await db.modelBasePhoto.update({ where: { id }, data: { active } });
  revalidatePath("/admin/model-photos");
}

export async function updateModelBasePhoto(id: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const styleCategory = String(formData.get("styleCategory") ?? "") as StyleCategory;
  const hairState = String(formData.get("hairState") ?? "") as HairState;
  const attachmentZone = String(formData.get("attachmentZone") ?? "").trim();
  const compatibleAttachmentStyles = formData
    .getAll("compatibleAttachmentStyles")
    .map(String) as AttachmentStyle[];
  const file = formData.get("photo") as File | null;
  const defaultAttachmentXPercent = Number(formData.get("defaultAttachmentXPercent"));
  const defaultAttachmentYPercent = Number(formData.get("defaultAttachmentYPercent"));
  const realWidthCm = Number(formData.get("realWidthCm"));

  if (!label || !attachmentZone || compatibleAttachmentStyles.length === 0) {
    throw new Error("必須項目が入力されていません（ラベル・装着位置・対応スタイルは必須）");
  }

  let imageUrl: string | undefined;
  if (file && file.size > 0) {
    const key = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    imageUrl = await uploadImage(modelPhotoPath(key, file.name), bytes, file.type || "image/png");
  }

  await db.modelBasePhoto.update({
    where: { id },
    data: {
      label,
      styleCategory,
      hairState,
      attachmentZone,
      compatibleAttachmentStyles,
      ...(Number.isFinite(defaultAttachmentXPercent) ? { defaultAttachmentXPercent } : {}),
      ...(Number.isFinite(defaultAttachmentYPercent) ? { defaultAttachmentYPercent } : {}),
      ...(Number.isFinite(realWidthCm) && realWidthCm > 0 ? { realWidthCm } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  });

  revalidatePath("/admin/model-photos");
  redirect("/admin/model-photos");
}
