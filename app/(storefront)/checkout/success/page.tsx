import Link from "next/link";

export default function CheckoutSuccessPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="mb-3 text-xl font-semibold">ご注文ありがとうございます</h1>
      <p className="mb-8 text-sm text-neutral-600">
        決済が完了しました。ご登録のメールアドレスに確認メールをお送りしています。
        商品は受注生産のため、発送まで今しばらくお待ちください。
      </p>
      <Link href="/" className="text-sm text-neutral-900 underline">
        トップページへ戻る
      </Link>
    </div>
  );
}
