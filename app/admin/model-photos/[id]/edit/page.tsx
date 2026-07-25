import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { updateModelBasePhoto } from "@/lib/actions/model-photos";

export default async function EditModelPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await db.modelBasePhoto.findUnique({ where: { id } });
  if (!photo) notFound();

  const updateWithId = updateModelBasePhoto.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">モデル写真を編集</h1>

      <div className="mb-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.imageUrl} alt={photo.label} className="aspect-[3/4] w-full object-cover" />
      </div>

      <form action={updateWithId} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm text-neutral-600">ラベル</label>
          <input name="label" defaultValue={photo.label} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-neutral-600">スタイル区分</label>
            <select name="styleCategory" defaultValue={photo.styleCategory} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
              <option value="wa">和装</option>
              <option value="yo">洋装</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">髪型</label>
            <select name="hairState" defaultValue={photo.hairState} required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
              <option value="up">アップ</option>
              <option value="down">ダウン</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">装着位置</label>
          <input
            name="attachmentZone"
            defaultValue={photo.attachmentZone}
            required
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">対応する装着スタイル</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="compatibleAttachmentStyles"
                value="comb"
                defaultChecked={photo.compatibleAttachmentStyles.includes("comb")}
              />{" "}
              コーム
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="compatibleAttachmentStyles"
                value="clip"
                defaultChecked={photo.compatibleAttachmentStyles.includes("clip")}
              />{" "}
              クリップ
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="compatibleAttachmentStyles"
                value="tiara"
                defaultChecked={photo.compatibleAttachmentStyles.includes("tiara")}
              />{" "}
              ティアラ
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">写真を差し替える（任意）</label>
          <input type="file" name="photo" accept="image/*" className="w-full text-sm" />
          <p className="mt-1 text-xs text-neutral-500">選択しなければ、現在の写真のまま更新されます。</p>
        </div>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          保存する
        </button>
      </form>
    </div>
  );
}
