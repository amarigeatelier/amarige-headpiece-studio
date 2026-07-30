import { createHash } from "node:crypto";

export type PartLayout = { partId: string; xPercent: number; yPercent: number; rotationDeg: number };

// Coarse rounding so trivial pixel-level jitter between two drags of "the same" layout still
// hits the cache, while a genuinely different placement gets its own cache entry.
function layoutSignature(layout?: PartLayout[]): string {
  if (!layout || layout.length === 0) return "";
  const rounded = [...layout]
    .sort((a, b) => a.partId.localeCompare(b.partId))
    .map((l) => `${l.partId}:${Math.round(l.xPercent / 2) * 2}:${Math.round(l.yPercent / 2) * 2}:${Math.round(l.rotationDeg / 10) * 10}`);
  return rounded.join(",");
}

/** Stable cache key for a (base photo × set of parts × layout) combination, order-independent. */
export function computeCombinationKey(basePhotoId: string, partIds: string[], layout?: PartLayout[]): string {
  const sorted = [...partIds].sort();
  return createHash("sha256")
    .update(`${basePhotoId}:${sorted.join(",")}:${layoutSignature(layout)}`)
    .digest("hex");
}

export function sortPartIds(partIds: string[]): string[] {
  return [...partIds].sort();
}
