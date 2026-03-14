import { prisma } from "./prisma";
import { stopDeployment } from "./deployer";
import * as fs from "fs";
import * as path from "path";

const WORKSPACES_BASE = "/tmp/workspaces";

function getWorkspaceTtlHours(): number {
  return parseInt(process.env.WORKSPACE_TTL_HOURS || "24", 10);
}

function getMaxWorkspacesPerUser(): number {
  return parseInt(process.env.MAX_WORKSPACES_PER_USER || "20", 10);
}

function getMaxActiveDeploymentsPerUser(): number {
  return parseInt(process.env.MAX_ACTIVE_DEPLOYMENTS_PER_USER || "5", 10);
}

function safePath(jobId: string): string | null {
  const resolved = path.resolve(WORKSPACES_BASE, jobId);
  if (!resolved.startsWith(WORKSPACES_BASE + "/") || resolved === WORKSPACES_BASE) {
    return null;
  }
  if (jobId.includes("..") || jobId.includes("/")) {
    return null;
  }
  return resolved;
}

function rmrfSync(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

async function getActiveDeploymentJobIds(): Promise<Set<string>> {
  const activeDeployments = await prisma.deployment.findMany({
    where: { status: "SUCCESS" },
    select: { jobId: true },
  });
  return new Set(activeDeployments.map((d) => d.jobId));
}

export async function cleanupWorkspaces(): Promise<{ deleted: number; errors: string[] }> {
  const ttlHours = getWorkspaceTtlHours();
  const maxPerUser = getMaxWorkspacesPerUser();
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  let deleted = 0;
  const errors: string[] = [];

  const protectedJobIds = await getActiveDeploymentJobIds();

  const expiredJobs = await prisma.job.findMany({
    where: {
      createdAt: { lt: cutoff },
      status: { not: "RUNNING" },
    },
    select: { id: true },
  });

  for (const job of expiredJobs) {
    if (protectedJobIds.has(job.id)) continue;
    const wsPath = safePath(job.id);
    if (wsPath && fs.existsSync(wsPath)) {
      try {
        rmrfSync(wsPath);
        deleted++;
      } catch (e) {
        errors.push(`Failed to delete ${job.id}: ${e}`);
      }
    }
  }

  const allUsers = await prisma.project.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of allUsers) {
    const userJobs = await prisma.job.findMany({
      where: { project: { userId }, status: { not: "RUNNING" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (userJobs.length <= maxPerUser) continue;

    const excess = userJobs.slice(maxPerUser);
    for (const job of excess) {
      if (protectedJobIds.has(job.id)) continue;
      const wsPath = safePath(job.id);
      if (wsPath && fs.existsSync(wsPath)) {
        try {
          rmrfSync(wsPath);
          deleted++;
        } catch (e) {
          errors.push(`Failed to delete excess ${job.id}: ${e}`);
        }
      }
    }
  }

  return { deleted, errors };
}

export async function cleanupDeployments(): Promise<{ stopped: number; errors: string[] }> {
  const ttlHours = getWorkspaceTtlHours();
  const maxPerUser = getMaxActiveDeploymentsPerUser();
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  let stopped = 0;
  const errors: string[] = [];

  const expiredDeployments = await prisma.deployment.findMany({
    where: {
      createdAt: { lt: cutoff },
      status: "SUCCESS",
    },
    select: { id: true, userId: true },
  });

  for (const dep of expiredDeployments) {
    try {
      await stopDeployment(dep.id);
      stopped++;
    } catch (e) {
      errors.push(`Failed to stop expired deployment ${dep.id}: ${e}`);
    }
  }

  const usersWithDeployments = await prisma.deployment.groupBy({
    by: ["userId"],
    where: { status: "SUCCESS" },
    _count: { id: true },
    having: { id: { _count: { gt: maxPerUser } } },
  });

  for (const group of usersWithDeployments) {
    const userDeps = await prisma.deployment.findMany({
      where: { userId: group.userId, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const excess = userDeps.slice(maxPerUser);
    for (const dep of excess) {
      try {
        await stopDeployment(dep.id);
        stopped++;
      } catch (e) {
        errors.push(`Failed to stop excess deployment ${dep.id}: ${e}`);
      }
    }
  }

  return { stopped, errors };
}

let lastCleanupRun = 0;
const CLEANUP_COOLDOWN_MS = 60_000;

export async function opportunisticCleanup(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupRun < CLEANUP_COOLDOWN_MS) return;
  lastCleanupRun = now;

  try {
    await cleanupWorkspaces();
    await cleanupDeployments();
  } catch {}
}
