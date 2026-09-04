// グリーンバックで撮影したパーツ(花・リボン等)の写真から、背景を透明にしたPNGを作る。
// green_screen/inbox/ に写真を入れて実行すると、green_screen/output/ に透過PNGが出力される。
//
// 使い方:
//   node scripts/remove-green-background.mjs
//   (または npm run remove-green-background)
//
// 処理済みの元画像は green_screen/inbox/processed/ に移動される(重複処理防止)。
//
// 背景の判定方法(白背景の photo-correct.mjs / lib/strip-white-background.ts とは別方式):
// 白背景の判定は「白に近い色かどうか」だが、緑背景は色そのもの(色相)で判定した方が、影が
// ついても(暗い緑のまま)安定して背景と判定できる。四隅の小さな領域から背景の色ベクトルを
// 推定し、各ピクセルの色ベクトルとの「向きの近さ(コサイン類似度)」で背景/被写体を判定する
// (明るさが変わっても色の向きはほぼ変わらないので、影に強い)。
//
// その後、「花の塊とつながっている最大の領域」だけを残すことで、背景に写り込んだ台の縁や
// 糸くずなど、花から離れた小さなゴミを自動的に除外する。

import sharp from "sharp";
import { readdir, mkdir, rename } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, "..", "green_screen");
const INBOX_DIR = path.join(BASE_DIR, "inbox");
const PROCESSED_DIR = path.join(INBOX_DIR, "processed");
const OUTPUT_DIR = path.join(BASE_DIR, "output");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// 背景と判定するコサイン類似度のしきい値(この間はなだらかにフェザー)。
// 高いほど「本当に背景色そっくりな部分だけ」を透明にする(緩めると際どい色も消えやすくなる)。
const BG_SIMILARITY_FULLY_BACKGROUND = 0.985;
const BG_SIMILARITY_FULLY_FOREGROUND = 0.93;

// これより暗い(ほぼ黒に近い)ピクセルは色の向きが不安定なので、背景判定をせず被写体として残す
// (アネモネの黒い中心など、花自体の暗い部分を誤って消さないため)。
const DARK_PIXEL_BRIGHTNESS_FLOOR = 30;

// 緑かぶり(スピル)対策: 前景として残すピクセルのうち、G が R・B よりかなり強い場合だけ、
// G を R・B の水準まで軽く抑える(花本来の色が G 優位になることは基本ないので安全)。
const SPILL_SUPPRESSION_RATIO = 1.15;

// 縁のピクセルのうちこの割合以上が同じ色(=推定した背景色)でなければ、「グリーンボードが
// 画面全体を覆いきれていない(床・手・別の物が写り込んでいる)」可能性が高いとみなし、警告して
// スキップする(誤った切り抜き結果を黙って出力しないため)。
const MIN_BORDER_CONFIDENCE = 0.7;
// 上記をすり抜けても、切り抜き結果が元の写真とほとんど同じ大きさ(=ほぼ何も透明にならなかった)
// 場合も、同様に失敗とみなす。
const MAX_CROPPED_AREA_FRACTION = 0.85;

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

const BORDER_THICKNESS_PX = 3;
const HISTOGRAM_BUCKET_SIZE = 8;

function cosineSimilarity(r1, g1, b1, r2, g2, b2) {
  const dot = r1 * r2 + g1 * g2 + b1 * b2;
  const n1 = Math.sqrt(r1 * r1 + g1 * g1 + b1 * b1);
  const n2 = Math.sqrt(r2 * r2 + g2 * g2 + b2 * b2);
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (n1 * n2);
}

/**
 * 画像の縁(数px)全体を見て、背景色の推定値と、その推定にどれだけ自信があるか(confidence)を
 * 返す。四隅だけを見る方式だと、たまたま台の縁や手など背景以外のものが1つの角に写り込んで
 * いた場合に平均が大きく狂ってしまう(実際に検証用の合成画像でこの問題が起きた)。
 *
 * 2段階で計算する:
 *  1. 縁のピクセルを粗くヒストグラム化し、最も多いバケツの平均色を「背景色の仮推定」とする
 *     (実写真はノイズ・グラデーションで色が微妙にばらつくため、これ単体を「多数派の割合」と
 *     見なすとバケツが細かく分散し、実際には均一な背景でもconfidenceが不当に低くなってしまう
 *     ―― これも検証用の実写真で見つかった問題)。
 *  2. その仮推定に対する「色の向きの近さ(コサイン類似度)」が高い(=同じ色の系統)縁ピクセルの
 *     割合を、実際のconfidenceとする。本物のグリーンバックの縁は色の向きがほぼ揃っているので、
 *     多少のノイズがあっても高いconfidenceになる。床や手など別の物が縁の広い範囲を占めている
 *     場合だけ、低いconfidenceになる。
 */
function sampleCornerBackground(data, width, height, channels) {
  const counts = new Map();
  const borderPixels = [];

  function addPixel(x, y) {
    const p = (y * width + x) * channels;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    borderPixels.push(r, g, b);
    const key =
      Math.round(r / HISTOGRAM_BUCKET_SIZE) * 1_000_000 +
      Math.round(g / HISTOGRAM_BUCKET_SIZE) * 1_000 +
      Math.round(b / HISTOGRAM_BUCKET_SIZE);
    const entry = counts.get(key);
    if (entry) {
      entry.sumR += r;
      entry.sumG += g;
      entry.sumB += b;
      entry.count += 1;
    } else {
      counts.set(key, { sumR: r, sumG: g, sumB: b, count: 1 });
    }
  }

  for (let y = 0; y < height; y++) {
    for (let t = 0; t < BORDER_THICKNESS_PX; t++) {
      addPixel(t, y);
      addPixel(width - 1 - t, y);
    }
  }
  for (let x = 0; x < width; x++) {
    for (let t = 0; t < BORDER_THICKNESS_PX; t++) {
      addPixel(x, t);
      addPixel(x, height - 1 - t);
    }
  }

  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  const bg = { r: best.sumR / best.count, g: best.sumG / best.count, b: best.sumB / best.count };

  let similarCount = 0;
  const pixelCount = borderPixels.length / 3;
  for (let i = 0; i < pixelCount; i++) {
    const r = borderPixels[i * 3], g = borderPixels[i * 3 + 1], b = borderPixels[i * 3 + 2];
    if (cosineSimilarity(r, g, b, bg.r, bg.g, bg.b) >= BG_SIMILARITY_FULLY_FOREGROUND) similarCount++;
  }

  return { ...bg, confidence: similarCount / pixelCount };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 各ピクセルの背景らしさから、そのままアルファ値(0=透明〜255=不透明)を計算する。 */
function computeAlpha(data, width, height, bg) {
  const pixelCount = width * height;
  const alpha = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const brightness = r + g + b;

    if (brightness < DARK_PIXEL_BRIGHTNESS_FLOOR) {
      alpha[i] = 255;
      continue;
    }

    const similarity = cosineSimilarity(r, g, b, bg.r, bg.g, bg.b);
    // similarity が高い(背景そっくり)ほど背景寄り = 不透明度は低い
    const backgroundness = smoothstep(BG_SIMILARITY_FULLY_FOREGROUND, BG_SIMILARITY_FULLY_BACKGROUND, similarity);
    alpha[i] = Math.round((1 - backgroundness) * 255);
  }

  return alpha;
}

/** アルファが 0 でない画素同士(上下左右)を同じ領域とみなし、最大の連結領域だけを残す
 *  (背景に写り込んだ台の縁・糸くず等、花本体から離れた小さなゴミを除外するため)。 */
function keepLargestComponent(alpha, width, height) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let bestSize = 0;
  let bestVisited = null;

  for (let start = 0; start < pixelCount; start++) {
    if (visited[start] || alpha[start] === 0) continue;

    const componentVisited = new Uint8Array(pixelCount);
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    componentVisited[start] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || visited[n] || alpha[n] === 0) continue;
        visited[n] = 1;
        componentVisited[n] = 1;
        queue[tail++] = n;
      }
    }

    if (tail > bestSize) {
      bestSize = tail;
      bestVisited = componentVisited;
    }
  }

  if (!bestVisited) return alpha;

  const result = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    result[i] = bestVisited[i] ? alpha[i] : 0;
  }
  return result;
}

function boundingBoxOf(alpha, width, height) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  const margin = Math.round(Math.max(width, height) * 0.02);
  return {
    left: Math.max(0, left - margin),
    top: Math.max(0, top - margin),
    right: Math.min(width - 1, right + margin),
    bottom: Math.min(height - 1, bottom + margin),
  };
}

function suppressSpill(data, alpha, width, height) {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    if (alpha[i] === 0) continue;
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const maxRB = Math.max(r, b);
    if (g > maxRB * SPILL_SUPPRESSION_RATIO && maxRB > 0) {
      data[p + 1] = Math.round(maxRB * 1.05);
    }
  }
}

async function processImage(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const bg = sampleCornerBackground(data, width, height, 4);
  if (bg.confidence < MIN_BORDER_CONFIDENCE) {
    return { failed: "background_uncertain", bg };
  }

  let alpha = computeAlpha(data, width, height, bg);
  alpha = keepLargestComponent(alpha, width, height);
  suppressSpill(data, alpha, width, height);

  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = alpha[i];
  }

  const bounds = boundingBoxOf(alpha, width, height);
  if (!bounds) {
    return { failed: "no_subject", bg };
  }

  const croppedArea = (bounds.right - bounds.left + 1) * (bounds.bottom - bounds.top + 1);
  if (croppedArea / (width * height) > MAX_CROPPED_AREA_FRACTION) {
    return { failed: "crop_too_large", bg };
  }

  const image = sharp(data, { raw: { width, height, channels: 4 } }).extract({
    left: bounds.left,
    top: bounds.top,
    width: bounds.right - bounds.left + 1,
    height: bounds.bottom - bounds.top + 1,
  });

  return { image, bg };
}

const FAILURE_MESSAGES = {
  background_uncertain:
    "背景の色を一つに決められませんでした。グリーンボードが写真の端から端まで写っているか(床や手など他の物が写り込んでいないか)確認してください。",
  no_subject: "被写体を検出できませんでした。背景色や写真の明るさを確認してください。",
  crop_too_large:
    "切り抜き結果が元の写真とほぼ同じ大きさになりました。グリーンボードが写真の端から端まで写っているか確認してください。",
};

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(PROCESSED_DIR, { recursive: true });

  const targets = await listImages(INBOX_DIR);
  if (targets.length === 0) {
    console.log(`処理対象の画像がありません: ${INBOX_DIR} に写真を入れてください。`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const filePath of targets) {
    const name = path.basename(filePath);
    const outName = path.basename(name, path.extname(name)) + ".png";
    const outPath = path.join(OUTPUT_DIR, outName);

    const result = await processImage(filePath);
    if (result.failed) {
      // 失敗した元画像は processed/ に移動しない — inbox に残しておけば、撮り直し不要な場合は
      // そのまま再実行するだけでよい。
      console.log(`${name}: ✗ ${FAILURE_MESSAGES[result.failed]}`);
      failed++;
      continue;
    }
    await result.image.png().toFile(outPath);
    await rename(filePath, path.join(PROCESSED_DIR, name));
    console.log(
      `${name}: 推定背景色 R=${result.bg.r.toFixed(0)} G=${result.bg.g.toFixed(0)} B=${result.bg.b.toFixed(0)} -> ${path.relative(BASE_DIR, outPath)}`
    );
    succeeded++;
  }

  console.log(`\n完了: ${succeeded}枚を処理しました${failed > 0 ? `(${failed}枚は失敗、inboxに残したままです)` : ""}。出力先: ${OUTPUT_DIR}`);
}

main();
