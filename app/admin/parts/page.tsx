import Link from "next/link";
import { db } from "@/lib/db";
import DeletePartButton from "./DeletePartButton";

export const dynamic = "force-dynamic";

const ATTACHMENT_LABEL: Record<string, string> = { comb: "コーム", clip: "クリップ", tiara: "ティアラ" };
const STATUS_LABEL: Record<string, string> = { draft: "下書き", active: "有効", inactive: "無効" };
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-600",
  active: "bg-green-100 text-green-800",
  inactive: "bg-red-100 text-red-800",
};

export default async function AdminPartsPage() {
  const parts = await db.part.findMany({
    orderBy: { createdAt: "desc" },
    include: { soloPreviews: true },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">パーツ一覧</h1>
        <Link href="/admin/parts/new" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          新規パーツを追加
        </Link>
      </div>

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {parts.map((p) => {
          const approved = p.soloPreviews.filter((pv) => pv.status === "approved").length;
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
              <Link href={`/admin/parts/${p.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-neutral-500">
                  {ATTACHMENT_LABEL[p.attachmentStyle]} / ＋¥{p.addOnPriceJpy.toLocaleString()} / 承認済み {approved}件
                  {p.displayCategory ? ` / ${p.displayCategory}` : ""}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                <DeletePartButton partId={p.id} partName={p.name} />
              </div>
            </div>
          );
        })}
        {parts.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">まだパーツがありません。</p>}
      </div>
    </div>
  );
}
