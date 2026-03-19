import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe, stripeEnabled, getPriceIdForPlan } from "@/lib/stripe";
import { isAdminUser } from "@/lib/admin";
import { isValidPlanKey } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  if (await isAdminUser(session.user.id)) {
    return NextResponse.json({ error: "Admin users have unlimited access — no subscription needed" }, { status: 400 });
  }

  let body: { planKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { planKey } = body;
  if (!planKey || !isValidPlanKey(planKey)) {
    return NextResponse.json({ error: "Invalid plan key" }, { status: 400 });
  }

  const priceId = getPriceIdForPlan(planKey);
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for plan: ${planKey}` }, { status: 400 });
  }

  const stripe = getStripe()!;

  const existingSub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true },
  });

  let customerId = existingSub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;

    await prisma.subscription.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, planKey: "basic", status: "active", stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:5000";

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/billing?success=1`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    metadata: { userId: session.user.id, planKey },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
