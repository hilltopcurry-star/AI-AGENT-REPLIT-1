import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAiQuota, aiQuotaEnabled } from "@/lib/ai-quota";
import { isKillSwitchEnabled } from "@/lib/llm-agent";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() || "";
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session!.user!.id!;
  const today = new Date().toISOString().slice(0, 10);

  const quota = await getAiQuota(userId);

  const dailyUsage = await prisma.openAiUsage.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  const maxReqsPerDay = parseInt(process.env.OPENAI_MAX_REQUESTS_PER_DAY_PER_USER || "50", 10);
  const maxTokensPerDay = parseInt(process.env.OPENAI_MAX_TOKENS_PER_DAY_PER_USER || "20000", 10);

  const exhaustedQuota = aiQuotaEnabled() && (quota.remainingRequests <= 0 || quota.remainingTokens <= 0);
  const exhaustedDailyCap = (dailyUsage?.requests ?? 0) >= maxReqsPerDay || (dailyUsage?.tokens ?? 0) >= maxTokensPerDay;
  const killSwitch = isKillSwitchEnabled();

  return NextResponse.json({
    sessionEmail: email,
    userId,
    aiQuotaEnabled: aiQuotaEnabled(),
    aiQuotaBalance: {
      remainingRequests: quota.remainingRequests,
      remainingTokens: quota.remainingTokens,
    },
    openAiUsage: {
      date: today,
      requests: dailyUsage?.requests ?? 0,
      tokens: dailyUsage?.tokens ?? 0,
      maxRequestsPerDay: maxReqsPerDay,
      maxTokensPerDay: maxTokensPerDay,
    },
    status: {
      exhaustedQuota,
      exhaustedDailyCap,
      killSwitch,
      wouldBlock: killSwitch || exhaustedQuota || exhaustedDailyCap,
    },
  });
}
