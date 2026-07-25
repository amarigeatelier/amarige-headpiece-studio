import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="mb-3 text-xl font-semibold">購入手続きがキャンセルされました</h1>
      <p className="mb-8 text-sm text-neutral-600">決済は行われていません。よろしければもう一度お試しください。</p>
      <Link href="/" className="text-sm text-neutral-900 underline">
        トップページへ戻る
      </Link>
    </div>
  );
}
