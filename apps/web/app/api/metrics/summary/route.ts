import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);

  const userProjectIds = (
    await prisma.project.findMany({ where: { userId }, select: { id: true } })
  ).map((p) => p.id);

  const [
    jobs24h,
    jobs7d,
    latestJobs,
    deploys7d,
    latestDeploys,
    usageToday,
    usage7d,
    rateBuckets,
    recentErrors,
  ] = await Promise.all([
    prisma.job.groupBy({
      by: ["status"],
      where: { projectId: { in: userProjectIds }, createdAt: { gte: h24 } },
      _count: true,
    }),
    prisma.job.groupBy({
      by: ["status"],
      where: { projectId: { in: userProjectIds }, createdAt: { gte: d7 } },
      _count: true,
    }),
    prisma.job.findMany({
      where: { projectId: { in: userProjectIds } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        projectId: true,
        status: true,
        createdAt: true,
        _count: { select: { logs: true } },
      },
    }),
    prisma.deployment.groupBy({
      by: ["status"],
      where: { userId, createdAt: { gte: d7 } },
      _count: true,
    }),
    prisma.deployment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        projectId: true,
        jobId: true,
        status: true,
        url: true,
        createdAt: true,
      },
    }),
    prisma.openAiUsage.findUnique({
      where: { userId_date: { userId, date: todayStr } },
    }),
    prisma.openAiUsage.findMany({
      where: { userId, date: { gte: new Date(d7).toISOString().slice(0, 10) } },
    }),
    prisma.rateLimitBucket.findMany({
      where: { userId },
      orderBy: { windowStart: "desc" },
      take: 20,
      select: { key: true, windowStart: true, windowSec: true, count: true },
    }),
    prisma.jobLog.findMany({
      where: {
        job: { projectId: { in: userProjectIds } },
        OR: [{ level: "ERROR" }, { message: { contains: "ERROR" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, jobId: true, createdAt: true, message: true, level: true },
    }),
  ]);

  const maxReq = parseInt(process.env.OPENAI_MAX_REQUESTS_PER_DAY_PER_USER || "50", 10);
  const maxTok = parseInt(process.env.OPENAI_MAX_TOKENS_PER_DAY_PER_USER || "20000", 10);

  const statusCount = (groups: Array<{ status: string; _count: number }>, status: string) =>
    groups.find((g) => g.status === status)?._count || 0;

  const usage7dTotals = usage7d.reduce(
    (acc, u) => ({ requests: acc.requests + u.requests, tokens: acc.tokens + u.tokens }),
    { requests: 0, tokens: 0 }
  );

  return NextResponse.json({
    jobs: {
      last24h: {
        running: statusCount(jobs24h, "RUNNING"),
        completed: statusCount(jobs24h, "COMPLETED"),
        failed: statusCount(jobs24h, "FAILED"),
      },
      last7d: {
        running: statusCount(jobs7d, "RUNNING"),
        completed: statusCount(jobs7d, "COMPLETED"),
        failed: statusCount(jobs7d, "FAILED"),
      },
      latest: latestJobs.map((j) => ({
        id: j.id,
        projectId: j.projectId,
        status: j.status,
        createdAt: j.createdAt,
        logsCount: j._count.logs,
      })),
    },
    deployments: {
      last7d: {
        success: statusCount(deploys7d, "SUCCESS"),
        failed: statusCount(deploys7d, "FAILED"),
      },
      latest: latestDeploys,
    },
    openaiUsage: {
      today: {
        requests: usageToday?.requests || 0,
        tokens: usageToday?.tokens || 0,
        remainingRequests: maxReq - (usageToday?.requests || 0),
        remainingTokens: maxTok - (usageToday?.tokens || 0),
      },
      last7d: usage7dTotals,
    },
    rateLimits: rateBuckets,
    recentErrors,
  });
}
