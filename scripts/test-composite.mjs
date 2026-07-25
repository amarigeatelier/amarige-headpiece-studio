// Standalone Gemini compositing smoke test — no Supabase/Prisma/Next.js needed.
// Usage: node --env-file=.env.local scripts/test-composite.mjs <cutout.jpg> <base.jpg> ["装着位置"]
import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , cutoutPath, basePath, attachmentZone = "頭頂部中央"] = process.argv;

if (!cutoutPath || !basePath) {
  console.error('Usage: node --env-file=.env.local scripts/test-composite.mjs <cutout.jpg> <base.jpg> ["装着位置"]');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set (check .env.local)");
  process.exit(1);
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

const prompt = [
  `1枚目の画像に写っているヘアアクセサリーを、2枚目の画像のモデルの頭の「${attachmentZone}」の位置に自然に合成してください。`,
  "2枚目の画像の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。",
  "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。",
  "ヘアアクセサリー以外の物体を追加しないでください。",
].join("\n");

const cutoutBytes = await readFile(cutoutPath);
const baseBytes = await readFile(basePath);

const ai = new GoogleGenAI({ apiKey });

console.log("Gemini 2.5 Flash Image に送信中...");

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeTypeFor(cutoutPath), data: cutoutBytes.toString("base64") } },
        { inlineData: { mimeType: mimeTypeFor(basePath), data: baseBytes.toString("base64") } },
      ],
    },
  ],
});

const parts = response.candidates?.[0]?.content?.parts ?? [];
const imagePart = parts.find((p) => p.inlineData?.data);

if (!imagePart?.inlineData?.data) {
  console.error("画像が返ってきませんでした。レスポンス全体:");
  console.error(JSON.stringify(response, null, 2));
  process.exit(1);
}

const outPath = path.join(path.dirname(cutoutPath), `composite-result-${Date.now()}.png`);
await writeFile(outPath, Buffer.from(imagePart.inlineData.data, "base64"));
console.log("保存しました:", outPath);
