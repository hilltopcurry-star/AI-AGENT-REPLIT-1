import { prisma } from "./prisma";
import { isAdminUser } from "./admin";
import { getLimits } from "./plans";

export function getMaxConcurrentBuildsPerWorker(): number {
  return parseInt(process.env.MAX_CONCURRENT_BUILDS_PER_WORKER || "2", 10);
}

export async function enqueueBuild(
  userId: string,
  projectId: string,
  jobId?: string
): Promise<{ queueJobId: string; position: number }> {
  const admin = await isAdminUser(userId);
  const limits = await getLimits(userId);

  if (!admin) {
    const running = await prisma.buildQueueJob.count({
      where: { userId, status: "RUNNING" },
    });
    if (running >= limits.maxRunningBuilds) {
      const queued = await prisma.buildQueueJob.count({
        where: { userId, status: "QUEUED" },
      });
      if (queued >= limits.maxQueuedBuilds) {
        throw new Error(
          `Queue limit reached (${limits.maxQueuedBuilds} queued, ${limits.maxRunningBuilds} running). ` +
          `Upgrade your plan for higher limits.`
        );
      }
    }
  }

  const queueJob = await prisma.buildQueueJob.create({
    data: {
      userId,
      projectId,
      jobId,
      status: "QUEUED",
      priority: limits.priority,
    },
  });

  const position = await prisma.buildQueueJob.count({
    where: {
      status: "QUEUED",
      createdAt: { lte: queueJob.createdAt },
    },
  });

  return { queueJobId: queueJob.id, position };
}

export async function getQueuePosition(queueJobId: string): Promise<{
  status: string;
  position: number;
  attempts: number;
  error: string | null;
}> {
  const job = await prisma.buildQueueJob.findUnique({
    where: { id: queueJobId },
  });
  if (!job) throw new Error("Queue job not found");

  let position = 0;
  if (job.status === "QUEUED") {
    position = await prisma.buildQueueJob.count({
      where: {
        status: "QUEUED",
        createdAt: { lte: job.createdAt },
      },
    });
  }

  return {
    status: job.status,
    position,
    attempts: job.attempts,
    error: job.error,
  };
}

export async function getQueueStatus(projectId: string): Promise<{
  latestJob: {
    id: string;
    status: string;
    position: number;
    createdAt: Date;
  } | null;
}> {
  const latest = await prisma.buildQueueJob.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) return { latestJob: null };

  let position = 0;
  if (latest.status === "QUEUED") {
    position = await prisma.buildQueueJob.count({
      where: {
        status: "QUEUED",
        createdAt: { lte: latest.createdAt },
      },
    });
  }

  return {
    latestJob: {
      id: latest.id,
      status: latest.status,
      position,
      createdAt: latest.createdAt,
    },
  };
}

export async function lockNextJob(workerId: string): Promise<{
  id: string;
  userId: string;
  projectId: string;
  jobId: string | null;
  attempts: number;
} | null> {
  const now = new Date();

  const jobs = await prisma.buildQueueJob.findMany({
    where: {
      status: "QUEUED",
      availableAt: { lte: now },
      lockedAt: null,
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "asc" },
    ],
    take: 1,
  });

  if (jobs.length === 0) return null;

  const job = jobs[0];

  const updated = await prisma.buildQueueJob.updateMany({
    where: {
      id: job.id,
      status: "QUEUED",
      lockedAt: null,
    },
    data: {
      status: "RUNNING",
      lockedAt: now,
      lockedBy: workerId,
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) return null;

  return {
    id: job.id,
    userId: job.userId,
    projectId: job.projectId,
    jobId: job.jobId,
    attempts: job.attempts + 1,
  };
}

export async function completeQueueJob(
  queueJobId: string,
  status: "SUCCESS" | "FAILED",
  error?: string
): Promise<void> {
  await prisma.buildQueueJob.update({
    where: { id: queueJobId },
    data: {
      status,
      error: error || null,
      lockedAt: null,
    },
  });
}

export async function requeueJob(queueJobId: string, error: string): Promise<boolean> {
  const job = await prisma.buildQueueJob.findUnique({
    where: { id: queueJobId },
  });
  if (!job) return false;

  if (job.attempts >= job.maxAttempts) {
    await completeQueueJob(queueJobId, "FAILED", `Max attempts (${job.maxAttempts}) reached. Last error: ${error}`);
    return false;
  }

  const retryDelay = Math.min(30000, 5000 * Math.pow(2, job.attempts));
  const availableAt = new Date(Date.now() + retryDelay);

  await prisma.buildQueueJob.update({
    where: { id: queueJobId },
    data: {
      status: "QUEUED",
      lockedAt: null,
      lockedBy: null,
      error,
      availableAt,
    },
  });

  return true;
}

export async function getQueueDepth(): Promise<{
  queued: number;
  running: number;
  failed: number;
  total: number;
}> {
  const [queued, running, failed, total] = await Promise.all([
    prisma.buildQueueJob.count({ where: { status: "QUEUED" } }),
    prisma.buildQueueJob.count({ where: { status: "RUNNING" } }),
    prisma.buildQueueJob.count({ where: { status: "FAILED" } }),
    prisma.buildQueueJob.count(),
  ]);
  return { queued, running, failed, total };
}
