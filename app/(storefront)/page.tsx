import { db } from "@/lib/db";
import PartConfigurator from "@/components/PartConfigurator";

export const dynamic = "force-dynamic";

export default async function StorefrontHomePage() {
  const [basePhotos, parts, setting] = await Promise.all([
    db.modelBasePhoto.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.part.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } }),
    db.storeSetting.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">ヘッドパーツを組み合わせる</h1>
      <p className="mb-8 text-sm text-neutral-500">
        好きなパーツを選んで「プレビューを生成する」を押すと、実際に着けたイメージをAIで確認できます。
      </p>

      <PartConfigurator
        basePhotos={basePhotos.map((b) => ({ id: b.id, label: b.label, imageUrl: b.imageUrl }))}
        parts={parts.map((p) => ({
          id: p.id,
          name: p.name,
          cutoutImageUrl: p.cutoutImageUrl,
          addOnPriceJpy: p.addOnPriceJpy,
          displayCategory: p.displayCategory,
          color: p.color,
        }))}
        basePriceJpy={setting?.basePriceJpy ?? 0}
      />
    </div>
  );
}
