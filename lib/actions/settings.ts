"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function getStoreSetting() {
  const setting = await db.storeSetting.findUnique({ where: { id: 1 } });
  return setting ?? { id: 1, basePriceJpy: 0, updatedAt: new Date() };
}

export async function updateBasePrice(formData: FormData) {
  const basePriceJpy = Number(formData.get("basePriceJpy"));
  if (!Number.isFinite(basePriceJpy) || basePriceJpy < 0) {
    throw new Error("基本価格が不正です");
  }

  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1, basePriceJpy },
    update: { basePriceJpy },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
}
