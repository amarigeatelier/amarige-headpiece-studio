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

  const parts = await db.part.findMany({ where: { id: { in: partIds }, status: "active" } });
  if (parts.length !== partIds.length) {
    return NextResponse.json({ error: "選択されたパーツの一部が利用できません" }, { status: 404 });
  }

  const composite = await db.generatedComposite.findUnique({ where: { id: compositeId } });
  if (!composite || composite.status !== "ready" || composite.basePhotoId !== basePhotoId) {
    return NextResponse.json({ error: "プレビューが見つかりません。もう一度生成してください" }, { status: 404 });
  }
  const sameParts =
    composite.partIds.length === partIds.length && composite.partIds.every((id) => partIds.includes(id));
  if (!sameParts) {
    return NextResponse.json({ error: "選択内容とプレビューが一致しません。もう一度生成してください" }, { status: 409 });
  }

  const setting = await db.storeSetting.findUnique({ where: { id: 1 } });
  const basePriceJpy = setting?.basePriceJpy ?? 0;
  const partsSnapshot = parts.map((p) => ({ partId: p.id, name: p.name, addOnPriceJpy: p.addOnPriceJpy }));
  const totalPriceJpy = basePriceJpy + partsSnapshot.reduce((sum, p) => sum + p.addOnPriceJpy, 0);

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
  const partNamesJoined = partsSnapshot.map((p) => p.name).join("、");
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
