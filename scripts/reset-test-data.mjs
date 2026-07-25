// One-off cleanup: this Supabase project has no real customer data yet (only the seed +
// Stripe-verification test run), so a full reset of all content tables is safe.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "previews";

// Delete children before parents to satisfy foreign key constraints.
await prisma.orderItemPart.deleteMany();
await prisma.orderItem.deleteMany();
await prisma.order.deleteMany();
await prisma.pendingCheckout.deleteMany();
await prisma.generatedComposite.deleteMany();
await prisma.partSoloPreview.deleteMany();
await prisma.part.deleteMany();
await prisma.modelBasePhoto.deleteMany();
await prisma.previewLead.deleteMany();
await prisma.generationAttempt.deleteMany();
await prisma.generationCreditPurchase.deleteMany();

console.log("Cleared all rows from content tables (StoreSetting kept as-is).");

// Best-effort cleanup of the test images in Storage.
async function removeFolder(prefix) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  for (const entry of data) {
    if (entry.id === null) {
      await removeFolder(`${prefix}/${entry.name}`);
    } else {
      await supabase.storage.from(bucket).remove([`${prefix}/${entry.name}`]);
    }
  }
}

for (const prefix of ["model-photos", "cutouts", "part-solo-previews", "generated-composites"]) {
  await removeFolder(prefix);
}
console.log("Cleared test images from Storage.");

await prisma.$disconnect();
