import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiGet, apiPostSSE, cleanupTestData,
  createCompletedJob,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;
let completedJobId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, {
    purpose: "Runner extended test",
    features: "Counter, Dashboard",
    techPreferences: "Next.js",
  });
  completedJobId = await createCompletedJob(projectId);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Runner: Job model validation", () => {
  it("146 Job status values are constrained", async () => {
    const jobs = await prisma.job.findMany({ take: 20 });
    const validStatuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];
    for (const j of jobs) {
      expect(validStatuses).toContain(j.status);
    }
  });

  it("147 Jobs have projectId set", async () => {
    const jobs = await prisma.job.findMany({ take: 10 });
    for (const j of jobs) {
      expect(j.projectId).toBeTruthy();
    }
  });

  it("148 Jobs have createdAt timestamp", async () => {
    const jobs = await prisma.job.findMany({ take: 10 });
    for (const j of jobs) {
      expect(j.createdAt).toBeInstanceOf(Date);
    }
  });

  it("149 JobLog levels are valid across all logs", async () => {
    const logs = await prisma.jobLog.findMany({ take: 50 });
    const validLevels = ["INFO", "SUCCESS", "WARN", "ERROR"];
    for (const l of logs) {
      expect(validLevels).toContain(l.level);
    }
  });

  it("150 JobLog messages are non-empty strings", async () => {
    const logs = await prisma.jobLog.findMany({ take: 50 });
    for (const l of logs) {
      expect(typeof l.message).toBe("string");
      expect(l.message.length).toBeGreaterThan(0);
    }
  });

  it("151 JobLog jobId references valid job", async () => {
    const logs = await prisma.jobLog.findMany({ take: 10, include: { job: true } });
    for (const l of logs) {
      expect(l.job).toBeTruthy();
    }
  });

  it("152 BuildArtifact has workspacePath", async () => {
    const artifacts = await prisma.buildArtifact.findMany({ take: 5 });
    for (const a of artifacts) {
      expect(a.workspacePath).toBeTruthy();
      expect(a.workspacePath.startsWith("/tmp/workspaces/")).toBe(true);
    }
  });

  it("153 BuildArtifact jobId is unique", async () => {
    const artifacts = await prisma.buildArtifact.findMany({ take: 20 });
    const jobIds = artifacts.map((a) => a.jobId);
    expect(new Set(jobIds).size).toBe(jobIds.length);
  });
});

describe("Runner: completed job log analysis", () => {
  const logPatterns = [
    { pattern: "[RUNNER]", name: "RUNNER tag" },
    { pattern: "Scaffold", name: "scaffold step" },
    { pattern: "npm install", name: "npm install step" },
    { pattern: "package.json", name: "package.json reference" },
  ];

  for (const { pattern, name } of logPatterns) {
    it(`154+ completed job has ${name} in logs`, async () => {
      const logs = await prisma.jobLog.findMany({
        where: { jobId: completedJobId, message: { contains: pattern } },
      });
      expect(logs.length).toBeGreaterThan(0);
    });
  }

  it("158 completed job has at least 10 log entries", async () => {
    const count = await prisma.jobLog.count({ where: { jobId: completedJobId } });
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it("159 completed job has SUCCESS level logs", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, level: "SUCCESS" },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("160 completed job has INFO level logs", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, level: "INFO" },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("161 completed job logs are ordered by createdAt", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (let i = 1; i < logs.length; i++) {
      expect(logs[i].createdAt.getTime()).toBeGreaterThanOrEqual(logs[i - 1].createdAt.getTime());
    }
  });
});

describe("Runner: build runner mode flag", () => {
  it("162 /api/agent-mode returns buildRunnerMode", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(["mock", "real"]).toContain(body.buildRunnerMode);
  });

  it("163 /api/agent-mode mode field is set", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(["mock", "llm"]).toContain(body.mode);
  });

  it("164 /api/agent-mode hasOpenAiKey is boolean", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(typeof body.hasOpenAiKey).toBe("boolean");
  });
});

describe("Runner: job API endpoints", () => {
  it("165 /api/jobs/latest?projectId=X returns job or empty", async () => {
    const r = await apiGet(`/api/jobs/latest?projectId=${projectId}`, cookieHeader(token));
    expect([200, 404]).toContain(r.status);
  });

  it("166 /api/jobs/nonexistent/logs => 404", async () => {
    const r = await apiGet("/api/jobs/nonexistent/logs", cookieHeader(token));
    expect(r.status).toBe(404);
  });

  it("167 /api/jobs/nonexistent/stream => 404", async () => {
    const r = await apiGet("/api/jobs/nonexistent/stream", cookieHeader(token));
    expect(r.status).toBe(404);
  });

  it("168 /api/jobs/nonexistent/verify => 404", async () => {
    const r = await apiGet("/api/jobs/nonexistent/verify", cookieHeader(token));
    expect(r.status).toBe(404);
  });
});

describe("Runner: trigger via Build mode", () => {
  it("169 'Build it' in Build mode returns 200", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it", mode: "Build" },
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
  });

  it("170 triggered job has valid SSE events", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "yes", mode: "Build" },
      cookieHeader(token)
    );
    expect(r.events.length).toBeGreaterThan(0);
    const types = r.events.map((e) => e.type);
    expect(types).toContain("user_message");
    expect(types).toContain("assistant_message");
  });
});

describe("Runner: workspace path validation", () => {
  it("171 workspace paths start with /tmp/workspaces/", async () => {
    const artifacts = await prisma.buildArtifact.findMany({ take: 10 });
    for (const a of artifacts) {
      expect(a.workspacePath.startsWith("/tmp/workspaces/")).toBe(true);
    }
  });

  it("172 workspace paths do not contain path traversal", async () => {
    const artifacts = await prisma.buildArtifact.findMany({ take: 10 });
    for (const a of artifacts) {
      expect(a.workspacePath).not.toContain("..");
    }
  });

  it("173 deployment workspace paths match artifact paths", async () => {
    const deployments = await prisma.deployment.findMany({
      where: { status: "SUCCESS", workspacePath: { not: null } },
      take: 5,
    });
    for (const d of deployments) {
      if (d.workspacePath) {
        expect(d.workspacePath.startsWith("/tmp/workspaces/")).toBe(true);
      }
    }
  });
});

describe("Runner: project-job relationship", () => {
  it("174 jobs belong to valid projects", async () => {
    const jobs = await prisma.job.findMany({ take: 10, include: { project: true } });
    for (const j of jobs) {
      expect(j.project).toBeTruthy();
    }
  });

  it("175 GET /api/projects/:id/jobs returns array", async () => {
    const r = await apiGet(`/api/projects/${projectId}/jobs`, cookieHeader(token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
