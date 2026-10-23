// 送料は基本料金(StoreSetting.basePriceJpy)に含める。北海道・沖縄にお届けする場合のみ、追加で加算する。
// Stripe Checkoutはお届け先住所の入力が金額確定のあとになるため、お届け先の地域は購入前に
// お客様に選んでもらい、その選択に応じて加算する(クライアントの表示とサーバーの請求額の両方で使う)。
export const REMOTE_AREA_SURCHARGE_JPY = 500;

export type ShippingRegion = "main" | "remote";

export function shippingSurchargeJpy(region: ShippingRegion | null): number {
  return region === "remote" ? REMOTE_AREA_SURCHARGE_JPY : 0;
}

export function isShippingRegion(value: unknown): value is ShippingRegion {
  return value === "main" || value === "remote";
}
