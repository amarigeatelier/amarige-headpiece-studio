const ROWS: { label: string; value: string }[] = [
  { label: "販売事業者名", value: "（要記入：正式な事業者名）" },
  { label: "運営統括責任者", value: "（要記入：責任者氏名）" },
  { label: "所在地", value: "（要記入：住所。請求があれば遅滞なく開示する形でも可）" },
  { label: "電話番号", value: "（要記入）" },
  { label: "メールアドレス", value: "amarige.atelier@gmail.com" },
  { label: "商品代金", value: "各商品ページに記載の金額（すべて税込）" },
  { label: "商品代金以外の必要料金", value: "配送料（要記入：金額または計算方法）" },
  { label: "お支払い方法", value: "クレジットカード決済（Stripe）" },
  { label: "お支払い時期", value: "ご注文確定時" },
  { label: "商品のお届け時期", value: "受注生産のため、ご注文から（要記入：目安日数）でお届け" },
  { label: "返品・交換について", value: "（要記入：ハンドメイド・受注生産品のため返品可否の方針）" },
];

export default function TokuteiShoutorihikiPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">特定商取引法に基づく表示</h1>
      <p className="mb-6 text-sm text-red-600">
        ※本番公開前に、下記の（要記入）箇所を実際の情報に差し替えてください。
      </p>
      <dl className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {ROWS.map((row) => (
          <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
            <dt className="text-neutral-500">{row.label}</dt>
            <dd className="col-span-2">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
