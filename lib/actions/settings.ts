"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { uploadImage, scaleExemplarImagePath } from "@/lib/storage";

export async function getStoreSetting() {
  const setting = await db.storeSetting.findUnique({ where: { id: 1 } });
  return (
    setting ?? {
      id: 1,
      basePriceJpy: 0,
      scaleExemplarImageUrl: null,
      monitorDiscountPercent: null,
      monitorMaxOrders: null,
      updatedAt: new Date(),
    }
  );
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

// 空欄で送信された場合はnull(モニター価格オフ)として保存する。
export async function updateMonitorPrice(formData: FormData) {
  const percentRaw = String(formData.get("monitorDiscountPercent") ?? "").trim();
  const maxOrdersRaw = String(formData.get("monitorMaxOrders") ?? "").trim();
  const monitorDiscountPercent = percentRaw === "" ? null : Number(percentRaw);
  const monitorMaxOrders = maxOrdersRaw === "" ? null : Number(maxOrdersRaw);

  if (monitorDiscountPercent != null && (!Number.isFinite(monitorDiscountPercent) || monitorDiscountPercent <= 0 || monitorDiscountPercent >= 100)) {
    throw new Error("割引率は1〜99の数値で入力してください");
  }
  if (monitorMaxOrders != null && (!Number.isFinite(monitorMaxOrders) || monitorMaxOrders <= 0)) {
    throw new Error("上限人数は1以上の数値で入力してください");
  }

  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1, basePriceJpy: 0, monitorDiscountPercent, monitorMaxOrders },
    update: { monitorDiscountPercent, monitorMaxOrders },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
}

export async function updateScaleExemplar(formData: FormData) {
  const file = formData.get("exemplar") as File | null;
  if (!file || file.size === 0) {
    throw new Error("画像を選択してください");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = crypto.randomUUID();
  const scaleExemplarImageUrl = await uploadImage(scaleExemplarImagePath(key, file.name), bytes, file.type || "image/png");

  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1, basePriceJpy: 0, scaleExemplarImageUrl },
    update: { scaleExemplarImageUrl },
  });

  revalidatePath("/admin/settings");
}

export async function removeScaleExemplar() {
  await db.storeSetting.update({ where: { id: 1 }, data: { scaleExemplarImageUrl: null } });
  revalidatePath("/admin/settings");
}
