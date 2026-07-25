"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { generateSingleSoloPreview } from "@/lib/actions/parts";

async function pathForSoloPreview(previewId: string): Promise<string> {
  const preview = await db.partSoloPreview.findUniqueOrThrow({ where: { id: previewId } });
  return `/admin/parts/${preview.partId}`;
}

export async function approveSoloPreview(previewId: string) {
  await db.partSoloPreview.update({ where: { id: previewId }, data: { status: "approved" } });
  revalidatePath(await pathForSoloPreview(previewId));
}

export async function rejectSoloPreview(previewId: string) {
  await db.partSoloPreview.update({ where: { id: previewId }, data: { status: "rejected" } });
  revalidatePath(await pathForSoloPreview(previewId));
}

export async function regenerateSoloPreview(previewId: string) {
  const preview = await db.partSoloPreview.findUniqueOrThrow({ where: { id: previewId } });
  await generateSingleSoloPreview(preview.partId, preview.basePhotoId);
  revalidatePath(`/admin/parts/${preview.partId}`);
}
