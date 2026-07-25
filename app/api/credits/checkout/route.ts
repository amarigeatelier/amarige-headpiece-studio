import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getClientIp, hashIp, todayKey, CREDIT_PACK_SIZE, CREDIT_PACK_PRICE_JPY } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const day = todayKey();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: { name: `プレビュー追加生成 ${CREDIT_PACK_SIZE}回分` },
          unit_amount: CREDIT_PACK_PRICE_JPY,
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/?credit=success`,
    cancel_url: `${siteUrl}/?credit=cancel`,
    metadata: {
      type: "generation_credit",
      ipHash,
      day,
      creditsGranted: String(CREDIT_PACK_SIZE),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "決済セッションの作成に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
