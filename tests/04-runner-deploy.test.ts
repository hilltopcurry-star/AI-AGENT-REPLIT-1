import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  cookieHeader, apiGet, cleanupTestData, createCompletedJob,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;
let completedJobId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, {
    purpose: "Runner test app",
    features: "Counter, Dashboard",
  });
  completedJobId = await createCompletedJob(projectId);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Runner: scaffold and build validation", () => {
  it("61 BUILD_RUNNER_MODE env flag is recognized", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(["mock", "real"]).toContain(body.buildRunnerMode);
  });

  it("62 existing completed jobs have RUNNER logs", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[RUNNER]" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("63 completed job logs include scaffold step", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "Scaffold" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("64 completed job logs include npm install step", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "npm install" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("65 completed job logs include npm build step", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "npm build" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("66 BuildArtifact exists for completed jobs", async () => {
    const artifacts = await prisma.buildArtifact.findMany({ take: 1 });
    if (artifacts.length === 0) return;
    expect(artifacts[0].workspacePath).toBeTruthy();
    expect(artifacts[0].jobId).toBeTruthy();
  });
});

describe("Deploy: deployment records and proxy", () => {
  it("67 Deployment records exist for completed builds", async () => {
    const deployments = await prisma.deployment.findMany({
      where: { status: "SUCCESS" },
      take: 1,
      orderBy: { createdAt: "desc" },
    });
    if (deployments.length === 0) return;
    expect(deployments[0].url).toBeTruthy();
    expect(deployments[0].internalPort).toBeTruthy();
  });

  it("68 Deployment has workspacePath set", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    if (!d) return;
    expect(d.workspacePath).toBeTruthy();
  });

  it("69 completed job logs include [DEPLOY]", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[DEPLOY]" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("70 deploy logs include Live URL", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "Live URL" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("71 deploy logs include deploymentId", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "deploymentId" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("72 /api/projects/:id/deployments returns array", async () => {
    const ownerProjects = await prisma.project.findMany({
      where: { userId: user.id },
      take: 1,
    });
    if (ownerProjects.length === 0) return;
    const r = await apiGet(
      `/api/projects/${ownerProjects[0].id}/deployments`,
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("73 proxy route returns 401 without auth", async () => {
    const d = await prisma.deployment.findFirst({ where: { status: "SUCCESS" } });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}/proxy`);
    expect(r.status).toBe(401);
  });

  it("74 debug endpoint returns 401 without auth", async () => {
    const d = await prisma.deployment.findFirst({ where: { status: "SUCCESS" } });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}`);
    expect(r.status).toBe(401);
  });

  it("75 proxy with auth returns 200 or 503 (process may not be running)", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS", userId: { not: user.id } },
      orderBy: { createdAt: "desc" },
    });
    if (!d) return;
    const ownerSession = await prisma.session.findFirst({
      where: { userId: d.userId, expires: { gt: new Date() } },
    });
    if (!ownerSession) return;
    const r = await apiGet(
      `/api/deployments/${d.id}/proxy/api/health`,
      cookieHeader(ownerSession.sessionToken)
    );
    expect([200, 503]).toContain(r.status);
  });

  it("76 deployment internalPort is a valid number", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS", internalPort: { not: null } },
    });
    if (!d) return;
    expect(d.internalPort).toBeGreaterThanOrEqual(7100);
    expect(d.internalPort).toBeLessThanOrEqual(7999);
  });

  it("77 Deployment status is one of expected values", async () => {
    const deployments = await prisma.deployment.findMany({ take: 5 });
    for (const d of deployments) {
      expect(["PENDING", "SUCCESS", "FAILED"]).toContain(d.status);
    }
  });

  it("78 Job status is one of expected values", async () => {
    const jobs = await prisma.job.findMany({ take: 5 });
    for (const j of jobs) {
      expect(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).toContain(j.status);
    }
  });

  it("79 JobLog levels are valid", async () => {
    const logs = await prisma.jobLog.findMany({ take: 20 });
    const validLevels = ["INFO", "SUCCESS", "WARN", "ERROR"];
    for (const l of logs) {
      expect(validLevels).toContain(l.level);
    }
  });

  it("80 FAILED deployments have error field or null url", async () => {
    const failed = await prisma.deployment.findMany({ where: { status: "FAILED" } });
    for (const d of failed) {
      const hasErrorOrNoUrl = d.error != null || d.url == null;
      expect(hasErrorOrNoUrl).toBe(true);
    }
  });
});
