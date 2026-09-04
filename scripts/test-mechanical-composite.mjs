import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const basePhoto = await prisma.modelBasePhoto.findFirst({
  where: { realWidthCm: { not: null } },
});
const part = await prisma.part.findFirst({
  where: { realWidthCm: { not: null }, status: "active" },
});

if (!basePhoto || !part) {
  console.log("No calibrated part/basePhoto pair found (realWidthCm missing on one or both).");
  await prisma.$disconnect();
  process.exit(1);
}

console.log("Using part:", part.name, "realWidthCm:", part.realWidthCm);
console.log("Using basePhoto:", basePhoto.label, "realWidthCm:", basePhoto.realWidthCm);

const { mechanicalComposite } = await import("../lib/deterministic-composite.ts");

const cutoutUrl = part.compositingImageUrl || part.cutoutImageUrl;
const [cutoutBytes, baseBytes] = await Promise.all([fetchBytes(cutoutUrl), fetchBytes(basePhoto.imageUrl)]);

const targetWidthPercent = (part.realWidthCm / basePhoto.realWidthCm) * 100 * 0.8;
const xPercent = basePhoto.defaultAttachmentXPercent ?? 50;
const yPercent = basePhoto.defaultAttachmentYPercent ?? 25;

console.log("targetWidthPercent:", targetWidthPercent.toFixed(2), "x:", xPercent, "y:", yPercent);

const result = await mechanicalComposite(baseBytes, cutoutBytes, targetWidthPercent, xPercent, yPercent);

const outPath = path.join(__dirname, "test-output-mechanical.png");
await writeFile(outPath, result);
console.log("Wrote", outPath, `(${result.length} bytes)`);

await prisma.$disconnect();
