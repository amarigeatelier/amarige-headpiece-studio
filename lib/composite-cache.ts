import { db } from "@/lib/db";

// Marks every cached customer preview that contains this part as stale, so the next generation of
// the same combination is rebuilt with the part's current size instead of replaying the old image.
// Rows are kept (not deleted): purchased orders and pending checkouts still point at them.
export async function invalidateCachedComposites(partId: string): Promise<void> {
  await db.generatedComposite.updateMany({
    where: { partIds: { has: partId }, status: "ready" },
    data: { promptVersion: "stale" },
  });
}
