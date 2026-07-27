"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePart } from "@/lib/actions/parts";

export default function DeletePartButton({ partId, partName }: { partId: string; partName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`「${partName}」を削除しますか？元に戻せません。`)) return;
    startTransition(async () => {
      try {
        await deletePart(partId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "削除に失敗しました");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-40"
    >
      {pending ? "削除中..." : "削除"}
    </button>
  );
}
