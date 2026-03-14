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
  ]);

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
  });
}
