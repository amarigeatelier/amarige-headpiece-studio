import sharp from "sharp";

// Cutout part photos are shot on a plain (often slightly off-white/gray, not pure #fff) seamless
// background but are not transparent PNGs. Flood-fills from the image border inward, clearing
// only background pixels that are actually connected to the edge (rather than a flat per-pixel
// threshold), so a pale/neutral-colored interior region of the accessory itself is never mistaken
// for background just because it also happens to be light. Node/sharp port of the browser-canvas
// version at app/admin/parts/PartSizer's stripNearWhiteBackground.
//
// The background color is sampled from THIS photo's own border pixels rather than assumed to be
// near-white in the abstract. An earlier version used a fixed "brightness >= 200, channel spread
// <= 25" rule, which was loose enough to also match pale/cream-colored accessories (white anemone
// petals, a translucent glassy "和玉" ornament) — the flood fill would tunnel straight through the
// accessory's own near-white pixels and eat most of it, leaving only its darker center behind.
// Confirmed directly: a cream anemone flower came out of stripBackgroundFromCutout as little more
// than its dark center. Comparing each pixel's actual distance from the sampled background color
// instead of an absolute brightness/spread rule correctly keeps warm/pale subject colors that are
// still clearly distinguishable from the sampled background, while still erasing the real
// background reliably since it's near-uniform by construction (seamless paper backdrop).
//
// 22 was chosen empirically (tested against three real part photos: a cream anemone, a matte gold
// 和玉, and a lower-quality phone-photographed "compositing image" with slight lighting unevenness)
// as the widest value that still cleanly separates real background from pale accessory colors on
// all three. Known remaining limitation: a soft cast shadow immediately touching the accessory in
// the source photo can measure closer, in plain RGB distance, to the accessory's own pale color
// than to the sampled background — confirmed by direct pixel sampling on the anemone photo, where a
// shadow pixel and a petal highlight pixel were nearly equidistant from the background reference.
// No tolerance value can cleanly separate the two in that situation; raising it further starts
// eating real petal instead. When this shows up as a visible smudge next to a pale accessory, the
// more effective fix is reshooting that specific source photo with less cast shadow (accessory
// slightly elevated off the backdrop, more diffuse lighting), not further tuning this constant.
const BACKGROUND_COLOR_TOLERANCE = 22;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function sampleBackgroundColor(data: Buffer, width: number, height: number): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const pushPixel = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < width; x++) {
    pushPixel(x, 0);
    pushPixel(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushPixel(0, y);
    pushPixel(width - 1, y);
  }
  return [median(rs), median(gs), median(bs)];
}

function colorDistance(r: number, g: number, b: number, ref: [number, number, number]): number {
  const dr = r - ref[0];
  const dg = g - ref[1];
  const db = b - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function stripNearWhiteBackground(data: Buffer, width: number, height: number): void {
  const backgroundColor = sampleBackgroundColor(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function tryEnqueue(x: number, y: number) {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (colorDistance(data[i], data[i + 1], data[i + 2], backgroundColor) > BACKGROUND_COLOR_TOLERANCE) return;
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

// A flat opaque photo (JPG, or a PNG with no real alpha) comes out of .ensureAlpha() with every
// pixel at alpha 255 — any meaningful fraction of substantially-transparent pixels can only mean the
// source file already has real transparency (e.g. background removed in a photo editor before
// upload). 1% is a low bar deliberately: even a tightly-cropped cutout with little empty margin
// still has some transparent border pixels once truly transparent, while a same-color-as-background
// opaque photo has none at all.
const REAL_TRANSPARENCY_ALPHA_THRESHOLD = 10;
const REAL_TRANSPARENCY_MIN_FRACTION = 0.01;

function hasRealTransparency(data: Buffer, width: number, height: number): boolean {
  const pixelCount = width * height;
  let transparentCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] < REAL_TRANSPARENCY_ALPHA_THRESHOLD) transparentCount++;
  }
  return transparentCount / pixelCount >= REAL_TRANSPARENCY_MIN_FRACTION;
}

/**
 * Just the background-stripped, full-resolution cutout — used as the shape-reference image when
 * the draft itself was already built elsewhere (e.g. the admin's client-drawn manual placement in
 * PartSizer.tsx), so only the reference half of buildDeterministicDraft's work is needed.
 *
 * Skips the flood-fill entirely when the source already has real transparency (a photo-editor cutout
 * uploaded as a proper alpha PNG) — running the near-white flood-fill on top of one would be redundant
 * at best, and risks eating soft anti-aliased edge pixels at worst. This is also the fix for the
 * flood-fill's known limitation where a cast shadow close in color to the accessory itself survives
 * as a visible ghost edge (see stripNearWhiteBackground's comment) — a real transparent PNG has no
 * shadow pixels to begin with, so the problem cannot occur there regardless of tolerance tuning.
 */
export async function stripBackgroundFromCutout(cutoutBytes: Uint8Array): Promise<Buffer> {
  const cutoutRaw = await sharp(cutoutBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cutoutRaw;
  if (!hasRealTransparency(data, info.width, info.height)) {
    stripNearWhiteBackground(data, info.width, info.height);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

type ContentBounds = { left: number; top: number; width: number; height: number };

/**
 * Finds the bounding box of the LARGEST connected component of non-transparent pixels, and clears
 * alpha on every smaller component. Two things leave stray opaque pixels scattered outside the real
 * accessory after stripNearWhiteBackground: sensor dust/noise specks (isolated, never touched by its
 * border flood fill since they're not connected to the border) and — more importantly — the fact
 * that the accessory is only ever a fraction of its source photo's frame (ordinary product-photo
 * margin). Confirmed directly: an アネモネ part's real-world-calibrated target width rendered at
 * roughly half its intended size, because the resize step (below) was resizing the ENTIRE cutout
 * canvas — including all the surrounding empty margin — to the target width, not just the flower
 * itself. Cropping first to the actual content's bounding box is what makes targetWidthPercent mean
 * "the accessory is this wide," rather than "the whole source photo, mostly empty margin, is this
 * wide."
 */
function keepLargestComponentBounds(data: Buffer, width: number, height: number): ContentBounds {
  const ALPHA_THRESHOLD = 10;
  const componentId = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  const componentSizes: number[] = [];
  const componentBounds: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (componentId[startIdx] !== -1 || data[startIdx * 4 + 3] < ALPHA_THRESHOLD) continue;

    const id = componentSizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    componentId[startIdx] = id;
    let size = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx - x) / width;
      size++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const tryVisit = (nx: number, ny: number) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
        const nIdx = ny * width + nx;
        if (componentId[nIdx] !== -1 || data[nIdx * 4 + 3] < ALPHA_THRESHOLD) return;
        componentId[nIdx] = id;
        queue[tail++] = nIdx;
      };
      tryVisit(x - 1, y);
      tryVisit(x + 1, y);
      tryVisit(x, y - 1);
      tryVisit(x, y + 1);
    }
    componentSizes.push(size);
    componentBounds.push({ minX, maxX, minY, maxY });
  }

  let largestId = 0;
  for (let i = 1; i < componentSizes.length; i++) {
    if (componentSizes[i] > componentSizes[largestId]) largestId = i;
  }

  for (let idx = 0; idx < width * height; idx++) {
    if (data[idx * 4 + 3] >= ALPHA_THRESHOLD && componentId[idx] !== largestId) {
      data[idx * 4 + 3] = 0;
    }
  }

  const bounds = componentBounds[largestId] ?? { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 };
  return {
    left: bounds.minX,
    top: bounds.minY,
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
  };
}

export const MECHANICAL_COMPOSITE_VERSION = "mechanical-v1";

// Soft alpha falloff at the cutout's edge so the paste boundary doesn't read as a hard-edged sticker.
const FEATHER_SIGMA = 1.4;
// Shadow synthesis: a blurred, dimmed copy of the accessory's own silhouette, offset slightly toward
// the (assumed) light direction, composited underneath. Sigma/opacity/offset are conservative
// starting guesses — enough to read as "resting on hair" without drawing attention to itself.
const SHADOW_OPACITY = 0.32;
const SHADOW_BLUR_SIGMA = 5;
const SHADOW_OFFSET_X_FRACTION = 0.035;
const SHADOW_OFFSET_Y_FRACTION = 0.05;
// Clamp on how far tone-matching is allowed to push the cutout's brightness toward the base photo's
// local ambient brightness, so a wrongly-lit sample region can't wash out or darken the accessory.
const TONE_MATCH_MIN = 0.85;
const TONE_MATCH_MAX = 1.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Perceived luminance (ITU-R BT.709) of an RGB triple, 0-255. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type ClampedPlacement = { left: number; top: number };

function clampPlacement(
  centerXPercent: number,
  centerYPercent: number,
  boxWidth: number,
  boxHeight: number,
  containerWidth: number,
  containerHeight: number
): ClampedPlacement {
  const centerX = Math.round((centerXPercent / 100) * containerWidth);
  const centerY = Math.round((centerYPercent / 100) * containerHeight);
  const left = clamp(centerX - Math.round(boxWidth / 2), 0, Math.max(0, containerWidth - boxWidth));
  const top = clamp(centerY - Math.round(boxHeight / 2), 0, Math.max(0, containerHeight - boxHeight));
  return { left, top };
}

/**
 * Composites a cutout onto a base photo with NO generative-AI step at all: size/position are exact
 * pixel math (from real-world-cm calibration), edge softening and the
 * drop shadow are synthesized deterministically with sharp, and a mild brightness match nudges the
 * cutout toward the base photo's local ambient tone. Replaces the old two-step "deterministic draft
 * + Gemini blend" pipeline for the calibrated/manual-layout paths in lib/actions/parts.ts: the blend
 * step was the actual source of the recurring size-variance complaints (see project memory —
 * Gemini's photorealistic re-render of the accessory drifted in scale call-to-call even when fed a
 * provably-correct draft), so removing it trades a little of Gemini's "hair overlapping the
 * accessory" polish for a guaranteed-exact size on every single generation. Chosen deliberately for
 * bulk part registration (hundreds of parts), where reliability matters more than that last bit of
 * photorealistic nuance, and it also means no Gemini call (no cost, no latency, no retries) for this
 * path at all.
 */
export async function mechanicalComposite(
  baseBytes: Uint8Array,
  cutoutBytes: Uint8Array,
  targetWidthPercent: number,
  centerXPercent: number,
  centerYPercent: number,
  rotationDeg: number = 0
): Promise<Buffer> {
  const baseMeta = await sharp(baseBytes).metadata();
  const baseWidth = baseMeta.width!;
  const baseHeight = baseMeta.height!;
  const targetWidthPx = Math.max(1, Math.round((targetWidthPercent / 100) * baseWidth));

  const strippedCutout = await stripBackgroundFromCutout(cutoutBytes);
  const { data: strippedData, info: strippedInfo } = await sharp(strippedCutout)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Crop to the accessory's actual content — not the full source-photo canvas, which is mostly
  // empty product-photo margin — so targetWidthPercent below sizes the accessory itself, not the
  // accessory-plus-surrounding-whitespace. See keepLargestComponentBounds for the full story.
  const contentBounds = keepLargestComponentBounds(strippedData, strippedInfo.width, strippedInfo.height);
  const CONTENT_PADDING_PX = 4; // a little breathing room for the feather/shadow synthesis below
  const cropLeft = Math.max(0, contentBounds.left - CONTENT_PADDING_PX);
  const cropTop = Math.max(0, contentBounds.top - CONTENT_PADDING_PX);
  const cropWidth = Math.min(strippedInfo.width - cropLeft, contentBounds.width + CONTENT_PADDING_PX * 2);
  const cropHeight = Math.min(strippedInfo.height - cropTop, contentBounds.height + CONTENT_PADDING_PX * 2);
  const trimmedCutout = await sharp(strippedData, {
    raw: { width: strippedInfo.width, height: strippedInfo.height, channels: 4 },
  })
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const trimmedMeta = await sharp(trimmedCutout).metadata();
  const targetHeightPx = Math.max(1, Math.round(targetWidthPx * (trimmedMeta.height! / trimmedMeta.width!)));

  const { data: rgba, info } = await sharp(trimmedCutout)
    .resize(targetWidthPx, targetHeightPx)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixelCount = width * height;

  // Local ambient-tone sample from the base photo, centered on the placement point, roughly the
  // accessory's own footprint — used to nudge the cutout's brightness toward it below.
  const { left: sampleLeft, top: sampleTop } = clampPlacement(
    centerXPercent,
    centerYPercent,
    Math.min(baseWidth, width),
    Math.min(baseHeight, height),
    baseWidth,
    baseHeight
  );
  const sampleStats = await sharp(baseBytes)
    .extract({
      left: sampleLeft,
      top: sampleTop,
      width: Math.min(baseWidth, width) || 1,
      height: Math.min(baseHeight, height) || 1,
    })
    .stats();
  const baseLuminance = luminance(
    sampleStats.channels[0].mean,
    sampleStats.channels[1].mean,
    sampleStats.channels[2].mean
  );

  let cutoutLumaSum = 0;
  let cutoutOpaqueCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 10) continue;
    cutoutLumaSum += luminance(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    cutoutOpaqueCount++;
  }
  const brightnessScale =
    cutoutOpaqueCount > 0
      ? clamp(baseLuminance / (cutoutLumaSum / cutoutOpaqueCount), TONE_MATCH_MIN, TONE_MATCH_MAX)
      : 1;

  // Apply the brightness nudge (RGB only) and split out the alpha channel for feathering/shadow work.
  const toned = Buffer.from(rgba);
  const alpha = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    toned[base] = clamp(Math.round(rgba[base] * brightnessScale), 0, 255);
    toned[base + 1] = clamp(Math.round(rgba[base + 1] * brightnessScale), 0, 255);
    toned[base + 2] = clamp(Math.round(rgba[base + 2] * brightnessScale), 0, 255);
    alpha[i] = rgba[base + 3];
  }

  // .toColourspace("b-w") is required here — without it, sharp silently upconverts a blurred
  // single-channel raw buffer to 3 channels on output, which desyncs every subsequent per-pixel
  // index against the original width*height alpha buffer (confirmed directly: omitting this
  // produced a raw buffer 3x the expected length, and the resulting "feathered" alpha was garbage,
  // making the whole accessory invisible in composited output).
  const featheredAlpha = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(FEATHER_SIGMA)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  for (let i = 0; i < pixelCount; i++) {
    toned[i * 4 + 3] = featheredAlpha[i];
  }
  const featheredCutout = await sharp(toned, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const shadowAlphaSource = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    shadowAlphaSource[i] = Math.round(alpha[i] * SHADOW_OPACITY);
  }
  const shadowAlpha = await sharp(shadowAlphaSource, { raw: { width, height, channels: 1 } })
    .blur(SHADOW_BLUR_SIGMA)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  const shadowRgba = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    shadowRgba[i * 4 + 3] = shadowAlpha[i];
  }
  const shadowLayer = await sharp(shadowRgba, { raw: { width, height, channels: 4 } }).png().toBuffer();

  // Customer-facing tray placement lets the shopper rotate a part (see PartPlacer.tsx) — rotate the
  // already-feathered/shadowed layers (not the raw pixels) so edge softening stays clean, and use the
  // rotated canvas's own (larger) dimensions for placement math below, since sharp's .rotate() expands
  // the canvas to fit rather than cropping corners.
  let placedCutout = featheredCutout;
  let placedShadow = shadowLayer;
  let placedWidth = width;
  let placedHeight = height;
  const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
  if (normalizedRotation !== 0) {
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    placedCutout = await sharp(featheredCutout).rotate(normalizedRotation, { background: transparent }).png().toBuffer();
    placedShadow = await sharp(shadowLayer).rotate(normalizedRotation, { background: transparent }).png().toBuffer();
    const rotatedMeta = await sharp(placedCutout).metadata();
    placedWidth = rotatedMeta.width!;
    placedHeight = rotatedMeta.height!;
  }

  const { left, top } = clampPlacement(centerXPercent, centerYPercent, placedWidth, placedHeight, baseWidth, baseHeight);
  const shadowLeft = clamp(left + Math.round(placedWidth * SHADOW_OFFSET_X_FRACTION), 0, Math.max(0, baseWidth - placedWidth));
  const shadowTop = clamp(top + Math.round(placedHeight * SHADOW_OFFSET_Y_FRACTION), 0, Math.max(0, baseHeight - placedHeight));

  return sharp(baseBytes)
    .composite([
      { input: placedShadow, left: shadowLeft, top: shadowTop },
      { input: placedCutout, left, top },
    ])
    .png()
    .toBuffer();
}

export type MechanicalPlacement = {
  cutoutBytes: Uint8Array;
  targetWidthPercent: number;
  centerXPercent: number;
  centerYPercent: number;
  rotationDeg?: number;
};

/**
 * Composites several parts onto one base photo in sequence — each part's tone-matching sample and
 * placement is computed against the result of the previous step, so a part placed on top of an
 * already-placed one still samples real local pixels (not the pristine empty base). Used for the
 * customer-facing tray configurator, where the "AI worn-on-head photo" step (endlessly finicky to
 * QA per part — see project memory) is replaced entirely: no Gemini call anywhere in this path.
 */
export async function mechanicalCompositeMultiple(
  baseBytes: Uint8Array,
  placements: MechanicalPlacement[]
): Promise<Buffer> {
  let current: Uint8Array = baseBytes;
  for (const p of placements) {
    current = await mechanicalComposite(current, p.cutoutBytes, p.targetWidthPercent, p.centerXPercent, p.centerYPercent, p.rotationDeg ?? 0);
  }
  return current as Buffer;
}

