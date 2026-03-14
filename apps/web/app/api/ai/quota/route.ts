import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAiQuota, aiQuotaEnabled, ensureInitialAiQuota } from "@/lib/ai-quota";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!aiQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      remainingRequests: 9999,
      remainingTokens: 9999999,
      low: false,
    });
  }

  await ensureInitialAiQuota(session.user.id);
  const quota = await getAiQuota(session.user.id);

  const lowReqs = quota.remainingRequests <= 5;
  const lowTokens = quota.remainingTokens <= 1000;

  return NextResponse.json({
    enabled: true,
    remainingRequests: quota.remainingRequests,
    remainingTokens: quota.remainingTokens,
    low: lowReqs || lowTokens,
    exhausted: quota.remainingRequests <= 0 || quota.remainingTokens <= 0,
  });
}
