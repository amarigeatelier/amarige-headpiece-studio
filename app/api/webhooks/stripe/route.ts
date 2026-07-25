import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { grantBonusCredits } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "missing signature/secret" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.type === "generation_credit") {
      await handleGenerationCreditPurchase(session);
    } else {
      await handleCheckoutCompleted(session);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleGenerationCreditPurchase(session: Stripe.Checkout.Session) {
  const { ipHash, day, creditsGranted } = session.metadata ?? {};
  if (!ipHash || !day || !creditsGranted) return;

  try {
    // Unique constraint on stripeCheckoutSessionId makes this idempotent against webhook retries.
    await db.generationCreditPurchase.create({
      data: { stripeCheckoutSessionId: session.id, ipHash, day, creditsGranted: Number(creditsGranted) },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return; // already processed
    throw err;
  }

  await grantBonusCredits(ipHash, day, Number(creditsGranted));
}

type PartSnapshot = { partId: string; name: string; addOnPriceJpy: number };

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Idempotent: re-delivered webhooks (Stripe retries, or a manual replay) must not create duplicate orders.
  const existing = await db.order.findUnique({ where: { stripeCheckoutSessionId: session.id } });
  if (existing) return;

  const pendingCheckoutId = session.metadata?.pendingCheckoutId;
  if (!pendingCheckoutId) return;

  const pendingCheckout = await db.pendingCheckout.findUnique({ where: { id: pendingCheckoutId } });
  if (!pendingCheckout) return;

  const stripe = getStripe();
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items"],
  });

  const customerEmail =
    fullSession.customer_details?.email ?? fullSession.customer_email ?? "unknown@example.com";

  const partsSnapshot = pendingCheckout.partsSnapshot as unknown as PartSnapshot[];

  try {
    await db.order.create({
      data: {
        stripeCheckoutSessionId: session.id,
        pendingCheckoutId: pendingCheckout.id,
        customerEmail,
        shippingAddress: JSON.parse(
          JSON.stringify(fullSession.collected_information?.shipping_details ?? fullSession.customer_details ?? {})
        ),
        status: "paid",
        totalAmountJpy: fullSession.amount_total ?? pendingCheckout.totalPriceJpy,
        items: {
          create: {
            basePhotoId: pendingCheckout.basePhotoId,
            compositeId: pendingCheckout.compositeId,
            compositeImageUrl: pendingCheckout.compositeId
              ? (await db.generatedComposite.findUnique({ where: { id: pendingCheckout.compositeId } }))?.imageUrl
              : null,
            basePriceJpy: pendingCheckout.basePriceJpy,
            unitPriceJpy: pendingCheckout.totalPriceJpy,
            quantity: 1,
            parts: {
              create: partsSnapshot.map((p) => ({
                partId: p.partId,
                partNameSnapshot: p.name,
                addOnPriceJpySnapshot: p.addOnPriceJpy,
              })),
            },
          },
        },
      },
    });

    await db.pendingCheckout.update({ where: { id: pendingCheckout.id }, data: { consumedAt: new Date() } });
  } catch (err) {
    // Unique constraint on stripeCheckoutSessionId means a concurrent delivery of the same
    // event already created this order — safe to ignore.
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err;
  }
}
