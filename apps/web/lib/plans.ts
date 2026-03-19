import { prisma } from "./prisma";
import { isAdminUser, isAdminEmail } from "./admin";

export type PlanKey = "basic" | "pro" | "enterprise";

export interface PlanLimits {
  planKey: PlanKey;
  maxRunningBuilds: number;
  maxQueuedBuilds: number;
  maxAiRequestsPerMonth: number;
  maxAiTokensPerMonth: number;
  maxDeploysPerDay: number;
  priority: number;
}

const PLAN_DEFAULTS: Record<PlanKey, PlanLimits> = {
  basic: {
    planKey: "basic",
    maxRunningBuilds: 1,
    maxQueuedBuilds: 3,
    maxAiRequestsPerMonth: 50,
    maxAiTokensPerMonth: 100_000,
    maxDeploysPerDay: 3,
    priority: 0,
  },
  pro: {
    planKey: "pro",
    maxRunningBuilds: 3,
    maxQueuedBuilds: 10,
    maxAiRequestsPerMonth: 500,
    maxAiTokensPerMonth: 1_000_000,
    maxDeploysPerDay: 20,
    priority: 10,
  },
  enterprise: {
    planKey: "enterprise",
    maxRunningBuilds: 10,
    maxQueuedBuilds: 50,
    maxAiRequestsPerMonth: 5000,
    maxAiTokensPerMonth: 10_000_000,
    maxDeploysPerDay: 100,
    priority: 20,
  },
};

const planCache = new Map<string, { plan: PlanKey; ts: number }>();
const PLAN_CACHE_TTL = 60_000;

export function isValidPlanKey(key: string): key is PlanKey {
  return key === "basic" || key === "pro" || key === "enterprise";
}

export async function getUserPlan(userId: string): Promise<PlanKey> {
  const cached = planCache.get(userId);
  if (cached && Date.now() - cached.ts < PLAN_CACHE_TTL) return cached.plan;

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true },
  });

  const plan: PlanKey = (sub && sub.status === "active" && isValidPlanKey(sub.planKey))
    ? sub.planKey
    : "basic";

  planCache.set(userId, { plan, ts: Date.now() });
  return plan;
}

export async function getLimits(userId: string): Promise<PlanLimits> {
  if (await isAdminUser(userId)) {
    return {
      planKey: "enterprise",
      maxRunningBuilds: 999,
      maxQueuedBuilds: 999,
      maxAiRequestsPerMonth: 999_999,
      maxAiTokensPerMonth: 999_999_999,
      maxDeploysPerDay: 999,
      priority: 100,
    };
  }

  const planKey = await getUserPlan(userId);
  return getLimitsByPlan(planKey);
}

export function getLimitsByPlan(planKey: PlanKey): PlanLimits {
  return PLAN_DEFAULTS[planKey] ?? PLAN_DEFAULTS.basic;
}

export function isOwnerUnlimited(email: string | null | undefined): boolean {
  return isAdminEmail(email);
}

export async function setUserPlan(userId: string, planKey: PlanKey): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, planKey, status: "active" },
    update: { planKey, status: "active" },
  });
  planCache.delete(userId);
}

export function clearPlanCache(userId?: string): void {
  if (userId) {
    planCache.delete(userId);
  } else {
    planCache.clear();
  }
}

export const PLAN_DISPLAY: Record<PlanKey, { label: string; color: string; price: string }> = {
  basic: { label: "Basic", color: "text-muted-foreground", price: "Free" },
  pro: { label: "Pro", color: "text-blue-500", price: "$29/mo" },
  enterprise: { label: "Enterprise", color: "text-violet-500", price: "$99/mo" },
};
