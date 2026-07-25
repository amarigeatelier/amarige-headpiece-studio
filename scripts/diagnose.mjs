import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const photos = await prisma.modelBasePhoto.findMany();
console.log("=== ModelBasePhoto ===");
for (const p of photos) {
  console.log({ id: p.id, label: p.label, active: p.active, compatibleAttachmentStyles: p.compatibleAttachmentStyles });
}

const parts = await prisma.part.findMany();
console.log("=== Part ===");
for (const p of parts) {
  console.log({ id: p.id, name: p.name, status: p.status, attachmentStyle: p.attachmentStyle, sizeNote: p.sizeNote });
}

await prisma.$disconnect();
