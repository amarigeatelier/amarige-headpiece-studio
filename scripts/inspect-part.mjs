import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const part = await prisma.part.findUnique({
  where: { id: "cmrp2v1a10000det0ooeufjb9" },
  include: { soloPreviews: { include: { basePhoto: true } } },
});
console.log("cutoutImageUrl:", part.cutoutImageUrl);
console.log("sizeNote:", part.sizeNote);
for (const p of part.soloPreviews) {
  console.log(p.basePhoto.label, "->", p.imageUrl, "generatedAt:", p.generatedAt, "promptVersion:", p.promptVersion, "status:", p.status);
}
await prisma.$disconnect();
