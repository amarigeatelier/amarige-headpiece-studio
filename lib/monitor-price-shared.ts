// lib/monitor-price.ts から型と計算部分だけを分離したもの。DB(Prisma)への依存がないので、
// クライアントコンポーネント(components/PartConfigurator.tsx)から安全にimportできる。
export type MonitorPriceState =
  | { active: false }
  | { active: true; discountPercent: number; maxOrders: number; purchasedCount: number; remaining: number };

export function applyMonitorDiscount(priceJpy: number, discountPercent: number): number {
  return Math.round((priceJpy * (100 - discountPercent)) / 100);
}
