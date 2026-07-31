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

// "これを見本に他を再生成" — regenerates every other base photo's preview for this part using
// THIS preview (regardless of whether it's been approved yet) as the scale exemplar, instead of
// only ever borrowing from already-approved results. Saves having to approve first just to get the
// automatic exemplar lookup to kick in, and works even for a part with only one good result so far.
export async function regenerateOthersUsingThisAsExemplar(sourcePreviewId: string) {
  const source = await db.partSoloPreview.findUniqueOrThrow({ where: { id: sourcePreviewId } });
  const others = await db.partSoloPreview.findMany({
    where: { partId: source.partId, id: { not: sourcePreviewId } },
  });
  for (const other of others) {
    await generateSingleSoloPreview(other.partId, other.basePhotoId, undefined, sourcePreviewId);
  }
  revalidatePath(`/admin/parts/${source.partId}`);
}
