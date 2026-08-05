import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "未払い",
  paid: "支払い済み",
  fulfilled: "発送済み",
  cancelled: "キャンセル",
};

type ShippingAddress = {
  name?: string;
  address?: {
    postal_code?: string;
    state?: string;
    city?: string;
    line1?: string;
    line2?: string;
  };
};

export default async function AdminOrdersPage() {
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { parts: true, basePhoto: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">注文一覧</h1>
      <div className="space-y-4">
        {orders.map((order) => {
          const shipping = order.shippingAddress as ShippingAddress | null;
          return (
            <div key={order.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{order.customerEmail}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="text-neutral-500">
                {new Date(order.createdAt).toLocaleString("ja-JP")} / ¥{order.totalAmountJpy.toLocaleString()}
              </p>
              {shipping && (
                <p className="mt-1 text-neutral-600">
                  {shipping.name} 〒{shipping.address?.postal_code} {shipping.address?.state}
                  {shipping.address?.city}
                  {shipping.address?.line1} {shipping.address?.line2}
                </p>
              )}
              <div className="mt-2 space-y-1 text-neutral-700">
                {order.items.map((item) => (
                  <div key={item.id}>
                    <p className="text-xs text-neutral-500">
                      {item.basePhoto?.label ?? "モデル写真不明"} / 数量{item.quantity} / ¥{item.unitPriceJpy.toLocaleString()}
                    </p>
                    <ul className="list-disc pl-5">
                      {item.parts.map((p) => (
                        <li key={p.id}>
                          {p.partNameSnapshot}
                          {p.quantity > 1 ? `×${p.quantity}` : ""}（＋¥{(p.addOnPriceJpySnapshot * p.quantity).toLocaleString()}）
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {orders.length === 0 && <p className="text-sm text-neutral-500">まだ注文がありません。</p>}
      </div>
    </div>
  );
}
