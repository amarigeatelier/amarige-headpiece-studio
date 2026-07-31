import sharp from "sharp";

// Cutout part photos are shot on a plain (often slightly off-white/gray, not pure #fff) seamless
// background but are not transparent PNGs. Flood-fills from the image border inward, clearing
// only background pixels that are actually connected to the edge (rather than a flat per-pixel
// threshold), so a pale/neutral-colored interior region of the accessory itself is never mistaken
// for background just because it also happens to be light. Node/sharp port of the browser-canvas
// version at app/admin/parts/PartSizer's stripNearWhiteBackground.
const BACKGROUND_MIN_BRIGHTNESS = 200;
const BACKGROUND_MAX_CHANNEL_SPREAD = 25;

function looksLikeBackground(r: number, g: number, b: number): boolean {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= BACKGROUND_MIN_BRIGHTNESS && max - min <= BACKGROUND_MAX_CHANNEL_SPREAD;
}

function stripNearWhiteBackground(data: Buffer, width: number, height: number): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function tryEnqueue(x: number, y: number) {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!looksLikeBackground(data[i], data[i + 1], data[i + 2])) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  }

  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) tryEnqueue(x - 1, y);
    if (x < width - 1) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y < height - 1) tryEnqueue(x, y + 1);
  }
}

/**
 * Just the background-stripped, full-resolution cutout — used as the shape-reference image when
 * the draft itself was already built elsewhere (e.g. the admin's client-drawn manual placement in
 * PartSizer.tsx), so only the reference half of buildDeterministicDraft's work is needed.
 */
export async function stripBackgroundFromCutout(cutoutBytes: Uint8Array): Promise<Buffer> {
  const cutoutRaw = await sharp(cutoutBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cutoutRaw;
  stripNearWhiteBackground(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export type DeterministicDraft = {
  draftBytes: Buffer;
  // Cutout with its background stripped, at full original resolution — sent to Gemini a second
  // time as an undownsized shape reference, since a part shrunk to its correct real-world size in
  // the draft can become too small/detailed to read accurately (verified in testing: a delicate
  // baby's-breath spray shrunk to ~48px was misread as a generic star shape without this).
  shapeReferenceBytes: Buffer;
};

/**
 * Composites a cutout onto a base photo at an exact pixel size/position, computed by the caller
 * (typically from real-world cm measurements) rather than left to Gemini to guess. This is the
 * "draft" reference image that tells Gemini the confirmed, non-negotiable size/position — Gemini's
 * only remaining job (see buildBlendPrompt) is making it look photorealistic, not deciding scale.
 */
export async function buildDeterministicDraft(
  baseBytes: Uint8Array,
  cutoutBytes: Uint8Array,
  targetWidthPercent: number,
  centerXPercent: number,
  centerYPercent: number
): Promise<DeterministicDraft> {
  const baseMeta = await sharp(baseBytes).metadata();
  const baseWidth = baseMeta.width!;
  const baseHeight = baseMeta.height!;
  const targetWidthPx = Math.max(1, Math.round((targetWidthPercent / 100) * baseWidth));

  const shapeReferenceBytes = await stripBackgroundFromCutout(cutoutBytes);
  const cutoutMeta = await sharp(shapeReferenceBytes).metadata();
  const targetHeightPx = Math.max(1, Math.round(targetWidthPx * (cutoutMeta.height! / cutoutMeta.width!)));
  const resizedCutout = await sharp(shapeReferenceBytes).resize(targetWidthPx, targetHeightPx).png().toBuffer();

  const centerX = Math.round((centerXPercent / 100) * baseWidth);
  const centerY = Math.round((centerYPercent / 100) * baseHeight);
  const left = Math.max(0, Math.min(baseWidth - targetWidthPx, centerX - Math.round(targetWidthPx / 2)));
  const top = Math.max(0, Math.min(baseHeight - targetHeightPx, centerY - Math.round(targetHeightPx / 2)));

  const draftBytes = await sharp(baseBytes)
    .composite([{ input: resizedCutout, left, top }])
    .png()
    .toBuffer();

  return { draftBytes, shapeReferenceBytes };
}
