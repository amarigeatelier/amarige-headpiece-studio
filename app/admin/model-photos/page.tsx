import Link from "next/link";
import { db } from "@/lib/db";
import { createModelBasePhoto, toggleModelBasePhotoActive } from "@/lib/actions/model-photos";

export const dynamic = "force-dynamic";

export default async function ModelPhotosPage() {
  const photos = await db.modelBasePhoto.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">モデル写真（固定セット）</h1>

      <section className="mb-10 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-neutral-700">新しいモデル写真を追加</h2>
        <form action={createModelBasePhoto} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm text-neutral-600">ラベル（例: 和装_アップ_1）</label>
            <input name="label" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">スタイル区分</label>
            <select name="styleCategory" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
              <option value="wa">和装</option>
              <option value="yo">洋装</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">髪型</label>
            <select name="hairState" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
              <option value="up">アップ</option>
              <option value="down">ダウン</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm text-neutral-600">装着位置（例: 頭頂部中央、左サイド低め）</label>
            <input name="attachmentZone" required className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm text-neutral-600">対応する装着スタイル</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" name="compatibleAttachmentStyles" value="comb" /> コーム
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" name="compatibleAttachmentStyles" value="clip" /> クリップ
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" name="compatibleAttachmentStyles" value="tiara" /> ティアラ
              </label>
            </div>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm text-neutral-600">写真</label>
            <input type="file" name="photo" accept="image/*" required className="w-full text-sm" />
          </div>
          <div className="col-span-2">
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              追加する
            </button>
          </div>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.imageUrl} alt={photo.label} className="aspect-[3/4] w-full object-cover" />
            <div className="p-3 text-sm">
              <p className="font-medium">{photo.label}</p>
              <p className="text-neutral-500">
                {photo.styleCategory === "wa" ? "和装" : "洋装"} / {photo.hairState === "up" ? "アップ" : "ダウン"}
              </p>
              <p className="text-neutral-500">{photo.attachmentZone}</p>
              <div className="mt-2 flex items-center gap-2">
                <form action={toggleModelBasePhotoActive.bind(null, photo.id, !photo.active)}>
                  <button
                    type="submit"
                    className={`rounded px-2 py-1 text-xs ${
                      photo.active ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {photo.active ? "有効" : "無効"}（クリックで切替）
                  </button>
                </form>
                <Link href={`/admin/model-photos/${photo.id}/edit`} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  編集
                </Link>
              </div>
            </div>
          </div>
        ))}
        {photos.length === 0 && <p className="text-sm text-neutral-500">まだモデル写真がありません。</p>}
      </section>
    </div>
  );
}
