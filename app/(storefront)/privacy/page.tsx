export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-sm leading-relaxed text-neutral-700">
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">プライバシーポリシー</h1>
      <p className="mb-6 text-red-600">※本番公開前に内容を確認・調整してください。</p>

      <p className="mb-4">
        amarige（以下「当店」）は、お客様からお預かりする個人情報を以下の方針に基づき適切に取り扱います。
      </p>

      <h2 className="mt-6 mb-2 font-medium text-neutral-900">取得する情報</h2>
      <p className="mb-4">ご注文時に、氏名・メールアドレス・配送先住所・お支払い情報を取得します。</p>

      <h2 className="mt-6 mb-2 font-medium text-neutral-900">利用目的</h2>
      <p className="mb-4">ご注文商品の製作・発送、お問い合わせへの対応のためにのみ利用します。</p>

      <h2 className="mt-6 mb-2 font-medium text-neutral-900">決済情報について</h2>
      <p className="mb-4">
        お支払い情報は決済代行会社Stripe, Inc.が管理し、当店はカード番号等を直接保持しません。
      </p>

      <h2 className="mt-6 mb-2 font-medium text-neutral-900">お問い合わせ</h2>
      <p>amarige.atelier@gmail.com までご連絡ください。</p>
    </div>
  );
}
