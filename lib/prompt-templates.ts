/**
 * Versioned compositing prompts. Bump the version string whenever the wording changes
 * so GeneratedPreview.promptVersion lets us tell which rows were made with an old prompt
 * and might be worth regenerating.
 */
export const COMPOSITE_PROMPT_VERSION = "v6";

const SIZE_GUIDANCE_HEADER =
  "参考として、成人女性の頭の横幅（耳から耳まで）はおよそ14〜16cmです。この基準に対して、";
const SIZE_GUIDANCE_FOOTER_BASE =
  "生成でよくある失敗は、アクセサリーを実物より大きく描きすぎることです。頭に対して大きすぎると感じたら、必ずワンサイズ以上小さく調整してください。実物大より小さく見える分には問題ありません。" +
  "また、各パーツの実物サイズはそれぞれ独立して正確に守ってください（他のパーツと似たような大きさに引っ張られないでください）。";

/**
 * Extracts the largest cm figure out of a free-text sizeNote (e.g. "幅約8cm×高さ6.5cm" -> 8)
 * and maps it to a widely-recognizable everyday-object comparison. Independent generations
 * (each part is composited in its own separate API call) have no shared reference to stay
 * consistent with each other, so anchoring to a concrete, universally-known object (a coin,
 * an egg, a palm) gives the model a steadier absolute scale than a bare "cm" figure alone.
 */
function describeSizeComparison(sizeNote: string): string | null {
  const matches = sizeNote.match(/\d+(\.\d+)?/g);
  if (!matches) return null;
  const nums = matches.map(Number).filter((n) => n > 0 && n < 100);
  if (nums.length === 0) return null;
  const cm = Math.max(...nums);

  if (cm <= 2.5) return "1円硬貨（直径2cm）程度の小ささ";
  if (cm <= 4) return "500円硬貨（直径2.65cm）〜卓球ボール（直径4cm）程度の小ささ";
  if (cm <= 6.5) return "鶏卵（縦6cm前後）程度の大きさ";
  if (cm <= 9) return "手のひらの半分程度の大きさ";
  if (cm <= 13) return "手のひら全体程度の大きさ";
  return "手のひらより一回り大きいサイズ";
}

/**
 * `hasSizeReference` — whether an extra "same item photographed next to a coin/ruler" image
 * is included right after the product cutout. Real coin photography is a far more reliable
 * scale anchor than a bare cm figure in text, since independent Gemini calls have no shared
 * reference to stay consistent with each other otherwise.
 */
export function buildCompositePrompt(
  attachmentZone: string,
  sizeNote?: string | null,
  hasSizeReference?: boolean
): string {
  const productImg = 1;
  const refImg = hasSizeReference ? 2 : null;
  const modelImg = hasSizeReference ? 3 : 2;

  const lines = [
    `${modelImg}枚目の画像のモデルの頭の「${attachmentZone}」の位置に、${productImg}枚目の画像に写っているヘアアクセサリーを自然に合成してください。`,
    `${modelImg}枚目の画像の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。`,
    "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。",
    "ヘアアクセサリー以外の物体を追加しないでください。",
  ];

  if (refImg) {
    lines.push(
      `${refImg}枚目の画像は、${productImg}枚目と同じヘアアクセサリーを硬貨や定規などサイズが分かる物と一緒に撮影した「サイズ参考用」の写真です。実物サイズを正確に把握するためだけに使い、${refImg}枚目に写っている硬貨・定規などの物体自体は最終的な合成結果には一切含めないでください。`
    );
  }

  if (sizeNote) {
    const comparison = describeSizeComparison(sizeNote);
    lines.push(
      `${SIZE_GUIDANCE_HEADER}このヘアアクセサリーの実物サイズは「${sizeNote}」であることを正確に守って縮尺を合わせてください。` +
        (comparison ? `具体的には、${comparison}です。` : "")
    );
  }

  if (sizeNote || refImg) {
    lines.push(SIZE_GUIDANCE_FOOTER_BASE);
  }

  return lines.join("\n");
}

export const MULTI_COMPOSITE_PROMPT_VERSION = "v5";

export function buildMultiPartCompositePrompt(
  attachmentZone: string,
  parts: { label: string; sizeNote?: string | null; hasSizeReference?: boolean }[]
): string {
  let n = 1;
  const descriptors: string[] = [];
  let anySizeInfo = false;

  for (const p of parts) {
    const productImg = n++;
    let line = `画像${productImg}: ${p.label}`;
    if (p.sizeNote) {
      const comparison = describeSizeComparison(p.sizeNote);
      line += `（実物サイズ: ${p.sizeNote}${comparison ? `＝${comparison}` : ""}）`;
      anySizeInfo = true;
    }
    descriptors.push(line);

    if (p.hasSizeReference) {
      const refImg = n++;
      descriptors.push(
        `画像${refImg}: 画像${productImg}と同じ「${p.label}」を硬貨等と一緒に撮影したサイズ参考写真（実物サイズ把握のみに使用し、硬貨自体は合成結果に含めない）`
      );
      anySizeInfo = true;
    }
  }
  const modelImg = n; // the base/model photo is always sent last, after every part's image(s)

  const lines = [
    `以下の${parts.length}点のヘアアクセサリーパーツ画像（サイズ参考写真を含む場合あり）を、1つのまとまったヘッドアクセサリーとして自然に組み合わせ、`,
    `画像${modelImg}（最後の画像）のモデルの頭の「${attachmentZone}」の位置に装着した状態で合成してください。`,
    descriptors.join("\n"),
    "各パーツは実際に手作りで組み合わせて着ける際のように、互いに近接し重なり合う自然な配置にしてください。",
    "サイズ参考写真が含まれる場合、それは実物サイズ把握のためだけに使い、合成結果には含めないでください。指定したヘアアクセサリーパーツを1つも省略・重複させず、すべて画像内に含めてください。",
  ];

  if (anySizeInfo) {
    lines.push(
      SIZE_GUIDANCE_HEADER + "各パーツに記載した実物サイズ・比較物のサイズ感、およびサイズ参考写真があればそれを正確に守って縮尺を合わせてください。",
      SIZE_GUIDANCE_FOOTER_BASE
    );
  }

  lines.push(
    `画像${modelImg}の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。`,
    "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。指定したパーツ以外の物体を追加しないでください。"
  );

  return lines.join("\n");
}
