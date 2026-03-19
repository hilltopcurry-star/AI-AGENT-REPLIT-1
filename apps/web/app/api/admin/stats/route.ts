import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0 && !adminEmails.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    totalUsers,
    totalProjects,
    queueDepth,
    recentQueueJobs,
    creditsSold,
    aiQuotaSold,
    planDistribution,
    topUsersByBuilds,
    topUsersByAi,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    Promise.all([
      prisma.buildQueueJob.count({ where: { status: "QUEUED" } }),
      prisma.buildQueueJob.count({ where: { status: "RUNNING" } }),
      prisma.buildQueueJob.count({ where: { status: "FAILED" } }),
      prisma.buildQueueJob.count({ where: { status: "SUCCESS" } }),
      prisma.buildQueueJob.count(),
    ]).then(([queued, running, failed, success, total]) => ({ queued, running, failed, success, total })),
    prisma.buildQueueJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        user: { select: { email: true, name: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.creditLedger.aggregate({
      where: { source: { in: ["mock", "stripe"] }, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.aiQuotaLedger.aggregate({
      where: { source: { in: ["mock", "stripe"] }, amountRequests: { gt: 0 } },
      _sum: { amountRequests: true, amountTokens: true },
    }),
    prisma.subscription.groupBy({
      by: ["planKey"],
      where: { status: "active" },
      _count: { _all: true },
    }).catch(() => []),
    prisma.buildQueueJob.groupBy({
      by: ["userId"],
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }).then(async (rows) => {
      const userIds = rows.map((r) => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      return rows.map((r) => ({
        userId: r.userId,
        email: userMap.get(r.userId)?.email || null,
        name: userMap.get(r.userId)?.name || null,
        builds: r._count._all,
      }));
    }).catch(() => []),
    prisma.openAiUsage.groupBy({
      by: ["userId"],
      _sum: { requests: true, tokens: true },
      orderBy: { _sum: { requests: "desc" } },
      take: 5,
    }).then(async (rows) => {
      const userIds = rows.map((r) => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      return rows.map((r) => ({
        userId: r.userId,
        email: userMap.get(r.userId)?.email || null,
        name: userMap.get(r.userId)?.name || null,
        requests: r._sum.requests || 0,
        tokens: r._sum.tokens || 0,
      }));
    }).catch(() => []),
  ]);

  const planCounts: Record<string, number> = { basic: 0, pro: 0, enterprise: 0 };
  for (const row of planDistribution) {
    planCounts[row.planKey] = row._count._all;
  }
  const totalSubs = Object.values(planCounts).reduce((a, b) => a + b, 0);
  planCounts.basic = Math.max(0, totalUsers - totalSubs) + (planCounts.basic || 0);

  const queueByPlan = await prisma.$queryRaw<Array<{ planKey: string; queued: bigint; running: bigint }>>`
    SELECT
      COALESCE(s."planKey", 'basic') AS "planKey",
      COUNT(*) FILTER (WHERE b."status" = 'QUEUED') AS queued,
      COUNT(*) FILTER (WHERE b."status" = 'RUNNING') AS running
    FROM "BuildQueueJob" b
    LEFT JOIN "Subscription" s ON s."userId" = b."userId"
    WHERE b."status" IN ('QUEUED', 'RUNNING')
    GROUP BY COALESCE(s."planKey", 'basic')
  `.catch(() => []);

  const queueByPlanMap: Record<string, { queued: number; running: number }> = {};
  for (const row of queueByPlan) {
    queueByPlanMap[row.planKey] = {
      queued: Number(row.queued),
      running: Number(row.running),
    };
  }

  return NextResponse.json({
    totalUsers,
    totalProjects,
    queueDepth,
    recentQueueJobs: recentQueueJobs.map((j) => ({
      id: j.id,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      error: j.error,
      userEmail: j.user.email,
      userName: j.user.name,
      projectName: j.project.name,
      createdAt: j.createdAt,
      lockedBy: j.lockedBy,
    })),
    creditsSold: creditsSold._sum.amount || 0,
    aiQuotaSold: {
      requests: aiQuotaSold._sum.amountRequests || 0,
      tokens: aiQuotaSold._sum.amountTokens || 0,
    },
    planCounts,
    queueByPlan: queueByPlanMap,
    topUsersByBuilds,
    topUsersByAi,
    mrr: {
      placeholder: true,
      estimated: (planCounts.pro || 0) * 29 + (planCounts.enterprise || 0) * 99,
    },
  });
}
