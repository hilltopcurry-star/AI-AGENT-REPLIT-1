import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
  }

  const stripe = getStripe()!;
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:5000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
