import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPlanKeyForPriceId } from "@/lib/stripe";
import { clearPlanCache } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("[stripe-webhook] checkout.session.completed missing userId in metadata");
    return;
  }

  const planKey = session.metadata?.planKey || "basic";
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planKey,
      status: "active",
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId || null,
    },
    update: {
      planKey,
      status: "active",
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId || null,
    },
  });

  clearPlanCache(userId);
  console.log(`[stripe-webhook] Checkout complete: user=${userId} plan=${planKey}`);
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });

  if (!dbSub) {
    console.log(`[stripe-webhook] No DB subscription for customer ${customerId}`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  const planKey = priceId ? getPlanKeyForPriceId(priceId) : null;

  const status = sub.status === "active" ? "active" :
    sub.status === "past_due" ? "past_due" :
    sub.status === "canceled" ? "canceled" : sub.status;

  await prisma.subscription.update({
    where: { userId: dbSub.userId },
    data: {
      status,
      stripeSubscriptionId: sub.id,
      ...(planKey ? { planKey } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentPeriodEnd: typeof (sub as any).current_period_end === "number"
        ? new Date((sub as any).current_period_end * 1000)
        : undefined,
    },
  });

  clearPlanCache(dbSub.userId);
  console.log(`[stripe-webhook] Subscription updated: user=${dbSub.userId} status=${status} plan=${planKey || "unchanged"}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });

  if (!dbSub) return;

  await prisma.subscription.update({
    where: { userId: dbSub.userId },
    data: {
      status: "canceled",
      planKey: "basic",
    },
  });

  clearPlanCache(dbSub.userId);
  console.log(`[stripe-webhook] Subscription canceled: user=${dbSub.userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });

  if (!dbSub) return;

  await prisma.subscription.update({
    where: { userId: dbSub.userId },
    data: { status: "past_due" },
  });

  clearPlanCache(dbSub.userId);
  console.log(`[stripe-webhook] Payment failed: user=${dbSub.userId}`);
}
