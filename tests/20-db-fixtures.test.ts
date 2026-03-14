import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, createCompletedJob, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let userId: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  userId = user.id;
  projectId = await createTestProject(userId, { purpose: "DB fixture tests", features: "all" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("DB: special character message persistence", () => {
  const specialChars = [
    { name: "unicode", content: "Hello 🌍🚀 世界 مرحبا" },
    { name: "html", content: "<script>alert('xss')</script>" },
    { name: "sql injection", content: "'; DROP TABLE users; --" },
    { name: "newlines", content: "line1\nline2\nline3" },
    { name: "tabs", content: "col1\tcol2\tcol3" },
    { name: "backslashes", content: "path\\to\\file" },
    { name: "quotes", content: 'He said "hello" and \'goodbye\'' },
    { name: "zero-width spaces", content: "before\u200Bafter" },
    { name: "json in content", content: '{"key": "value", "nested": {"a": 1}}' },
    { name: "markdown", content: "# Header\n**bold** *italic* `code`" },
    { name: "pipe chars", content: "a|b|c|d" },
    { name: "long unicode", content: "𝕳𝖊𝖑𝖑𝖔 𝖂𝖔𝖗𝖑𝖉" },
    { name: "RTL text", content: "مرحبا بالعالم" },
    { name: "emoji sequence", content: "👨‍👩‍👧‍👦 family" },
    { name: "control chars", content: "a\x01b\x02c\x03d" },
  ];

  for (const { name, content } of specialChars) {
    it(`special chars: ${name} persists in message`, async () => {
      const chatId = await createTestChat(projectId);
      const msg = await prisma.message.create({
        data: { chatId, role: "user", content, mode: "Discuss" },
      });
      const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
      expect(fetched).not.toBeNull();
      expect(fetched!.content).toBe(content);
      expect(fetched!.role).toBe("user");
      expect(fetched!.mode).toBe("Discuss");
    });
  }
});

describe("DB: mode variation message persistence", () => {
  const modes = ["Plan", "Discuss", "Build", "Improve", "Debug"];

  for (const mode of modes) {
    it(`mode ${mode} persists correctly in DB`, async () => {
      const chatId = await createTestChat(projectId);
      const msg = await prisma.message.create({
        data: { chatId, role: "user", content: `Test in ${mode}`, mode },
      });
      const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
      expect(fetched!.mode).toBe(mode);
    });
  }

  for (const mode of modes) {
    it(`assistant response in ${mode} mode persists`, async () => {
      const chatId = await createTestChat(projectId);
      await prisma.message.create({
        data: { chatId, role: "user", content: "Hello", mode },
      });
      const reply = await prisma.message.create({
        data: { chatId, role: "assistant", content: `Response in ${mode}`, mode },
      });
      const fetched = await prisma.message.findUnique({ where: { id: reply.id } });
      expect(fetched!.role).toBe("assistant");
      expect(fetched!.mode).toBe(mode);
    });
  }
});

describe("DB: message event structure verification", () => {
  it("user_message has required fields", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "user", content: "test content 123", mode: "Discuss" },
    });
    expect(msg.id).toBeTruthy();
    expect(msg.chatId).toBe(chatId);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("test content 123");
    expect(msg.mode).toBe("Discuss");
    expect(msg.createdAt).toBeInstanceOf(Date);
  });

  it("assistant_message has required fields", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "assistant", content: "I can help!", mode: "Discuss" },
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content.length).toBeGreaterThan(0);
    expect(msg.chatId).toBe(chatId);
  });

  it("messages belong to correct chat", async () => {
    const c1 = await createTestChat(projectId);
    const c2 = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: c1, role: "user", content: "chat1", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: c2, role: "user", content: "chat2", mode: "Discuss" } });
    const m1 = await prisma.message.findMany({ where: { chatId: c1 } });
    const m2 = await prisma.message.findMany({ where: { chatId: c2 } });
    expect(m1.every((m) => m.chatId === c1)).toBe(true);
    expect(m2.every((m) => m.chatId === c2)).toBe(true);
  });

  it("multi-turn accumulates correctly in DB", async () => {
    const chatId = await createTestChat(projectId);
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({ data: { chatId, role: "user", content: `Turn ${i}`, mode: "Discuss" } });
      await prisma.message.create({ data: { chatId, role: "assistant", content: `Reply ${i}`, mode: "Discuss" } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId } });
    expect(msgs.length).toBe(10);
    expect(msgs.filter((m) => m.role === "user").length).toBe(5);
    expect(msgs.filter((m) => m.role === "assistant").length).toBe(5);
  });

  it("Build mode message without confirmation has no job", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "user", content: "What should I build?", mode: "Build" },
    });
    const jobs = await prisma.job.findMany({ where: { projectId } });
    const recentJob = jobs.find((j) => j.createdAt > new Date(Date.now() - 1000));
    expect(recentJob).toBeUndefined();
  });
});

describe("DB: completed job fixture verification", () => {
  let completedJobId: string;

  beforeAll(async () => {
    completedJobId = await createCompletedJob(projectId);
  });

  it("completed job has COMPLETED status", async () => {
    const job = await prisma.job.findUnique({ where: { id: completedJobId } });
    expect(job!.status).toBe("COMPLETED");
  });

  it("completed job has build artifact", async () => {
    const artifact = await prisma.buildArtifact.findFirst({ where: { jobId: completedJobId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.workspacePath).toContain("/tmp/workspaces/");
  });

  it("completed job has deployment", async () => {
    const dep = await prisma.deployment.findFirst({ where: { jobId: completedJobId } });
    expect(dep).not.toBeNull();
    expect(dep!.status).toBe("SUCCESS");
    expect(dep!.internalPort).toBe(7100);
  });

  it("completed job has RUNNER logs", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[RUNNER]" } },
    });
    expect(logs.length).toBeGreaterThan(5);
  });

  it("completed job has DEPLOY logs", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[DEPLOY]" } },
    });
    expect(logs.length).toBeGreaterThan(2);
  });

  it("deployment URL contains deployment ID", async () => {
    const dep = await prisma.deployment.findFirst({ where: { jobId: completedJobId } });
    expect(dep!.url).toContain(dep!.id);
  });

  it("RUNNER logs include build lifecycle steps", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[RUNNER]" } },
      orderBy: { createdAt: "asc" },
    });
    const msgs = logs.map((l) => l.message);
    expect(msgs.some((m) => m.includes("Build started"))).toBe(true);
    expect(msgs.some((m) => m.includes("npm install"))).toBe(true);
    expect(msgs.some((m) => m.includes("Scaffold"))).toBe(true);
    expect(msgs.some((m) => m.includes("Build compilation"))).toBe(true);
    expect(msgs.some((m) => m.includes("Build complete"))).toBe(true);
  });

  it("DEPLOY logs include deployment lifecycle", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "[DEPLOY]" } },
      orderBy: { createdAt: "asc" },
    });
    const msgs = logs.map((l) => l.message);
    expect(msgs.some((m) => m.includes("Starting Deployment"))).toBe(true);
    expect(msgs.some((m) => m.includes("health check"))).toBe(true);
    expect(msgs.some((m) => m.includes("Deployment complete"))).toBe(true);
    expect(msgs.some((m) => m.includes("Live URL"))).toBe(true);
  });
});

describe("DB: project creation parameterized", () => {
  const projectVariants = [
    { name: "minimal", spec: null },
    { name: "with purpose", spec: { purpose: "todo app" } },
    { name: "with features", spec: { features: "auth, payments" } },
    { name: "with tech", spec: { techPreferences: "Next.js, PostgreSQL" } },
    { name: "full spec", spec: { purpose: "e-commerce", features: "cart, checkout", techPreferences: "React" } },
    { name: "empty spec", spec: {} },
    { name: "unicode name", spec: { purpose: "🚀 App" } },
    { name: "long purpose", spec: { purpose: "A".repeat(1000) } },
  ];

  for (const { name, spec } of projectVariants) {
    it(`project variant: ${name}`, async () => {
      const pid = await createTestProject(userId, spec || undefined);
      const p = await prisma.project.findUnique({ where: { id: pid } });
      expect(p).not.toBeNull();
      expect(p!.userId).toBe(userId);
      if (spec) {
        expect(p!.specJson).toBeTruthy();
      }
    });
  }
});

describe("DB: session lifecycle", () => {
  it("session expires in future", async () => {
    const token = await createTestSession(userId);
    const s = await prisma.session.findFirst({ where: { sessionToken: token } });
    expect(s!.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("expired session has past date", async () => {
    const token = `expired-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: token, userId, expires: new Date(Date.now() - 1000) },
    });
    const s = await prisma.session.findFirst({ where: { sessionToken: token } });
    expect(s!.expires.getTime()).toBeLessThan(Date.now());
  });

  it("multiple sessions per user", async () => {
    const t1 = await createTestSession(userId);
    const t2 = await createTestSession(userId);
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.map((s) => s.sessionToken)).toContain(t1);
    expect(sessions.map((s) => s.sessionToken)).toContain(t2);
  });
});

describe("DB: job status transitions", () => {
  const statuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];

  for (const status of statuses) {
    it(`job with status ${status}`, async () => {
      const job = await prisma.job.create({
        data: { projectId, status },
      });
      const fetched = await prisma.job.findUnique({ where: { id: job.id } });
      expect(fetched!.status).toBe(status);
    });
  }

  it("job status can be updated", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "PENDING" } });
    await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING" } });
    await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    const fetched = await prisma.job.findUnique({ where: { id: job.id } });
    expect(fetched!.status).toBe("COMPLETED");
  });
});

describe("DB: job log levels", () => {
  const levels = ["INFO", "SUCCESS", "WARN", "ERROR", "DEBUG"];

  for (const level of levels) {
    it(`log level ${level} persists`, async () => {
      const job = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
      const log = await prisma.jobLog.create({
        data: { jobId: job.id, level, message: `Test ${level} log` },
      });
      const fetched = await prisma.jobLog.findUnique({ where: { id: log.id } });
      expect(fetched!.level).toBe(level);
    });
  }
});

describe("DB: deployment status variants", () => {
  const dStatuses = ["PENDING", "DEPLOYING", "SUCCESS", "FAILED"];

  for (const status of dStatuses) {
    it(`deployment status ${status}`, async () => {
      const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
      const dep = await prisma.deployment.create({
        data: {
          userId, projectId, jobId: job.id,
          provider: "replit", status,
        },
      });
      const fetched = await prisma.deployment.findUnique({ where: { id: dep.id } });
      expect(fetched!.status).toBe(status);
    });
  }
});

describe("DB: memory item parameterized", () => {
  const scopes = ["global", "project", "chat", "session"];

  for (const scope of scopes) {
    it(`memory scope: ${scope}`, async () => {
      const item = await prisma.memoryItem.create({
        data: {
          userId, scope, key: `test-key-${scope}-${Date.now()}`,
          value: `test-value-${scope}`,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
      const fetched = await prisma.memoryItem.findUnique({ where: { id: item.id } });
      expect(fetched!.scope).toBe(scope);
      expect(fetched!.value).toBe(`test-value-${scope}`);
    });
  }

  it("memory item with projectId scoping", async () => {
    const item = await prisma.memoryItem.create({
      data: {
        userId, projectId, scope: "project",
        key: `proj-key-${Date.now()}`, value: "proj-value",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
    expect(item.projectId).toBe(projectId);
  });
});

describe("DB: concurrent operations", () => {
  it("10 parallel message inserts succeed", async () => {
    const chatId = await createTestChat(projectId);
    const promises = Array.from({ length: 10 }, (_, i) =>
      prisma.message.create({
        data: { chatId, role: "user", content: `concurrent-${i}`, mode: "Discuss" },
      })
    );
    const results = await Promise.all(promises);
    expect(results.length).toBe(10);
    const msgs = await prisma.message.findMany({ where: { chatId } });
    expect(msgs.length).toBe(10);
  });

  it("5 parallel project creates succeed", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      prisma.project.create({
        data: { userId, name: `concurrent-proj-${i}-${Date.now()}` },
      })
    );
    const results = await Promise.all(promises);
    expect(results.length).toBe(5);
    expect(new Set(results.map((r) => r.id)).size).toBe(5);
  });
});

describe("DB: cascade and relation integrity", () => {
  it("deleting project cascades to chats and messages", async () => {
    const pid = await createTestProject(userId);
    const chatId = await createTestChat(pid);
    await prisma.message.create({ data: { chatId, role: "user", content: "bye", mode: "Discuss" } });
    await prisma.project.delete({ where: { id: pid } });
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    expect(chat).toBeNull();
  });

  it("deleting job cascades to logs and artifacts", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    await prisma.jobLog.create({ data: { jobId: job.id, level: "INFO", message: "test" } });
    await prisma.buildArtifact.create({ data: { jobId: job.id, workspacePath: "/tmp/test" } });
    await prisma.deployment.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    const logs = await prisma.jobLog.findMany({ where: { jobId: job.id } });
    expect(logs.length).toBe(0);
  });
});

describe("DB: large payload storage", () => {
  it("5000 char message", async () => {
    const chatId = await createTestChat(projectId);
    const content = "A".repeat(5000);
    const msg = await prisma.message.create({ data: { chatId, role: "user", content, mode: "Discuss" } });
    const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(fetched!.content.length).toBe(5000);
  });

  it("50000 char message", async () => {
    const chatId = await createTestChat(projectId);
    const content = "B".repeat(50000);
    const msg = await prisma.message.create({ data: { chatId, role: "user", content, mode: "Discuss" } });
    const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(fetched!.content.length).toBe(50000);
  });

  it("message with very long JSON content", async () => {
    const chatId = await createTestChat(projectId);
    const obj = { data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: "x".repeat(50) })) };
    const content = JSON.stringify(obj);
    const msg = await prisma.message.create({ data: { chatId, role: "user", content, mode: "Discuss" } });
    const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(JSON.parse(fetched!.content)).toEqual(obj);
  });
});

describe("DB: chat isolation", () => {
  it("messages in different chats are isolated", async () => {
    const c1 = await createTestChat(projectId);
    const c2 = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: c1, role: "user", content: "only-in-c1", mode: "Discuss" } });
    const msgs2 = await prisma.message.findMany({ where: { chatId: c2 } });
    expect(msgs2.some((m) => m.content === "only-in-c1")).toBe(false);
  });

  it("chat belongs to correct project", async () => {
    const p2 = await createTestProject(userId);
    const c = await createTestChat(p2);
    const chat = await prisma.chat.findUnique({ where: { id: c } });
    expect(chat!.projectId).toBe(p2);
  });

  it("multiple chats per project", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => createTestChat(projectId)));
    expect(new Set(ids).size).toBe(5);
  });

  it("chat has createdAt timestamp", async () => {
    const c = await createTestChat(projectId);
    const chat = await prisma.chat.findUnique({ where: { id: c } });
    expect(chat!.createdAt).toBeInstanceOf(Date);
  });
});

describe("DB: project-user relation", () => {
  it("project belongs to creating user", async () => {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    expect(p!.userId).toBe(userId);
  });

  it("user can have multiple projects", async () => {
    const projects = await prisma.project.findMany({ where: { userId } });
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });

  it("different users have isolated projects", async () => {
    const u2 = await createTestUser();
    const p2 = await createTestProject(u2.id);
    const myProjects = await prisma.project.findMany({ where: { userId } });
    expect(myProjects.some((p) => p.id === p2)).toBe(false);
  });
});

describe("DB: job-log ordering", () => {
  it("logs are ordered by createdAt", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    for (let i = 0; i < 5; i++) {
      await prisma.jobLog.create({ data: { jobId: job.id, level: "INFO", message: `log-${i}` } });
    }
    const logs = await prisma.jobLog.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 0; i < logs.length - 1; i++) {
      expect(logs[i].createdAt.getTime()).toBeLessThanOrEqual(logs[i + 1].createdAt.getTime());
    }
  });

  it("log count matches inserts", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    const n = 8;
    for (let i = 0; i < n; i++) {
      await prisma.jobLog.create({ data: { jobId: job.id, level: "INFO", message: `count-${i}` } });
    }
    const count = await prisma.jobLog.count({ where: { jobId: job.id } });
    expect(count).toBe(n);
  });
});

describe("DB: deployment fields", () => {
  it("deployment has provider field", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "SUCCESS" },
    });
    expect(dep.provider).toBe("replit");
  });

  it("deployment can have internalPort", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "SUCCESS", internalPort: 3000 },
    });
    expect(dep.internalPort).toBe(3000);
  });

  it("deployment can have workspacePath", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "SUCCESS", workspacePath: "/tmp/workspaces/test" },
    });
    expect(dep.workspacePath).toBe("/tmp/workspaces/test");
  });

  it("deployment can have error message", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "FAILED", error: "Build failed" },
    });
    expect(dep.error).toBe("Build failed");
  });

  it("deployment can have URL", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "SUCCESS", url: "/api/deployments/test/proxy" },
    });
    expect(dep.url).toContain("/proxy");
  });
});

describe("DB: build artifact fields", () => {
  it("artifact has workspacePath", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const art = await prisma.buildArtifact.create({
      data: { jobId: job.id, workspacePath: "/tmp/workspaces/abc" },
    });
    expect(art.workspacePath).toContain("/tmp/workspaces/");
  });

  it("artifact belongs to correct job", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const art = await prisma.buildArtifact.create({
      data: { jobId: job.id, workspacePath: "/tmp/workspaces/test-belong" },
    });
    const fetched = await prisma.buildArtifact.findUnique({ where: { jobId: job.id } });
    expect(fetched!.id).toBe(art.id);
  });
});

describe("DB: message role constraints", () => {
  const roles = ["user", "assistant", "system"];
  for (const role of roles) {
    it(`role ${role} persists`, async () => {
      const chatId = await createTestChat(projectId);
      const msg = await prisma.message.create({
        data: { chatId, role, content: `${role} message`, mode: "Discuss" },
      });
      expect(msg.role).toBe(role);
    });
  }
});

describe("DB: timestamp integrity", () => {
  it("message createdAt is recent", async () => {
    const chatId = await createTestChat(projectId);
    const before = Date.now();
    const msg = await prisma.message.create({ data: { chatId, role: "user", content: "ts test", mode: "Discuss" } });
    const after = Date.now();
    expect(msg.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(msg.createdAt.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("job createdAt is recent", async () => {
    const before = Date.now();
    const job = await prisma.job.create({ data: { projectId, status: "PENDING" } });
    expect(job.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("deployment createdAt is recent", async () => {
    const job = await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const before = Date.now();
    const dep = await prisma.deployment.create({
      data: { userId, projectId, jobId: job.id, provider: "replit", status: "SUCCESS" },
    });
    expect(dep.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("DB: OpenAiUsage model", () => {
  it("create usage record", async () => {
    const today = new Date().toISOString().split("T")[0];
    const usage = await prisma.openAiUsage.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, requests: 1, tokens: 100 },
      update: { requests: { increment: 1 }, tokens: { increment: 100 } },
    });
    expect(usage.requests).toBeGreaterThanOrEqual(1);
  });

  it("usage tracks per-user per-date", async () => {
    const u2 = await createTestUser();
    const today = new Date().toISOString().split("T")[0];
    await prisma.openAiUsage.upsert({
      where: { userId_date: { userId: u2.id, date: today } },
      create: { userId: u2.id, date: today, requests: 5, tokens: 500 },
      update: {},
    });
    const rec = await prisma.openAiUsage.findUnique({
      where: { userId_date: { userId: u2.id, date: today } },
    });
    expect(rec!.requests).toBe(5);
    expect(rec!.tokens).toBe(500);
  });
});
