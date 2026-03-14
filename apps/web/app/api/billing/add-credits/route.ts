import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addCreditsWithBonus, creditsEnabled } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!creditsEnabled()) {
    return NextResponse.json({ error: "Credits not enabled" }, { status: 400 });
  }

  const hasStripe = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);

  if (hasStripe) {
    return NextResponse.json({ error: "Use Stripe checkout for real payments" }, { status: 400 });
  }

  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = body.amount;
  if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
    return NextResponse.json({ error: "Amount must be an integer 1-1000" }, { status: 400 });
  }

  const { balance, bonus } = await addCreditsWithBonus(
    session.user.id,
    amount,
    `Dev top-up: ${amount} credits`,
    "mock"
  );

  return NextResponse.json({ ok: true, balance, added: amount, bonus });
}
