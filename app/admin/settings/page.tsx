import { getStoreSetting, updateBasePrice } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const setting = await getStoreSetting();

  return (
    <div className="mx-auto max-w-md px-6 py-10">
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
  );
}
