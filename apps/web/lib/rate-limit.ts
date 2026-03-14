import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface RateLimitParams {
  userId?: string | null;
  ip?: string | null;
  key: string;
  windowSec: number;
  limit: number;
  cost?: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

export function isRateLimitEnabled(): boolean {
  const flag = process.env.RATE_LIMITS_ENABLED;
  if (flag === undefined) return true;
  return flag === "1" || flag === "true";
}

function getWindowStart(windowSec: number): Date {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  return new Date(windowStart * 1000);
}

export async function rateLimit({
  userId,
  ip,
  key,
  windowSec,
  limit,
  cost = 1,
}: RateLimitParams): Promise<RateLimitResult> {
  if (!isRateLimitEnabled()) {
    return { ok: true, remaining: limit, resetAt: new Date(Date.now() + windowSec * 1000), limit };
  }

  const windowStart = getWindowStart(windowSec);
  const resetAt = new Date(windowStart.getTime() + windowSec * 1000);
  const userIdVal = userId ?? "";
  const ipVal = ip ?? "";

  try {
    const result = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("id", "userId", "ip", "key", "windowStart", "windowSec", "count", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userIdVal}, ${ipVal}, ${key}, ${windowStart}, ${windowSec}, ${cost}, NOW(), NOW())
      ON CONFLICT ("userId", "ip", "key", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + ${cost}, "updatedAt" = NOW()
      WHERE "RateLimitBucket"."count" + ${cost} <= ${limit}
      RETURNING "count"
    `;

    if (result.length === 0) {
      const current = await prisma.rateLimitBucket.findUnique({
        where: { userId_ip_key_windowStart: { userId: userIdVal, ip: ipVal, key, windowStart } },
        select: { count: true },
      });
      return { ok: false, remaining: Math.max(0, limit - (current?.count ?? limit)), resetAt, limit };
    }

    return { ok: true, remaining: limit - Number(result[0].count), resetAt, limit };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, remaining: 0, resetAt, limit };
    }
    return { ok: false, remaining: 0, resetAt, limit };
  }
}

const activeStreams = new Map<string, number>();

export function acquireStream(userId: string, limit: number): { ok: boolean; current: number } {
  if (!isRateLimitEnabled()) {
    return { ok: true, current: 0 };
  }
  const current = activeStreams.get(userId) || 0;
  if (current >= limit) {
    return { ok: false, current };
  }
  activeStreams.set(userId, current + 1);
  return { ok: true, current: current + 1 };
}

export function releaseStream(userId: string): void {
  const current = activeStreams.get(userId) || 0;
  if (current <= 1) {
    activeStreams.delete(userId);
  } else {
    activeStreams.set(userId, current - 1);
  }
}

export function getEnvLimit(envVar: string, defaultVal: number): number {
  const raw = process.env[envVar];
  if (!raw) return defaultVal;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

export async function cleanupExpiredBuckets(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return result.count;
}
