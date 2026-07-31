/**
 * Versioned compositing prompts. Bump the version string whenever the wording changes
 * so GeneratedPreview.promptVersion lets us tell which rows were made with an old prompt
 * and might be worth regenerating.
 */
export const COMPOSITE_PROMPT_VERSION = "v14";

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
/**
 * `hasExemplar` — whether an extra "different accessory correctly scaled on a different model"
 * completed example image is included. Empirically the single most effective scale anchor:
 * text cm figures and even a coin reference photo still left results oversized in testing,
 * but showing Gemini one finished example of "this is what correct looks like" fixed it.
 */
function exemplarInstruction(exemplarImg: number, modelImg: number): string {
  return (
    `${exemplarImg}枚目の画像は、（今回合成するものとは別の）ヘアアクセサリーを別のモデルの髪に正しい縮尺・自然な配置で装着した「お手本」の完成例です。` +
    `デザインの違いは無視して構いませんが、アクセサリーと髪全体・頭全体とのサイズ比率、および髪に埋もれるように自然になじんでいる配置感を絶対的な基準にしてください。` +
    `${exemplarImg}枚目の縮尺感を、${modelImg}枚目のモデルに対しても同じように再現してください。`
  );
}

// Legacy fallback prompt for parts/base photos without a real-world cm measurement registered yet
// (see CompositeFromScratchInput in lib/gemini.ts) — Gemini judges scale itself from text/coin/
// exemplar hints. Prefer buildBlendPrompt whenever calibration data lets us compute size ourselves.
export function buildCompositePrompt(
  attachmentZone: string,
  sizeNote?: string | null,
  hasSizeReference?: boolean,
  hasExemplar?: boolean
): string {
  const productImg = 1;
  let next = 2;
  const refImg = hasSizeReference ? next++ : null;
  const exemplarImg = hasExemplar ? next++ : null;
  const modelImg = next;

  const lines = [
    `${modelImg}枚目の画像のモデルの頭の「${attachmentZone}」の位置に、${productImg}枚目の画像に写っているヘアアクセサリーを自然に合成してください。`,
    `${modelImg}枚目の画像の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。`,
    "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。",
    "ヘアアクセサリー以外の物体を追加しないでください。",
    "コーム・ピン・クリップなどの装着部分（金属や樹脂の針金・土台）は、最終的な合成結果に一切描かないでください。毛先や毛束の隙間からわずかに覗く・突き出て見える状態も不可とし、完全に毛の中に埋もれて見えないものとして扱ってください。見える部分は花やリボンなどの装飾部分のみにしてください。",
    `${productImg}枚目の画像に写っているヘアアクセサリーの向き（上下・左右の回転や、パーツが伸びていく方向）は、できる限りそのまま保ってください。自然な装着のためにわずかに角度を調整するのは構いませんが、不必要に回転させたり反転させたりしないでください。`,
  ];

  if (refImg) {
    lines.push(
      `${refImg}枚目の画像は、${productImg}枚目と同じヘアアクセサリーを硬貨や定規などサイズが分かる物と一緒に撮影した「サイズ参考用」の写真です。実物サイズを正確に把握するためだけに使い、${refImg}枚目に写っている硬貨・定規などの物体自体は最終的な合成結果には一切含めないでください。`
    );
  }

  if (exemplarImg) {
    lines.push(exemplarInstruction(exemplarImg, modelImg));
  }

  if (sizeNote) {
    const comparison = describeSizeComparison(sizeNote);
    lines.push(
      `${SIZE_GUIDANCE_HEADER}このヘアアクセサリーの実物サイズは「${sizeNote}」であることを正確に守って縮尺を合わせてください。` +
        (comparison ? `具体的には、${comparison}です。` : "")
    );
  }

  if (sizeNote || refImg || exemplarImg) {
    lines.push(SIZE_GUIDANCE_FOOTER_BASE);
  }

  return lines.join("\n");
}

export const BLEND_PROMPT_VERSION = "v1";

/**
 * Prompt for the deterministic-composite pipeline (see lib/deterministic-composite.ts): the
 * accessory's size/position is already computed exactly from real-world cm measurements and
 * pasted into image 1, so Gemini's only job is making that composite look photorealistic —
 * not judging scale at all, which text/coin/exemplar-based prompting proved unreliable at even
 * with strong wording (verified: an explicit "shrink to 5%" instruction still rendered oversized).
 *
 * `hasShapeReference` — an undownsized copy of the cutout, since a part shrunk to its correct
 * real-world size in image 1 can become too small to read accurately (a delicate flower spray
 * was misread as a generic star shape without this). The extra "don't draw image 2 itself, it's
 * reference only" instruction exists because an earlier version without it caused Gemini to render
 * the accessory a second time at the reference photo's own (much larger) scale.
 */
export function buildBlendPrompt(hasShapeReference: boolean): string {
  if (!hasShapeReference) {
    return [
      "この画像は、ヘアアクセサリーを既に正しい最終的な大きさ・位置に貼り付けた合成写真です（大きさ・位置は既に確定しており、変更の必要はありません）。",
      "あなたの仕事は、この画像を自然な一枚の写真に見えるように仕上げることだけです：",
      "・アクセサリーの縁を髪になじませ、境界線や貼り付けた感じ（不自然な輪郭・浮いた影）をなくす",
      "・写真全体の光の当たり方・色味に合わせて、アクセサリーの陰影を自然に描き直す",
      "・必要であれば、アクセサリーの一部に髪の毛が自然に重なっているように見せる",
      "重要：アクセサリーの大きさ・位置・向き・デザイン・色は絶対に変更しないでください。モデルの顔・髪型・肌・背景・衣装も変更しないでください。",
      "コーム・ピン・クリップなどの装着部分（金属や樹脂の針金・土台）が画像に写っていても、最終的な仕上がりには一切描かないでください。",
    ].join("\n");
  }
  return [
    "1枚目の画像は、ヘアアクセサリーを既に正しい最終的な大きさ・位置に貼り付けた合成写真です（大きさ・位置は既に確定しており、変更の必要はありません）。",
    "2枚目の画像は、そのアクセサリー単体を大きく写した「デザイン確認用」の資料です。2枚目はあくまで形・色を確認するためだけのものであり、完成写真に登場する被写体ではありません。",
    "あなたの仕事は、1枚目を自然な一枚の写真に見えるように仕上げることだけです：",
    "・アクセサリーの縁を髪になじませ、境界線や貼り付けた感じ（不自然な輪郭・浮いた影）をなくす",
    "・写真全体の光の当たり方・色味に合わせて、アクセサリーの陰影を自然に描き直す",
    "・必要であれば、アクセサリーの一部に髪の毛が自然に重なっているように見せる",
    "・アクセサリーの細かい形（花や葉の形・配置・色）が1枚目では小さくて潰れて見えても、2枚目を参考に、同じデザインを保ったまま正確に描いてください",
    "重要：完成写真に写るアクセサリーは、1枚目に写っている、その1箇所・その大きさのものだけです。2枚目の画像そのもの、または2枚目のような大きな複製を、完成写真のどこにも新たに描き加えないでください。頭の中に2つ以上のアクセサリーが写ってはいけません。",
    "アクセサリーの大きさ・位置は1枚目のまま絶対に変更しないでください。モデルの顔・髪型・肌・背景・衣装も変更しないでください。",
    "コーム・ピン・クリップなどの装着部分（金属や樹脂の針金・土台）がどちらかの画像に写っていても、最終的な仕上がりには一切描かないでください。",
  ].join("\n");
}

export const MULTI_COMPOSITE_PROMPT_VERSION = "v13";

export function buildMultiPartCompositePrompt(
  attachmentZone: string,
  parts: { label: string; sizeNote?: string | null; hasSizeReference?: boolean }[],
  hasExemplar?: boolean,
  hasLayout?: boolean
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

  const exemplarImg = hasExemplar ? n++ : null;
  const layoutImg = hasLayout ? n++ : null;
  const modelImg = n; // the base/model photo is always sent last, after every part's image(s), the exemplar, and the layout draft (if any)

  const lines = [
    `以下の${parts.length}点のヘアアクセサリーパーツ画像（サイズ参考写真を含む場合あり）を、1つのまとまったヘッドアクセサリーとして自然に組み合わせ、`,
    `画像${modelImg}（最後の画像）のモデルの頭の「${attachmentZone}」の位置に装着した状態で合成してください。`,
    descriptors.join("\n"),
    "複数パーツを装着する場合、実際にヘアアクセサリーを手作りで組み合わせるときのように、全体でひとまとまりの装飾に見えるよう配置してください。" +
      "ただし、すべてのパーツを完全に同じ一点に積み重ねるのは不自然です。指定された装着位置の範囲内で、各パーツの中心が少しずつ異なる位置に来るように自然にずらして配置し、端同士が触れ合う・軽く重なる程度に留めてください。",
    "サイズ参考写真が含まれる場合、それは実物サイズ把握のためだけに使い、合成結果には含めないでください。指定したヘアアクセサリーパーツを1つも省略・重複させず、すべて画像内に含めてください。",
  ];

  if (exemplarImg) {
    lines.push(exemplarInstruction(exemplarImg, modelImg));
    anySizeInfo = true;
  }

  if (layoutImg) {
    lines.push(
      `${layoutImg}枚目の画像は、お客様が各パーツをどこにどの向きで配置したいかを指定した「配置の下書き」です（切り抜き画像をそのまま貼り付けただけの粗い見た目で、継ぎ目や貼り付け感は無視して構いません）。` +
        `${layoutImg}枚目に示された各パーツの位置関係・向きを最優先の基準とし、上記の「重ねすぎず散らして配置する」という一般的な指示より${layoutImg}枚目の指定を優先してください。位置・向きはこの下書きに従いつつ、仕上がりだけを写実的で自然なものにしてください。` +
        `ただし${layoutImg}枚目に写っている各パーツの「大きさ」は必ずしも正確とは限らないため、大きさの判断は各パーツについて別途記載した実物サイズ・サイズ参考写真を優先し、位置・向きのみを${layoutImg}枚目から読み取ってください。` +
        `また、${layoutImg}枚目にコーム・ピン・クリップなどの装着部分（金属や樹脂の針金・土台）が写り込んでいても、それは無視してください。装着部分は下記の指示どおり常に完全に非表示にし、花やリボンなどの装飾部分だけを描いてください。`
    );
  }

  if (anySizeInfo) {
    lines.push(
      SIZE_GUIDANCE_HEADER + "各パーツに記載した実物サイズ・比較物のサイズ感、およびサイズ参考写真・お手本画像があればそれを正確に守って縮尺を合わせてください。",
      SIZE_GUIDANCE_FOOTER_BASE
    );
  }

  lines.push(
    `画像${modelImg}の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。`,
    "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。指定したパーツ以外の物体を追加しないでください。",
    "コーム・ピン・クリップなどの装着部分（金属や樹脂の針金・土台）は、最終的な合成結果に一切描かないでください。毛先や毛束の隙間からわずかに覗く・突き出て見える状態も不可とし、完全に毛の中に埋もれて見えないものとして扱ってください。見える部分は花やリボンなどの装飾部分のみにしてください。",
    "各パーツ画像に写っている向き（上下・左右の回転や、パーツが伸びていく方向）は、できる限りそのまま保ってください。自然な装着のためにわずかに角度を調整するのは構いませんが、不必要に回転させたり反転させたりしないでください。"
  );

  return lines.join("\n");
}
