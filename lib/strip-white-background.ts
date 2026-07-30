// Browser-only Canvas API — call only from "use client" components.
//
// Cutout part photos are shot on a plain (often slightly off-white/gray, not pure #fff) seamless
// background but are not transparent PNGs, so naively drawImage()-ing one into a layout draft
// leaves a visible box around the part. Gemini reads that box as part of the shape, not just
// background — a very plausible driver of the "配置の下書き" mechanism's sizing/shape confusion.
//
// Flood-fills from the image border inward, clearing only background pixels that are actually
// connected to the edge (rather than a flat per-pixel threshold), so a pale/neutral-colored
// interior region of the accessory itself is never mistaken for background just because it also
// happens to be light. This draft image is never shown to a human (the prompt already says
// "rough, ignore seams"), so a generous threshold is fine here even though a stricter one was
// wanted for the human-visible admin PartSizer overlay in an earlier session.
const BACKGROUND_MIN_BRIGHTNESS = 200;
const BACKGROUND_MAX_CHANNEL_SPREAD = 25;

function looksLikeBackground(r: number, g: number, b: number): boolean {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= BACKGROUND_MIN_BRIGHTNESS && max - min <= BACKGROUND_MAX_CHANNEL_SPREAD;
}

export function stripNearWhiteBackground(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
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

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
