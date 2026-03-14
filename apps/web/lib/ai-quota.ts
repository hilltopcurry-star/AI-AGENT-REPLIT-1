import { prisma } from "./prisma";

export class AiQuotaExhaustedError extends Error {
  code = "AI_QUOTA_EXHAUSTED" as const;
  remainingRequests: number;
  remainingTokens: number;
  constructor(remainingRequests: number, remainingTokens: number) {
    super(`AI quota exhausted: ${remainingRequests} requests, ${remainingTokens} tokens remaining`);
    this.remainingRequests = remainingRequests;
    this.remainingTokens = remainingTokens;
  }
}

export function aiQuotaEnabled(): boolean {
  return process.env.AI_QUOTA_ENABLED !== "0";
}

export async function getAiQuota(userId: string): Promise<{ remainingRequests: number; remainingTokens: number }> {
  if (!aiQuotaEnabled()) return { remainingRequests: 9999, remainingTokens: 9999999 };
  const row = await prisma.aiQuotaBalance.findUnique({ where: { userId } });
  return {
    remainingRequests: row?.remainingRequests ?? 0,
    remainingTokens: row?.remainingTokens ?? 0,
  };
}

export async function addAiQuota(
  userId: string,
  addRequests: number,
  addTokens: number,
  reason: string,
  source: string
): Promise<{ remainingRequests: number; remainingTokens: number }> {
  if (addRequests < 0 || addTokens < 0) throw new Error("addAiQuota: amounts must be non-negative");

  return prisma.$transaction(async (tx) => {
    await tx.aiQuotaLedger.create({
      data: { userId, amountRequests: addRequests, amountTokens: addTokens, reason, source },
    });

    const bal = await tx.aiQuotaBalance.upsert({
      where: { userId },
      create: { userId, remainingRequests: addRequests, remainingTokens: addTokens },
      update: {
        remainingRequests: { increment: addRequests },
        remainingTokens: { increment: addTokens },
      },
    });

    return { remainingRequests: bal.remainingRequests, remainingTokens: bal.remainingTokens };
  });
}

export async function requireAiQuota(
  userId: string,
  reqCost: number,
  tokenCost: number
): Promise<void> {
  if (!aiQuotaEnabled()) return;
  const quota = await getAiQuota(userId);
  if (quota.remainingRequests < reqCost || quota.remainingTokens < tokenCost) {
    throw new AiQuotaExhaustedError(quota.remainingRequests, quota.remainingTokens);
  }
}

export async function deductAiQuotaAtomic(
  userId: string,
  reqCost: number,
  tokenCost: number
): Promise<{ remainingRequests: number; remainingTokens: number }> {
  if (!aiQuotaEnabled()) return { remainingRequests: 9999, remainingTokens: 9999999 };

  return prisma.$transaction(async (tx) => {
    const bal = await tx.aiQuotaBalance.findUnique({ where: { userId } });
    const curReqs = bal?.remainingRequests ?? 0;
    const curTokens = bal?.remainingTokens ?? 0;

    if (curReqs < reqCost || curTokens < tokenCost) {
      throw new AiQuotaExhaustedError(curReqs, curTokens);
    }

    const updated = await tx.aiQuotaBalance.update({
      where: { userId },
      data: {
        remainingRequests: { decrement: reqCost },
        remainingTokens: { decrement: tokenCost },
      },
    });

    await tx.aiQuotaLedger.create({
      data: {
        userId,
        amountRequests: -reqCost,
        amountTokens: -tokenCost,
        reason: "LLM request",
        source: "system",
      },
    });

    return { remainingRequests: updated.remainingRequests, remainingTokens: updated.remainingTokens };
  });
}

export async function refundAiQuotaTokens(
  userId: string,
  refundTokens: number
): Promise<void> {
  if (!aiQuotaEnabled() || refundTokens <= 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.aiQuotaBalance.update({
      where: { userId },
      data: { remainingTokens: { increment: refundTokens } },
    });
    await tx.aiQuotaLedger.create({
      data: {
        userId,
        amountRequests: 0,
        amountTokens: refundTokens,
        reason: "Token refund (unused reservation)",
        source: "system",
      },
    });
  });
}

export async function ensureInitialAiQuota(userId: string): Promise<{ remainingRequests: number; remainingTokens: number }> {
  if (!aiQuotaEnabled()) return { remainingRequests: 9999, remainingTokens: 9999999 };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiQuotaBalance.findUnique({ where: { userId } });
    if (existing) return { remainingRequests: existing.remainingRequests, remainingTokens: existing.remainingTokens };

    const hasAny = await tx.aiQuotaLedger.findFirst({ where: { userId } });
    if (hasAny) return { remainingRequests: 0, remainingTokens: 0 };

    const initialReqs = parseInt(process.env.AI_QUOTA_INITIAL_REQUESTS || "20", 10);
    const initialTokens = parseInt(process.env.AI_QUOTA_INITIAL_TOKENS || "10000", 10);

    await tx.aiQuotaLedger.create({
      data: { userId, amountRequests: initialReqs, amountTokens: initialTokens, reason: "Welcome AI quota", source: "promo" },
    });

    const bal = await tx.aiQuotaBalance.create({
      data: { userId, remainingRequests: initialReqs, remainingTokens: initialTokens },
    });

    return { remainingRequests: bal.remainingRequests, remainingTokens: bal.remainingTokens };
  });
}
