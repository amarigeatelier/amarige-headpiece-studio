import { createHash } from "node:crypto";

/** Stable cache key for a (base photo × set of parts) combination, order-independent. */
export function computeCombinationKey(basePhotoId: string, partIds: string[]): string {
  const sorted = [...partIds].sort();
  return createHash("sha256").update(`${basePhotoId}:${sorted.join(",")}`).digest("hex");
}

export function sortPartIds(partIds: string[]): string[] {
  return [...partIds].sort();
}
