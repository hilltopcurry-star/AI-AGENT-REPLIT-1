import { prisma } from "./prisma";

export class InsufficientCreditsError extends Error {
  code = "NO_CREDITS" as const;
  balance: number;
  required: number;
  reserved: boolean;
  constructor(balance: number, required: number, reserved = false) {
    super(
      reserved
        ? `Reserved credits: have ${balance} (${getReserveMin()} reserved), need ${required}`
        : `Insufficient credits: have ${balance}, need ${required}`
    );
    this.balance = balance;
    this.required = required;
    this.reserved = reserved;
  }
}

export function creditsEnabled(): boolean {
  return process.env.CREDITS_ENABLED !== "0";
}

function costEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0) return fallback;
  return n;
}

export function getCostBuild(): number {
  return costEnv("COST_BUILD", 10);
}
export function getCostDeploy(): number {
  return costEnv("COST_DEPLOY", 5);
}
export function getCostLlm(): number {
  return costEnv("COST_LLM_REQUEST", 1);
}
export function getLowThreshold(): number {
  return costEnv("LOW_CREDITS_THRESHOLD", 5);
}
export function getReserveMin(): number {
  return costEnv("CREDIT_RESERVE_MIN", 2);
}
export function getPurchaseBonus(): number {
  return costEnv("CREDIT_PURCHASE_BONUS", 2);
}

export function isReserved(balance: number): boolean {
  if (!creditsEnabled()) return false;
  return balance <= getReserveMin();
}

export async function getBalance(userId: string): Promise<number> {
  if (!creditsEnabled()) return 999;
  const row = await prisma.creditBalance.findUnique({ where: { userId } });
  return row?.balance ?? 0;
}

export async function addCredits(
  userId: string,
  amount: number,
  reason: string,
  source: string
): Promise<number> {
  if (amount <= 0) throw new Error("addCredits: amount must be positive");

  return prisma.$transaction(async (tx) => {
    await tx.creditLedger.create({
      data: { userId, amount, reason, source },
    });

    const bal = await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, balance: amount },
      update: { balance: { increment: amount } },
    });

    return bal.balance;
  });
}

export async function addCreditsWithBonus(
  userId: string,
  amount: number,
  reason: string,
  source: string
): Promise<{ balance: number; bonus: number }> {
  if (amount <= 0) throw new Error("addCreditsWithBonus: amount must be positive");
  const bonus = getPurchaseBonus();

  return prisma.$transaction(async (tx) => {
    await tx.creditLedger.create({
      data: { userId, amount, reason, source },
    });

    if (bonus > 0) {
      await tx.creditLedger.create({
        data: { userId, amount: bonus, reason: "purchase_bonus", source: "bonus" },
      });
    }

    const total = amount + bonus;
    const bal = await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, balance: total },
      update: { balance: { increment: total } },
    });

    return { balance: bal.balance, bonus };
  });
}

export async function atomicDeduct(
  userId: string,
  amount: number,
  action: string,
  jobId?: string,
  projectId?: string
): Promise<number> {
  if (amount <= 0) throw new Error("atomicDeduct: amount must be positive");
  const reserve = getReserveMin();

  return prisma.$transaction(async (tx) => {
    const bal = await tx.creditBalance.findUnique({ where: { userId } });
    const current = bal?.balance ?? 0;

    if (current - amount < reserve) {
      throw new InsufficientCreditsError(current, amount, current <= reserve);
    }

    const updated = await tx.creditBalance.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await tx.creditLedger.create({
      data: { userId, amount: -amount, reason: `${action} charge`, source: "system" },
    });

    await tx.creditUsage.create({
      data: { userId, amount, action, jobId: jobId || null, projectId: projectId || null },
    });

    return updated.balance;
  });
}

export async function deductCredits(
  userId: string,
  amount: number,
  action: string,
  jobId?: string,
  projectId?: string
): Promise<number> {
  return atomicDeduct(userId, amount, action, jobId, projectId);
}

export async function requireCredits(
  userId: string,
  cost: number,
  _action: string,
): Promise<void> {
  if (!creditsEnabled()) return;
  const balance = await getBalance(userId);
  const reserve = getReserveMin();
  if (balance - cost < reserve) {
    throw new InsufficientCreditsError(balance, cost, balance <= reserve);
  }
}

export async function requireAndDeductCredits(
  userId: string,
  cost: number,
  action: string,
  jobId?: string,
  projectId?: string
): Promise<number> {
  if (!creditsEnabled()) return 999;
  return atomicDeduct(userId, cost, action, jobId, projectId);
}

export async function ensureInitialCredits(userId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.creditBalance.findUnique({ where: { userId } });
    if (existing) return existing.balance;

    const hasAnyLedger = await tx.creditLedger.findFirst({ where: { userId } });
    if (hasAnyLedger) return 0;

    await tx.creditLedger.create({
      data: { userId, amount: 50, reason: "Welcome bonus", source: "promo" },
    });

    const bal = await tx.creditBalance.create({
      data: { userId, balance: 50 },
    });

    return bal.balance;
  });
}
