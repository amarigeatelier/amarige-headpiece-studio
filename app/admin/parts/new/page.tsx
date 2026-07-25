import { db } from "@/lib/db";
import { createPart } from "@/lib/actions/parts";

export default async function NewPartPage() {
  const [categories, colors] = await Promise.all([
    db.part.findMany({ where: { displayCategory: { not: null } }, select: { displayCategory: true }, distinct: ["displayCategory"] }),
    db.part.findMany({ where: { color: { not: null } }, select: { color: true }, distinct: ["color"] }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">新規パーツを追加</h1>
      <form action={createPart} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm text-neutral-600">パーツ名</label>
          <input name="name" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">種類（任意・例: お花、リボン、リーフ）</label>
          <input name="displayCategory" list="category-options" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          <datalist id="category-options">
            {categories.map((c) => c.displayCategory && <option key={c.displayCategory} value={c.displayCategory} />)}
          </datalist>
          <p className="mt-1 text-xs text-neutral-500">お客様が種類で絞り込む際に使われます。既存の表記に合わせてください。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">カラー（任意・例: ゴールド、シルバー、ホワイト）</label>
          <input name="color" list="color-options" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          <datalist id="color-options">
            {colors.map((c) => c.color && <option key={c.color} value={c.color} />)}
          </datalist>
          <p className="mt-1 text-xs text-neutral-500">お客様がカラーで絞り込む際に使われます。既存の表記に合わせてください。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">説明（任意）</label>
          <textarea name="description" rows={3} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">サイズ目安（任意・例: 幅約8cm×高さ約6cm）</label>
          <input name="sizeNote" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-neutral-500">AI合成時の縮尺の目安としても使われます。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">追加料金（円）</label>
          <input name="addOnPriceJpy" type="number" min={0} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">装着スタイル</label>
          <select name="attachmentStyle" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="comb">コーム</option>
            <option value="clip">クリップ</option>
            <option value="tiara">ティアラ</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">カットアウト写真（背景シンプル、長辺2000px以上推奨）</label>
          <input type="file" name="cutout" accept="image/*" required className="w-full text-sm" />
          <p className="mt-1 text-xs text-neutral-500">
            お客様の商品一覧にそのまま表示される写真です。硬貨など余計なものは写さないでください。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">サイズ参考写真（任意）</label>
          <input type="file" name="sizeReference" accept="image/*" className="w-full text-sm" />
          <p className="mt-1 text-xs text-neutral-500">
            同じパーツを500円玉などの硬貨と並べて撮った写真です。AIがサイズを正確に読み取るためだけに使い、お客様には表示されません。サイズ感のブレを大きく減らせます。
          </p>
        </div>
        <p className="text-xs text-neutral-500">
          追加すると、対応するアクティブなモデル写真すべてに対して単体合成プレビュー（管理者QA用）が自動生成されます。
        </p>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          追加してプレビューを生成
        </button>
      </form>
    </div>
  );
}
