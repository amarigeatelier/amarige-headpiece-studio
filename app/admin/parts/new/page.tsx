import { db } from "@/lib/db";
import { createPart } from "@/lib/actions/parts";
import SubmitButton from "../../SubmitButton";
import CopyFromExistingPart from "../CopyFromExistingPart";
import CompressibleFileInput from "../../CompressibleFileInput";

export default async function NewPartPage() {
  const [categories, colors, existingParts] = await Promise.all([
    db.part.findMany({ where: { displayCategory: { not: null } }, select: { displayCategory: true }, distinct: ["displayCategory"] }),
    db.part.findMany({ where: { color: { not: null } }, select: { color: true }, distinct: ["color"] }),
    db.part.findMany({
      select: { id: true, name: true, description: true, sizeNote: true, realWidthCm: true, addOnPriceJpy: true, attachmentStyle: true, displayCategory: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">新規パーツを追加</h1>
      <form action={createPart} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <CopyFromExistingPart parts={existingParts} />
        <div>
          <label className="mb-1 block text-sm text-neutral-600">カットアウト写真（背景シンプル、長辺2000px以上推奨）</label>
          <CompressibleFileInput name="cutout" required className="w-full text-sm" />
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
        <div>
          <label className="mb-1 block text-sm text-neutral-600">生成用写真・ピンなし（任意）</label>
          <CompressibleFileInput name="compositingImage" className="w-full text-sm" />
          <p className="mt-1 text-xs text-neutral-500">
            カットアウト写真からコーム・ピンなどの装着部分だけを手動で消した写真です。登録すると、AI生成時はこちらを優先的に使用します（お客様には表示されません、カットアウト写真がそのまま商品一覧に表示されます）。
            未登録の場合はカットアウト写真がそのままAI生成にも使われます。
          </p>
        </div>
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
          <p className="mt-1 text-xs text-neutral-500">AI合成時の説明文としても使われます。</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">実物の横幅（cm・できるだけ入力してください）</label>
          <input name="realWidthCm" type="number" step="0.1" min={0} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-neutral-500">
            「サイズを調整して再生成」の初期の大きさを、この数値とモデル写真側のキャリブレーション値から自動計算するために使います。
            未入力の場合は自動計算されず、従来通り目分量での調整になります。
          </p>
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
        <p className="text-xs text-neutral-500">
          追加すると、対応するアクティブなモデル写真すべてに対して単体合成プレビュー（管理者QA用）が自動生成されます。
        </p>
        <SubmitButton pendingLabel="追加中..." className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          追加してプレビューを生成
        </SubmitButton>
      </form>
    </div>
  );
}
