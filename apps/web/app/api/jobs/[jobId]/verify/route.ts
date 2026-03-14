import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { project: { select: { userId: true } } },
  });

  if (!job || job.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const logCount = await prisma.jobLog.count({ where: { jobId } });

  const firstLog = await prisma.jobLog.findFirst({
    where: { jobId },
    orderBy: { createdAt: "asc" },
    select: { id: true, message: true, level: true, createdAt: true },
  });

  const lastLog = await prisma.jobLog.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    select: { id: true, message: true, level: true, createdAt: true },
  });

  return NextResponse.json({
    job: {
      id: job.id,
      projectId: job.projectId,
      status: job.status,
      createdAt: job.createdAt,
    },
    logCount,
    firstLog,
    lastLog,
  });
}
