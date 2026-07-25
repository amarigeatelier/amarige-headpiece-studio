import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await db.previewLead.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-xl font-semibold">見込み客リスト</h1>
      <p className="mb-6 text-sm text-neutral-500">
        プレビュー生成前に入力されたメールアドレスの一覧です（新しい順、直近500件）。
      </p>
      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{lead.email}</span>
            <span className="text-xs text-neutral-500">{new Date(lead.createdAt).toLocaleString("ja-JP")}</span>
          </div>
        ))}
        {leads.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">まだデータがありません。</p>}
      </div>
    </div>
  );
}
