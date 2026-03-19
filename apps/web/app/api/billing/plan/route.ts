import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlan, getLimits, setUserPlan, isValidPlanKey, getUserSubscription, PLAN_DISPLAY } from "@/lib/plans";
import { isAdminUser } from "@/lib/admin";
import { stripeEnabled } from "@/lib/stripe";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const admin = await isAdminUser(userId);
  const planKey = admin ? "enterprise" : await getUserPlan(userId);
  const limits = await getLimits(userId);
  const display = PLAN_DISPLAY[planKey];
  const subscription = admin ? null : await getUserSubscription(userId);

  return NextResponse.json({
    planKey,
    admin,
    limits,
    display,
    stripeEnabled: stripeEnabled(),
    subscription: subscription
      ? {
          status: subscription.status,
          hasStripeSubscription: !!subscription.stripeSubscriptionId,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { planKey } = body;

  if (!planKey || !isValidPlanKey(planKey)) {
    return NextResponse.json({ error: "Invalid plan key" }, { status: 400 });
  }

  if (stripeEnabled()) {
    return NextResponse.json({ error: "Use Stripe checkout to change plans" }, { status: 400 });
  }

  await setUserPlan(session.user.id, planKey);

  return NextResponse.json({ ok: true, planKey });
}
