import { createHash } from "node:crypto";

// Keyed by instanceId (not just partId) — the same part can be selected more than once, and each
// copy has its own independent position, so the cache key must distinguish them too.
export type PartLayout = { instanceId: string; partId: string; xPercent: number; yPercent: number; rotationDeg: number };

// Coarse rounding so trivial pixel-level jitter between two drags of "the same" layout still
// hits the cache, while a genuinely different placement gets its own cache entry. Sorted by
// instanceId (stable per browser session) rather than partId, since two same-partId entries would
// otherwise sort arbitrarily relative to each other and could flip the signature between two
// requests that are actually identical.
function layoutSignature(layout?: PartLayout[]): string {
  if (!layout || layout.length === 0) return "";
  const rounded = [...layout]
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
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
