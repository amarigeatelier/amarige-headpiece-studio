// One-off manual test seeding: uploads the two saved test photos, creates a ModelBasePhoto
// and a Part, and generates the solo QA preview — everything the admin UI would do, minus
// the file-picker click (which browser automation can't drive for native file inputs).
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "previews";

async function upload(path, filePath, contentType) {
  const bytes = await readFile(filePath);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

const modelImageUrl = await upload("model-photos/seed-model/model.jpg", "test-assets/model.jpg", "image/jpeg");
console.log("uploaded model photo:", modelImageUrl);

const basePhoto = await prisma.modelBasePhoto.create({
  data: {
    label: "和装_アップ_1",
    imageUrl: modelImageUrl,
    styleCategory: "wa",
    hairState: "up",
    attachmentZone: "後頭部のお団子の上",
    compatibleAttachmentStyles: ["comb", "clip", "tiara"],
    active: true,
  },
});
console.log("created ModelBasePhoto:", basePhoto.id);

const cutoutImageUrl = await upload("cutouts/seed-part/headpiece.jpg", "test-assets/headpiece.jpg", "image/jpeg");
console.log("uploaded part cutout:", cutoutImageUrl);

const part = await prisma.part.create({
  data: {
    slug: `silver-flower-corsage-${Date.now().toString(36)}`,
    name: "シルバーフラワーコサージュ",
    description: "白とシルバーのお花をあしらったコサージュ",
    sizeNote: "幅約10cm×高さ約8cm",
    addOnPriceJpy: 800,
    attachmentStyle: "tiara",
    displayCategory: "お花",
    cutoutImageUrl,
    status: "draft",
  },
});
console.log("created Part:", part.id);

await prisma.storeSetting.upsert({
  where: { id: 1 },
  create: { id: 1, basePriceJpy: 3000 },
  update: {},
});
console.log("ensured StoreSetting.basePriceJpy");

// Generate the solo QA preview (same prompt/logic as lib/gemini.ts composePreview)
const prompt = [
  `1枚目の画像に写っているヘアアクセサリーを、2枚目の画像のモデルの頭の「${basePhoto.attachmentZone}」の位置に自然に合成してください。`,
  "2枚目の画像の光の向き・色温度・影の柔らかさ・カメラアングルに正確に一致させ、写実的で継ぎ目のない仕上がりにしてください。",
  "モデルの顔・髪型・肌・背景・衣装は一切変更しないでください。",
  "ヘアアクセサリー以外の物体を追加しないでください。",
  `このヘアアクセサリーの実物サイズの目安は「${part.sizeNote}」です。モデルの頭に対して、この実寸に合った自然な縮尺で合成してください。`,
].join("\n");

const cutoutBytes = await readFile("test-assets/headpiece.jpg");
const baseBytes = await readFile("test-assets/model.jpg");

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: cutoutBytes.toString("base64") } },
        { inlineData: { mimeType: "image/jpeg", data: baseBytes.toString("base64") } },
      ],
    },
  ],
});

const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
if (!imagePart?.inlineData?.data) throw new Error("no image returned from Gemini");

const resultBytes = Buffer.from(imagePart.inlineData.data, "base64");
const previewImageUrl = await (async () => {
  const path = `part-solo-previews/${part.id}/${basePhoto.id}.png`;
  const { error } = await supabase.storage.from(bucket).upload(path, resultBytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
})();

const soloPreview = await prisma.partSoloPreview.create({
  data: {
    partId: part.id,
    basePhotoId: basePhoto.id,
    imageUrl: previewImageUrl,
    status: "pending_review",
    promptVersion: "v2",
  },
});
console.log("created PartSoloPreview:", soloPreview.id, previewImageUrl);

console.log("\nDone. Part admin page: http://localhost:3000/admin/parts/" + part.id);

await prisma.$disconnect();
