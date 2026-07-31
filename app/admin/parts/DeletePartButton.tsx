"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePart } from "@/lib/actions/parts";

// Uses an inline confirm step instead of window.confirm() — the native dialog silently failed to
// even appear in some environments (confirmed directly: clicking produced no dialog and no error,
// just nothing), which read as "the delete button doesn't work" with no way to tell why.
export default function DeletePartButton({ partId, partName }: { partId: string; partName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deletePart(partId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "削除に失敗しました");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
      >
        削除
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-red-700">「{partName}」を削除しますか？</span>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className="rounded bg-red-700 px-2 py-1 text-xs text-white disabled:opacity-40"
      >
        {pending ? "削除中..." : "はい、削除する"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40"
      >
        キャンセル
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
