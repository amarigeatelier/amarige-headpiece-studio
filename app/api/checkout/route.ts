import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { basePhotoId, partIds, compositeId } = await req.json();

  if (
    typeof basePhotoId !== "string" ||
    !Array.isArray(partIds) ||
    partIds.length === 0 ||
    !partIds.every((id) => typeof id === "string") ||
    typeof compositeId !== "string"
  ) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const basePhoto = await db.modelBasePhoto.findUnique({ where: { id: basePhotoId } });
  if (!basePhoto || !basePhoto.active) {
    return NextResponse.json({ error: "選択されたモデル写真は利用できません" }, { status: 404 });
  }

  // partIds can contain repeats — the same part bought more than once — so validate against unique
  // ids rather than requiring the raw array to have no duplicates.
  const uniquePartIds = Array.from(new Set(partIds));
  const parts = await db.part.findMany({ where: { id: { in: uniquePartIds }, status: "active" } });
  if (parts.length !== uniquePartIds.length) {
    return NextResponse.json({ error: "選択されたパーツの一部が利用できません" }, { status: 404 });
  }

  const composite = await db.generatedComposite.findUnique({ where: { id: compositeId } });
  if (!composite || composite.status !== "ready" || composite.basePhotoId !== basePhotoId) {
    return NextResponse.json({ error: "プレビューが見つかりません。もう一度生成してください" }, { status: 404 });
  }
  // Exact multiset comparison (not just "every id present") — otherwise e.g. [a,a] vs [a,b] would
  // wrongly pass a naive `.every(includes)` check once duplicates are a legitimate possibility.
  const sameParts =
    composite.partIds.length === partIds.length &&
    [...composite.partIds].sort().join(",") === [...partIds].sort().join(",");
  if (!sameParts) {
    return NextResponse.json({ error: "選択内容とプレビューが一致しません。もう一度生成してください" }, { status: 409 });
  }

  const setting = await db.storeSetting.findUnique({ where: { id: 1 } });
  const basePriceJpy = setting?.basePriceJpy ?? 0;

  const quantityByPartId = new Map<string, number>();
  for (const id of partIds) quantityByPartId.set(id, (quantityByPartId.get(id) ?? 0) + 1);
  const partsSnapshot = parts.map((p) => ({
    partId: p.id,
    name: p.name,
    addOnPriceJpy: p.addOnPriceJpy,
    quantity: quantityByPartId.get(p.id) ?? 1,
  }));
  const totalPriceJpy = basePriceJpy + partsSnapshot.reduce((sum, p) => sum + p.addOnPriceJpy * p.quantity, 0);

  const pendingCheckout = await db.pendingCheckout.create({
    data: {
      basePhotoId,
      compositeId: composite.id,
      partIds,
      partsSnapshot,
      basePriceJpy,
      totalPriceJpy,
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

  // Stripe caps product_data.name at 5000 chars, but keep it readable regardless of how many parts were picked.
  const partNamesJoined = partsSnapshot.map((p) => (p.quantity > 1 ? `${p.name}×${p.quantity}` : p.name)).join("、");
  const productName = `オーダーメイドヘッドアクセサリー（${
    partNamesJoined.length > 200 ? `${partNamesJoined.slice(0, 200)}…` : partNamesJoined
  }）`;

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: productName,
            images: composite.imageUrl ? [composite.imageUrl] : undefined,
          },
          unit_amount: totalPriceJpy,
        },
        quantity: 1,
      },
    ],
    shipping_address_collection: { allowed_countries: ["JP"] },
    success_url: `${siteUrl}/checkout/success`,
    cancel_url: `${siteUrl}/checkout/cancel`,
    metadata: {
      pendingCheckoutId: pendingCheckout.id,
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "決済セッションの作成に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
