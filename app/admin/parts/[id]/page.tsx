import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateSoloPreviewsForPart, activatePart, deactivatePart } from "@/lib/actions/parts";
import { approveSoloPreview, rejectSoloPreview, regenerateSoloPreview } from "@/lib/actions/part-previews";
import DeletePartButton from "../DeletePartButton";
import SubmitButton from "../../SubmitButton";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "未レビュー",
  approved: "承認済み",
  rejected: "却下",
  failed: "生成失敗",
};

const STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-neutral-200 text-neutral-600",
  failed: "bg-red-100 text-red-800",
};

export default async function PartReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const part = await db.part.findUnique({
    where: { id },
    include: { soloPreviews: { include: { basePhoto: true }, orderBy: { generatedAt: "asc" } } },
  });

  if (!part) notFound();

  const approvedCount = part.soloPreviews.filter((p) => p.status === "approved").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{part.name}</h1>
          <p className="text-sm text-neutral-500">
            ＋¥{part.addOnPriceJpy.toLocaleString()} /{" "}
            {part.status === "active" ? "有効" : part.status === "inactive" ? "無効" : "下書き"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/parts/${part.id}/edit`} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            編集
          </Link>
          <form action={generateSoloPreviewsForPart.bind(null, part.id)}>
            <SubmitButton pendingLabel="生成中..." className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40">
              未生成/失敗分を生成
            </SubmitButton>
          </form>
          {part.status !== "active" ? (
            <form action={activatePart.bind(null, part.id)}>
              <SubmitButton
                disabled={approvedCount === 0}
                className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                有効にする（承認済み{approvedCount}件）
              </SubmitButton>
            </form>
          ) : (
            <form action={deactivatePart.bind(null, part.id)}>
              <SubmitButton className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-40">
                無効にする
              </SubmitButton>
            </form>
          )}
          <DeletePartButton partId={part.id} partName={part.name} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {part.soloPreviews.map((preview) => (
          <div key={preview.id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="aspect-[3/4] w-full bg-neutral-100">
              {preview.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.imageUrl} alt={preview.basePhoto.label} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                  {preview.errorMessage ?? "画像なし"}
                </div>
              )}
            </div>
            <div className="p-3 text-sm">
              <p className="font-medium">{preview.basePhoto.label}</p>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${STATUS_COLOR[preview.status]}`}>
                {STATUS_LABEL[preview.status]}
              </span>
              <div className="mt-2 flex gap-2">
                <form action={approveSoloPreview.bind(null, preview.id)}>
                  <SubmitButton className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-40">
                    承認
                  </SubmitButton>
                </form>
                <form action={rejectSoloPreview.bind(null, preview.id)}>
                  <SubmitButton className="rounded bg-neutral-300 px-2 py-1 text-xs disabled:opacity-40">却下</SubmitButton>
                </form>
                <form action={regenerateSoloPreview.bind(null, preview.id)}>
                  <SubmitButton pendingLabel="生成中..." className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40">
                    再生成
                  </SubmitButton>
                </form>
              </div>
            </div>
          </div>
        ))}
        {part.soloPreviews.length === 0 && (
          <p className="col-span-full text-sm text-neutral-500">
            対応するアクティブなモデル写真がありません。先にモデル写真を追加してください。
          </p>
        )}
      </div>
    </div>
  );
}
