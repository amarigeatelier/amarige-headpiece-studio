const ROWS: { label: string; value: string }[] = [
  { label: "販売事業者名", value: "amarige*" },
  { label: "運営統括責任者", value: "喜多早紀" },
  { label: "所在地", value: "請求があれば遅滞なく開示いたします" },
  { label: "電話番号", value: "請求があれば遅滞なく開示いたします" },
  { label: "メールアドレス", value: "amarige.atelier@gmail.com" },
  { label: "商品代金", value: "各商品ページに記載の金額（すべて税込）" },
  { label: "商品代金以外の必要料金", value: "配送料：ヤマト運輸（クロネコヤマト）にて発送（関西地方より発送、実費）" },
  { label: "お支払い方法", value: "クレジットカード決済（Stripe）" },
  { label: "お支払い時期", value: "ご注文確定時" },
  { label: "商品のお届け時期", value: "受注生産のため、ご注文から1週間ほどでお届け" },
  { label: "返品・交換について", value: "受注生産のため返品不可。パーツに不良があった場合は交換対応いたします。" },
];

export default function TokuteiShoutorihikiPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">特定商取引法に基づく表示</h1>
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
