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
      <p
        className="mb-2 text-xs font-medium tracking-wide text-neutral-400"
        style={{ fontFamily: '"Shippori Mincho", serif' }}
      >
        髪に、あなただけの彩りを
      </p>
      <h1 className="mb-2 text-2xl font-semibold" style={{ fontFamily: '"Shippori Mincho", serif' }}>
        好きなお花で、好きなだけ。わたしだけの髪飾りビュッフェ。
      </h1>
      <p className="mb-8 text-sm text-neutral-500">
        好きなパーツを選んで「プレビューを生成する」を押すと、実際の組み合わせイメージをその場で確認できます。ご購入後、こちらで実物を組み立ててお届けします。
      </p>

      <PartConfigurator
        basePhotos={basePhotos.map((b) => ({
          id: b.id,
          label: b.label,
          imageUrl: b.imageUrl,
          defaultAttachmentXPercent: b.defaultAttachmentXPercent,
          defaultAttachmentYPercent: b.defaultAttachmentYPercent,
          realWidthCm: b.realWidthCm,
        }))}
        parts={parts.map((p) => ({
          id: p.id,
          name: p.name,
          cutoutImageUrl: p.cutoutImageUrl,
          compositingImageUrl: p.compositingImageUrl,
          addOnPriceJpy: p.addOnPriceJpy,
          displayCategory: p.displayCategory,
          color: p.color,
          realWidthCm: p.realWidthCm,
        }))}
        basePriceJpy={setting?.basePriceJpy ?? 0}
      />
    </div>
  );
}
