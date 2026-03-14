import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addAiQuota, aiQuotaEnabled } from "@/lib/ai-quota";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!aiQuotaEnabled()) {
    return NextResponse.json({ error: "AI quota not enabled" }, { status: 400 });
  }

  const hasStripe = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
  if (hasStripe) {
    return NextResponse.json({ error: "Use Stripe checkout for real payments" }, { status: 400 });
  }

  let body: { requests?: number; tokens?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requests = body.requests;
  const tokens = body.tokens;

  if (!requests || typeof requests !== "number" || !Number.isInteger(requests) || requests < 1 || requests > 10000) {
    return NextResponse.json({ error: "requests must be an integer 1-10000" }, { status: 400 });
  }
  if (!tokens || typeof tokens !== "number" || !Number.isInteger(tokens) || tokens < 1 || tokens > 10000000) {
    return NextResponse.json({ error: "tokens must be an integer 1-10000000" }, { status: 400 });
  }

  const result = await addAiQuota(
    session.user.id,
    requests,
    tokens,
    `Dev top-up: ${requests} req + ${tokens} tok`,
    "mock"
  );

  return NextResponse.json({
    ok: true,
    remainingRequests: result.remainingRequests,
    remainingTokens: result.remainingTokens,
    addedRequests: requests,
    addedTokens: tokens,
  });
}
