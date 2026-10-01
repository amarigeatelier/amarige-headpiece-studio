import { db } from "@/lib/db";
import { type MonitorPriceState } from "@/lib/monitor-price-shared";

export type { MonitorPriceState } from "@/lib/monitor-price-shared";
export { applyMonitorDiscount } from "@/lib/monitor-price-shared";

// ローンチ時の「先着◯名モニター価格」。支払い済み(paid/fulfilled)注文数がmonitorMaxOrders未満の間だけ
// 有効 — 件数はStripeのwebhook経由で実際に支払いが確定した注文(Order)だけを数えるので、
// カート放棄や決済中断はカウントされない。店舗設定(StoreSetting)で割引率・上限人数を管理し、
// どちらか片方でもnull/0ならモニター価格は無効。
export async function getMonitorPriceState(): Promise<MonitorPriceState> {
  const setting = await db.storeSetting.findUnique({ where: { id: 1 } });
  const discountPercent = setting?.monitorDiscountPercent ?? 0;
  const maxOrders = setting?.monitorMaxOrders ?? 0;
  if (discountPercent <= 0 || maxOrders <= 0) return { active: false };

  const purchasedCount = await db.order.count({ where: { status: { in: ["paid", "fulfilled"] } } });
  if (purchasedCount >= maxOrders) return { active: false };

  return { active: true, discountPercent, maxOrders, purchasedCount, remaining: maxOrders - purchasedCount };
}
