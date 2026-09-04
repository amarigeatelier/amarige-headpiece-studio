// パーツ(花・リボン等)のカットアウト写真の「背景の白」を、photo_correction/reference/ の
// 見本写真の背景色に合わせて補正し、photo_correction/output/ に保存する(クロップなし)。
//
// 背景の検出方法は lib/strip-white-background.ts と同じ「端からの塗りつぶし判定」を流用。
// 画像全体ではなく背景領域だけの色(R/G/Bそれぞれ)を見本と合わせることで、明るさだけでなく
// 白の色味(色かぶり)のズレも揃う。算出したR/G/Bごとの補正カーブは画像全体に適用するので、
// パーツ本体の色も背景と一緒に自然にシフトする。
//
// 使い方:
//   node scripts/photo-correct.mjs
//
// 処理済みの元画像は photo_correction/inbox/processed/ に移動される(重複処理防止)。

import sharp from "sharp";
import { readdir, mkdir, rename } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, "..", "photo_correction");
const REFERENCE_DIR = path.join(BASE_DIR, "reference");
const INBOX_DIR = path.join(BASE_DIR, "inbox");
const PROCESSED_DIR = path.join(INBOX_DIR, "processed");
const OUTPUT_DIR = path.join(BASE_DIR, "output");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// lib/strip-white-background.ts と同じ閾値(近い白/薄いグレーだけを背景とみなす)
const BACKGROUND_MIN_BRIGHTNESS = 200;
const BACKGROUND_MAX_CHANNEL_SPREAD = 25;

// 補正の強さ(1.0で完全一致、0.8なら目標との差の8割だけ寄せる)
const CORRECTION_STRENGTH = 0.8;
// 極端な補正を避けるためのガンマのクリップ範囲(1未満で明るく、1超で暗くなる)
const GAMMA_MIN = 0.7;
const GAMMA_MAX = 1.4;

async function listImages(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function looksLikeBackground(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= BACKGROUND_MIN_BRIGHTNESS && max - min <= BACKGROUND_MAX_CHANNEL_SPREAD;
}

/** 画像の端から塗りつぶし判定で背景領域を検出し、その領域だけのR/G/B平均を返す。
 *  背景が見つからない場合は画像全体の平均にフォールバックする。 */
function backgroundMeans(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function tryEnqueue(x, y) {
    const idx = y * width + x;
    if (visited[idx]) return;
    const p = idx * channels;
    if (!looksLikeBackground(data[p], data[p + 1], data[p + 2])) return;
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

  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  while (head < tail) {
    const idx = queue[head++];
    const p = idx * channels;
    sumR += data[p];
    sumG += data[p + 1];
    sumB += data[p + 2];
    count++;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) tryEnqueue(x - 1, y);
    if (x < width - 1) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y < height - 1) tryEnqueue(x, y + 1);
  }

  if (count === 0) {
    // 背景が検出できない場合は画像全体の平均にフォールバック
    const n = width * height;
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      const p = i * channels;
      sr += data[p];
      sg += data[p + 1];
      sb += data[p + 2];
    }
    return { r: sr / n, g: sg / n, b: sb / n, fallback: true, pixelCount: n };
  }

  return { r: sumR / count, g: sumG / count, b: sumB / count, fallback: false, pixelCount: count };
}

async function readRaw(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

async function computeTargetBackground() {
  const refs = await listImages(REFERENCE_DIR);
  if (refs.length === 0) {
    throw new Error(
      `見本画像が見つかりません: ${REFERENCE_DIR} に理想の仕上がり写真を入れてください。`
    );
  }

  let sumR = 0, sumG = 0, sumB = 0;
  for (const filePath of refs) {
    const { data, width, height, channels } = await readRaw(filePath);
    const bg = backgroundMeans(data, width, height, channels);
    sumR += bg.r;
    sumG += bg.g;
    sumB += bg.b;
  }

  return {
    r: sumR / refs.length,
    g: sumG / refs.length,
    b: sumB / refs.length,
    count: refs.length,
  };
}

function gammaFor(current, target) {
  const currentNorm = current / 255;
  const targetNorm = target / 255;
  let raw = 1.0;
  if (currentNorm > 0 && currentNorm < 1) {
    raw = Math.log(Math.max(targetNorm, 1e-6)) / Math.log(currentNorm);
  }
  const damped = 1.0 + (raw - 1.0) * CORRECTION_STRENGTH;
  return clamp(damped, GAMMA_MIN, GAMMA_MAX);
}

async function correctImage(filePath, target) {
  const { data, width, height, channels } = await readRaw(filePath);
  const currentBg = backgroundMeans(data, width, height, channels);

  const gammaR = gammaFor(currentBg.r, target.r);
  const gammaG = gammaFor(currentBg.g, target.g);
  const gammaB = gammaFor(currentBg.b, target.b);
  const gammas = [gammaR, gammaG, gammaB];

  const luts = gammas.map((gamma) => {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      lut[v] = Math.round(255 * Math.pow(v / 255, gamma));
    }
    return lut;
  });

  for (let i = 0; i < data.length; i += channels) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = luts[c][data[i + c]];
    }
  }

  const image = sharp(data, { raw: { width, height, channels } });
  return { image, gammas, fallback: currentBg.fallback };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(PROCESSED_DIR, { recursive: true });

  let target;
  try {
    target = await computeTargetBackground();
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }

  const targets = await listImages(INBOX_DIR);
  if (targets.length === 0) {
    console.log(`処理対象の画像がありません: ${INBOX_DIR} に写真を入れてください。`);
    return;
  }

  console.log(
    `見本 ${target.count} 枚から算出した目標の背景色: R=${target.r.toFixed(1)} G=${target.g.toFixed(1)} B=${target.b.toFixed(1)}\n`
  );

  for (const filePath of targets) {
    const { image, gammas, fallback } = await correctImage(filePath, target);
    const name = path.basename(filePath);
    const ext = path.extname(name).toLowerCase();
    const outPath = path.join(OUTPUT_DIR, name);

    if (ext === ".png") {
      await image.png().toFile(outPath);
    } else if (ext === ".webp") {
      await image.webp({ quality: 92 }).toFile(outPath);
    } else {
      await image.jpeg({ quality: 92 }).toFile(outPath);
    }

    await rename(filePath, path.join(PROCESSED_DIR, name));

    const gammaStr = gammas.map((g) => g.toFixed(2)).join("/");
    const note = fallback ? "(背景検出できず全体平均で代用)" : "";
    console.log(`${name}: ガンマR/G/B=${gammaStr}${note} -> ${path.relative(BASE_DIR, outPath)}`);
  }

  console.log(`\n完了: ${targets.length}枚を処理しました。出力先: ${OUTPUT_DIR}`);
}

main();
