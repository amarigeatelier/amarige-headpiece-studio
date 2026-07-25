// Manually re-runs the solo-QA compositing for one Part x ModelBasePhoto pair, using the
// current (v5) prompt wording, bypassing the admin UI (used to verify prompt changes directly).
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const [, , partId, basePhotoId] = process.argv;
if (!partId || !basePhotoId) {
  console.error("Usage: node scripts/regenerate-solo.mjs <partId> <basePhotoId>");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "previews";

const [part, basePhoto] = await Promise.all([
  prisma.part.findUniqueOrThrow({ where: { id: partId } }),
  prisma.modelBasePhoto.findUniqueOrThrow({ where: { id: basePhotoId } }),
]);

function describeSizeComparison(sizeNote) {
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

const SIZE_GUIDANCE_HEADER = "参考として、成人女性の頭の横幅（耳から耳まで）はおよそ14〜16cmです。この基準に対して、";
const SIZE_GUIDANCE_FOOTER =
  "生成でよくある失敗は、アクセサリーを実物より大きく描きすぎることです。頭に対して大きすぎると感じたら、必ずワンサイズ以上小さく調整してください。実物大より小さく見える分には問題ハリません。" +
  "また、各パーツの実物サイズはそれぞれ独立して正確に守ってください（他のパーツと似たような大きさに引っ張られないでください）。" +
  "もしヘアアクセサリーの写真に硬貨・定規など明らかにサイズの基準となる物体が一緒に写っている場合は、それを最優先の実寸基準として使い、その基準物体自体は最終的な合成結果には含めないでください。";

const lines = [
  `1枚目の画像に写っているヘアアクセサリーを、2枚目の画像のモデルの頭の「${basePhoto.attachmentZone}」の位置に自然に合成してください。`,
  "2枚目の画像の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。",
  "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。",
  "ヘアアクセサリー以外の物体を追加しないでください。",
];
if (part.sizeNote) {
  const comparison = describeSizeComparison(part.sizeNote);
  lines.push(
    `${SIZE_GUIDANCE_HEADER}このヘアアクセサリーの実物サイズは「${part.sizeNote}」であることを正確に守って縮尺を合わせてください。` +
      (comparison ? `具体的には、${comparison}です。` : "")
  );
  lines.push(SIZE_GUIDANCE_FOOTER);
}
const prompt = lines.join("\n");
console.log("PROMPT:\n", prompt, "\n---");

async function fetchBytes(url) {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytes: buf, contentType };
}

const [cutout, base] = await Promise.all([fetchBytes(part.cutoutImageUrl), fetchBytes(basePhoto.imageUrl)]);

console.log("Calling Gemini...");
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: cutout.contentType, data: cutout.bytes.toString("base64") } },
        { inlineData: { mimeType: base.contentType, data: base.bytes.toString("base64") } },
      ],
    },
  ],
});

const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
if (!imagePart?.inlineData?.data) throw new Error("no image returned");

const resultBytes = Buffer.from(imagePart.inlineData.data, "base64");
const path = `part-solo-previews/${partId}/${basePhotoId}.png`;
const { error } = await supabase.storage.from(bucket).upload(path, resultBytes, { contentType: "image/png", upsert: true });
if (error) throw new Error(error.message);
const imageUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

await prisma.partSoloPreview.update({
  where: { partId_basePhotoId: { partId, basePhotoId } },
  data: { imageUrl, status: "pending_review", promptVersion: "v5", errorMessage: null, generatedAt: new Date() },
});

console.log("Updated:", imageUrl);
await prisma.$disconnect();
