import { db } from "@/lib/db";
import { getStoreSetting, updateBasePrice, updateMonitorPrice, updateScaleExemplar, removeScaleExemplar } from "@/lib/actions/settings";
import { getMonitorPriceState } from "@/lib/monitor-price";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const setting = await getStoreSetting();
  const monitorPrice = await getMonitorPriceState();
  const purchasedCount = await db.order.count({ where: { status: { in: ["paid", "fulfilled"] } } });

  return (
    <div className="mx-auto max-w-md space-y-6 px-6 py-10">
      <div>
        <h1 className="mb-6 text-xl font-semibold">基本価格設定</h1>
        <form action={updateBasePrice} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
          <div>
            <label className="mb-1 block text-sm text-neutral-600">ベース価格（円）</label>
            <input
              name="basePriceJpy"
              type="number"
              min={0}
              defaultValue={setting.basePriceJpy}
              required
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              お客様の合計金額 ＝ このベース価格 ＋ 選んだパーツの追加料金の合計 になります。
            </p>
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            保存する
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">先着モニター価格</h2>
        <p className="mb-4 text-sm text-neutral-500">
          設定すると、合計金額から指定した割引率が自動で引かれます。支払い済みの注文数が上限人数に達すると、自動的に通常価格へ戻ります。
          どちらかを空欄にすると無効になります。
        </p>
        <form action={updateMonitorPrice} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
          <p
            className={`rounded px-3 py-2 text-sm ${
              monitorPrice.active ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {monitorPrice.active
              ? `有効：${monitorPrice.discountPercent}%オフ（支払い済み${purchasedCount}件 / 上限${monitorPrice.maxOrders}件、残り${monitorPrice.remaining}件）`
              : `無効（支払い済み${purchasedCount}件）`}
          </p>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">割引率（%）</label>
            <input
              name="monitorDiscountPercent"
              type="number"
              min={1}
              max={99}
              defaultValue={setting.monitorDiscountPercent ?? ""}
              placeholder="例: 20"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">上限人数（支払い済み注文数）</label>
            <input
              name="monitorMaxOrders"
              type="number"
              min={1}
              defaultValue={setting.monitorMaxOrders ?? ""}
              placeholder="例: 30"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            保存する
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">AI合成のお手本画像</h2>
        <p className="mb-4 text-sm text-neutral-500">
          ヘアアクセサリーが髪に対して正しい縮尺・自然な配置で装着されている完成例を1枚登録すると、以降すべてのAI合成でお手本として毎回参照されます。
          サイズが大きく描かれすぎる場合に効果があります（デザインの一致は不要、縮尺感の見本として使われます）。
        </p>
        <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
          {setting.scaleExemplarImageUrl && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setting.scaleExemplarImageUrl}
                alt="お手本画像"
                className="mb-2 aspect-[3/4] w-40 rounded border border-neutral-200 object-cover"
              />
              <form action={removeScaleExemplar}>
                <button type="submit" className="text-xs text-red-700 underline">
                  削除する
                </button>
              </form>
            </div>
          )}
          <form action={updateScaleExemplar} className="space-y-2">
            <input type="file" name="exemplar" accept="image/*" required className="w-full text-sm" />
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              {setting.scaleExemplarImageUrl ? "差し替える" : "登録する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
