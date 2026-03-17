import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAiQuota, aiQuotaEnabled, ensureInitialAiQuota } from "@/lib/ai-quota";
import { isAdminEmail } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdminEmail(session.user.email);

  if (!aiQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      remainingRequests: 9999,
      remainingTokens: 9999999,
      low: false,
      admin,
    });
  }

  await ensureInitialAiQuota(session.user.id);
  const quota = await getAiQuota(session.user.id);

  return NextResponse.json({
    enabled: true,
    remainingRequests: quota.remainingRequests,
    remainingTokens: quota.remainingTokens,
    low: admin ? false : (quota.remainingRequests <= 5 || quota.remainingTokens <= 1000),
    exhausted: admin ? false : (quota.remainingRequests <= 0 || quota.remainingTokens <= 0),
    admin,
  });
}
