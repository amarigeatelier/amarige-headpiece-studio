import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { updatePart } from "@/lib/actions/parts";
import SubmitButton from "../../../SubmitButton";

export default async function EditPartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [part, categories, colors] = await Promise.all([
    db.part.findUnique({ where: { id } }),
    db.part.findMany({ where: { displayCategory: { not: null } }, select: { displayCategory: true }, distinct: ["displayCategory"] }),
    db.part.findMany({ where: { color: { not: null } }, select: { color: true }, distinct: ["color"] }),
  ]);
  if (!part) notFound();

  const updateWithId = updatePart.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">パーツを編集</h1>

      <div className="mb-4 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={part.cutoutImageUrl} alt={part.name} className="aspect-square w-full object-cover" />
      </div>

      <form action={updateWithId} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm text-neutral-600">パーツ名</label>
          <input name="name" defaultValue={part.name} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">種類（任意）</label>
          <input
            name="displayCategory"
            list="category-options"
            defaultValue={part.displayCategory ?? ""}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <datalist id="category-options">
            {categories.map((c) => c.displayCategory && <option key={c.displayCategory} value={c.displayCategory} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">カラー（任意）</label>
          <input
            name="color"
            list="color-options"
            defaultValue={part.color ?? ""}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <datalist id="color-options">
            {colors.map((c) => c.color && <option key={c.color} value={c.color} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">説明（任意）</label>
          <textarea
            name="description"
            defaultValue={part.description ?? ""}
            rows={3}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">サイズ目安（任意）</label>
          <input
            name="sizeNote"
            defaultValue={part.sizeNote ?? ""}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">実物の横幅（cm・できるだけ入力してください）</label>
          <input
            name="realWidthCm"
            type="number"
            step="0.1"
            min={0}
            defaultValue={part.realWidthCm ?? ""}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            「サイズを調整して再生成」の初期の大きさを、この数値とモデル写真側のキャリブレーション値から自動計算するために使います。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">追加料金（円）</label>
          <input
            name="addOnPriceJpy"
            type="number"
            min={0}
            defaultValue={part.addOnPriceJpy}
            required
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">装着スタイル</label>
          <select name="attachmentStyle" defaultValue={part.attachmentStyle} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="comb">コーム</option>
            <option value="clip">クリップ</option>
            <option value="tiara">ティアラ</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">写真を差し替える（任意）</label>
          <input type="file" name="cutout" accept="image/*" className="w-full text-sm" />
          <p className="mt-1 text-xs text-neutral-500">
            お客様に表示される写真です。硬貨など余計なものは写さないでください。
            選択しなければ現在の写真のまま更新されます。差し替えると、既存のQAプレビューはリセットされ、再度承認・有効化が必要になります。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">
            サイズ参考写真を{part.sizeReferenceImageUrl ? "差し替える" : "追加する"}（任意）
          </label>
          {part.sizeReferenceImageUrl && (
            <div className="mb-2 w-24 overflow-hidden rounded border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={part.sizeReferenceImageUrl} alt="サイズ参考写真" className="aspect-square w-full object-cover" />
            </div>
          )}
          <input type="file" name="sizeReference" accept="image/*" className="w-full text-sm" />
          {part.sizeReferenceImageUrl && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" name="removeSizeReference" value="1" />
              サイズ参考写真を削除する（サイズ目安のテキストのみで生成します）
            </label>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            同じパーツを500円玉などの硬貨と並べて撮った写真です。AIがサイズを正確に読み取るためだけに使い、お客様には表示されません。
            選択しなければ現在の設定のまま更新されます。差し替えるとQAプレビューがリセットされます。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">
            生成用写真・ピンなしを{part.compositingImageUrl ? "差し替える" : "追加する"}（任意）
          </label>
          {part.compositingImageUrl && (
            <div className="mb-2 w-24 overflow-hidden rounded border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={part.compositingImageUrl} alt="生成用写真（ピンなし）" className="aspect-square w-full object-cover" />
            </div>
          )}
          <input type="file" name="compositingImage" accept="image/*" className="w-full text-sm" />
          {part.compositingImageUrl && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" name="removeCompositingImage" value="1" />
              生成用写真を削除する（カットアウト写真をそのままAI生成にも使います）
            </label>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            カットアウト写真からコーム・ピンなどの装着部分だけを手動で消した写真です。登録すると、AI生成時はこちらを優先的に使用します（お客様には表示されません）。
            選択しなければ現在の設定のまま更新されます。差し替えるとQAプレビューがリセットされます。
          </p>
        </div>
        <SubmitButton pendingLabel="保存中..." className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          保存する
        </SubmitButton>
      </form>
    </div>
  );
}
