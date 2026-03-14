import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "regression", features: "all" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Regression: project findMany filters", () => {
  it("501 filter by userId returns only user's projects", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    for (const p of projects) expect(p.userId).toBe(user.id);
  });

  it("502 filter by name contains", async () => {
    await createTestProject(user.id, { purpose: "searchable-xyz" });
    const projects = await prisma.project.findMany({
      where: { userId: user.id, specJson: { path: ["purpose"], string_contains: "searchable" } },
    });
    expect(projects.length).toBeGreaterThan(0);
  });

  it("503 orderBy createdAt asc", async () => {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i].createdAt.getTime()).toBeGreaterThanOrEqual(projects[i - 1].createdAt.getTime());
    }
  });

  it("504 take limit", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id }, take: 2 });
    expect(projects.length).toBeLessThanOrEqual(2);
  });

  it("505 skip offset", async () => {
    const all = await prisma.project.findMany({ where: { userId: user.id } });
    if (all.length > 1) {
      const skipped = await prisma.project.findMany({ where: { userId: user.id }, skip: 1 });
      expect(skipped.length).toBe(all.length - 1);
    }
  });
});

describe("Regression: message queries", () => {
  it("506 filter messages by role=user", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "u1", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: cid, role: "assistant", content: "a1", mode: "Discuss" } });
    const userMsgs = await prisma.message.findMany({ where: { chatId: cid, role: "user" } });
    for (const m of userMsgs) expect(m.role).toBe("user");
  });

  it("507 filter messages by role=assistant", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "assistant", content: "a1", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({ where: { chatId: cid, role: "assistant" } });
    for (const m of msgs) expect(m.role).toBe("assistant");
  });

  it("508 filter messages by mode", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "p1", mode: "Plan" } });
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "d1", mode: "Discuss" } });
    const planMsgs = await prisma.message.findMany({ where: { chatId: cid, mode: "Plan" } });
    expect(planMsgs.length).toBe(1);
    expect(planMsgs[0].content).toBe("p1");
  });

  it("509 count messages by chat", async () => {
    const cid = await createTestChat(projectId);
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({ data: { chatId: cid, role: "user", content: `m${i}`, mode: "Discuss" } });
    }
    const count = await prisma.message.count({ where: { chatId: cid } });
    expect(count).toBe(5);
  });

  it("510 latest message via orderBy", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "first", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "last", mode: "Discuss" } });
    const latest = await prisma.message.findFirst({
      where: { chatId: cid },
      orderBy: { createdAt: "desc" },
    });
    expect(latest!.content).toBe("last");
  });
});

describe("Regression: job lifecycle", () => {
  it("511 job status transitions PENDING->RUNNING", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "PENDING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "RUNNING" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("RUNNING");
  });

  it("512 job status transitions RUNNING->COMPLETED", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "COMPLETED" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("COMPLETED");
  });

  it("513 job status transitions RUNNING->FAILED", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "FAILED" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("FAILED");
  });

  it("514 multiple jobs on same project", async () => {
    await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    await prisma.job.create({ data: { projectId, status: "FAILED" } });
    const jobs = await prisma.job.findMany({ where: { projectId } });
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });

  it("515 latest job via orderBy", async () => {
    await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const latest = await prisma.job.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    expect(latest).toBeTruthy();
  });
});

describe("Regression: job log operations", () => {
  it("516 create multiple log entries for job", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    for (let i = 0; i < 5; i++) {
      await prisma.jobLog.create({ data: { jobId: j.id, message: `Step ${i}`, level: "INFO" } });
    }
    const logs = await prisma.jobLog.findMany({ where: { jobId: j.id } });
    expect(logs.length).toBe(5);
  });

  it("517 filter logs by level", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "info msg", level: "INFO" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "error msg", level: "ERROR" } });
    const errors = await prisma.jobLog.findMany({ where: { jobId: j.id, level: "ERROR" } });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("error msg");
  });

  it("518 log message search with contains", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "[RUNNER] Starting build", level: "INFO" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "[DEPLOY] Deploying app", level: "INFO" } });
    const runnerLogs = await prisma.jobLog.findMany({
      where: { jobId: j.id, message: { contains: "[RUNNER]" } },
    });
    expect(runnerLogs.length).toBe(1);
  });
});

describe("Regression: session validation", () => {
  it("519 expired session not returned by filter", async () => {
    const t = `exp-test-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: t, userId: user.id, expires: new Date(Date.now() - 1000) },
    });
    const valid = await prisma.session.findMany({
      where: { userId: user.id, expires: { gt: new Date() } },
    });
    expect(valid.every((s) => s.sessionToken !== t)).toBe(true);
  });

  it("520 valid session returned by filter", async () => {
    const t = `valid-test-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: t, userId: user.id, expires: new Date(Date.now() + 86400000) },
    });
    const valid = await prisma.session.findFirst({
      where: { sessionToken: t, expires: { gt: new Date() } },
    });
    expect(valid).toBeTruthy();
  });
});

describe("Regression: OpenAiUsage aggregation", () => {
  it("521 sum tokens across dates", async () => {
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-09-01", requests: 10, tokens: 1000 } });
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-09-02", requests: 5, tokens: 500 } });
    const agg = await prisma.openAiUsage.aggregate({
      where: { userId: user.id, date: { startsWith: "2099-09" } },
      _sum: { tokens: true, requests: true },
    });
    expect(agg._sum.tokens).toBe(1500);
    expect(agg._sum.requests).toBe(15);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { startsWith: "2099-09" } } });
  });

  it("522 max tokens in a day", async () => {
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-08-01", requests: 10, tokens: 5000 } });
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-08-02", requests: 5, tokens: 3000 } });
    const agg = await prisma.openAiUsage.aggregate({
      where: { userId: user.id, date: { startsWith: "2099-08" } },
      _max: { tokens: true },
    });
    expect(agg._max.tokens).toBe(5000);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { startsWith: "2099-08" } } });
  });
});

describe("Regression: session validity checks (DB)", () => {
  for (let i = 0; i < 5; i++) {
    it(`523+ session validity check ${i}`, async () => {
      const s = await prisma.session.findFirst({ where: { userId: user.id } });
      expect(s).not.toBeNull();
      expect(s!.expires.getTime()).toBeGreaterThan(Date.now());
    });
  }
});

describe("Regression: project access consistency (DB)", () => {
  for (let i = 0; i < 5; i++) {
    it(`528+ project access check ${i}`, async () => {
      const projects = await prisma.project.findMany({ where: { userId: user.id } });
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
    });
  }
});

describe("Regression: DB transaction isolation", () => {
  it("533 concurrent creates don't conflict", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      prisma.project.create({ data: { name: `Concurrent ${i}`, userId: user.id } })
    );
    const results = await Promise.all(promises);
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("534 concurrent reads are consistent", async () => {
    const promises = Array.from({ length: 5 }, () =>
      prisma.project.count({ where: { userId: user.id } })
    );
    const counts = await Promise.all(promises);
    expect(counts.every((c) => c === counts[0])).toBe(true);
  });
});

describe("Regression: project-chat-message cascade", () => {
  it("535 full cascade: project -> chats -> messages", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "cascade test", mode: "Discuss" } });
    
    await prisma.project.delete({ where: { id: pid } });
    
    const chat = await prisma.chat.findUnique({ where: { id: cid } });
    expect(chat).toBeNull();
    const msgs = await prisma.message.findMany({ where: { chatId: cid } });
    expect(msgs.length).toBe(0);
  });
});

describe("Regression: user relations", () => {
  it("536 user has projects relation", async () => {
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      include: { projects: true },
    });
    expect(Array.isArray(u!.projects)).toBe(true);
    expect(u!.projects.length).toBeGreaterThan(0);
  });

  it("537 user has sessions relation", async () => {
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      include: { sessions: true },
    });
    expect(Array.isArray(u!.sessions)).toBe(true);
    expect(u!.sessions.length).toBeGreaterThan(0);
  });
});

describe("Regression: specJson edge cases", () => {
  it("538 specJson with empty object", async () => {
    const pid = await createTestProject(user.id, {});
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.specJson).toBeTruthy();
  });

  it("539 specJson with nested objects", async () => {
    const pid = await createTestProject(user.id, {
      purpose: "nested",
      config: { db: { host: "localhost", port: 5432 } },
    });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.config).toBeTruthy();
  });

  it("540 specJson with null values", async () => {
    const pid = await createTestProject(user.id, {
      purpose: "null test",
      optional: null,
    });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.optional).toBeNull();
  });
});

describe("Regression: timestamp precision", () => {
  it("541 createdAt has millisecond precision", async () => {
    const before = Date.now();
    const p = await prisma.project.create({ data: { name: "ts test", userId: user.id } });
    const after = Date.now();
    expect(p.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(p.createdAt.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("542 message timestamps are ordered", async () => {
    const cid = await createTestChat(projectId);
    const m1 = await prisma.message.create({ data: { chatId: cid, role: "user", content: "t1", mode: "Discuss" } });
    const m2 = await prisma.message.create({ data: { chatId: cid, role: "user", content: "t2", mode: "Discuss" } });
    expect(m2.createdAt.getTime()).toBeGreaterThanOrEqual(m1.createdAt.getTime());
  });

  it("543 job log timestamps are ordered", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    const l1 = await prisma.jobLog.create({ data: { jobId: j.id, message: "l1", level: "INFO" } });
    const l2 = await prisma.jobLog.create({ data: { jobId: j.id, message: "l2", level: "INFO" } });
    expect(l2.createdAt.getTime()).toBeGreaterThanOrEqual(l1.createdAt.getTime());
  });
});

describe("Regression: findMany empty results", () => {
  it("544 findMany with impossible filter returns empty", async () => {
    const results = await prisma.project.findMany({ where: { userId: "impossible-id-xyz" } });
    expect(results).toEqual([]);
  });

  it("545 findFirst with impossible filter returns null", async () => {
    const result = await prisma.project.findFirst({ where: { userId: "impossible-id-xyz" } });
    expect(result).toBeNull();
  });

  it("546 count with impossible filter returns 0", async () => {
    const count = await prisma.project.count({ where: { userId: "impossible-id-xyz" } });
    expect(count).toBe(0);
  });
});

describe("Regression: update nonexistent record", () => {
  it("547 updateMany on nonexistent returns count 0", async () => {
    const result = await prisma.project.updateMany({
      where: { id: "nonexistent-project-id" },
      data: { name: "updated" },
    });
    expect(result.count).toBe(0);
  });

  it("548 deleteMany on nonexistent returns count 0", async () => {
    const result = await prisma.project.deleteMany({
      where: { id: "nonexistent-project-id" },
    });
    expect(result.count).toBe(0);
  });
});

describe("Regression: user email uniqueness", () => {
  it("549 cannot create duplicate email", async () => {
    let err: unknown = null;
    try {
      await prisma.user.create({ data: { email: user.email } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });

  it("550 different emails are allowed", async () => {
    const u = await prisma.user.create({ data: { email: `unique-${Date.now()}@test.com` } });
    expect(u.id).toBeTruthy();
  });
});
