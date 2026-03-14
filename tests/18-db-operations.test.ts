import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestProject, createTestChat, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("DB: CRUD operations on Project", () => {
  it("461 create project", async () => {
    const p = await prisma.project.create({ data: { name: "CRUD Test", userId: user.id } });
    expect(p.id).toBeTruthy();
  });

  it("462 read project", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p).toBeTruthy();
  });

  it("463 update project name", async () => {
    const pid = await createTestProject(user.id);
    await prisma.project.update({ where: { id: pid }, data: { name: "Updated" } });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.name).toBe("Updated");
  });

  it("464 delete project", async () => {
    const pid = await createTestProject(user.id);
    await prisma.project.delete({ where: { id: pid } });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p).toBeNull();
  });

  it("465 count user projects", async () => {
    const count = await prisma.project.count({ where: { userId: user.id } });
    expect(typeof count).toBe("number");
  });
});

describe("DB: CRUD on Chat", () => {
  it("466 create chat", async () => {
    const pid = await createTestProject(user.id);
    const c = await prisma.chat.create({ data: { projectId: pid } });
    expect(c.id).toBeTruthy();
  });

  it("467 read chat", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const c = await prisma.chat.findUnique({ where: { id: cid } });
    expect(c).toBeTruthy();
  });

  it("468 delete chat", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.chat.delete({ where: { id: cid } });
    const c = await prisma.chat.findUnique({ where: { id: cid } });
    expect(c).toBeNull();
  });

  it("469 count project chats", async () => {
    const pid = await createTestProject(user.id);
    await createTestChat(pid);
    await createTestChat(pid);
    const count = await prisma.chat.count({ where: { projectId: pid } });
    expect(count).toBe(2);
  });
});

describe("DB: CRUD on Message", () => {
  it("470 create message", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const m = await prisma.message.create({
      data: { chatId: cid, role: "user", content: "CRUD msg", mode: "Discuss" },
    });
    expect(m.id).toBeTruthy();
  });

  it("471 read message", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const m = await prisma.message.create({
      data: { chatId: cid, role: "user", content: "read test", mode: "Discuss" },
    });
    const found = await prisma.message.findUnique({ where: { id: m.id } });
    expect(found!.content).toBe("read test");
  });

  it("472 update message content", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const m = await prisma.message.create({
      data: { chatId: cid, role: "user", content: "before", mode: "Discuss" },
    });
    await prisma.message.update({ where: { id: m.id }, data: { content: "after" } });
    const found = await prisma.message.findUnique({ where: { id: m.id } });
    expect(found!.content).toBe("after");
  });

  it("473 delete message", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const m = await prisma.message.create({
      data: { chatId: cid, role: "user", content: "del me", mode: "Discuss" },
    });
    await prisma.message.delete({ where: { id: m.id } });
    const found = await prisma.message.findUnique({ where: { id: m.id } });
    expect(found).toBeNull();
  });

  it("474 count chat messages", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    for (let i = 0; i < 3; i++) {
      await prisma.message.create({
        data: { chatId: cid, role: "user", content: `msg ${i}`, mode: "Discuss" },
      });
    }
    const count = await prisma.message.count({ where: { chatId: cid } });
    expect(count).toBe(3);
  });
});

describe("DB: CRUD on Job", () => {
  it("475 create job", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    expect(j.id).toBeTruthy();
  });

  it("476 update job status", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "COMPLETED" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("COMPLETED");
  });

  it("477 delete job", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    await prisma.job.delete({ where: { id: j.id } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found).toBeNull();
  });

  it("478 list jobs by project", async () => {
    const pid = await createTestProject(user.id);
    await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    await prisma.job.create({ data: { projectId: pid, status: "COMPLETED" } });
    const jobs = await prisma.job.findMany({ where: { projectId: pid } });
    expect(jobs.length).toBe(2);
  });

  it("479 list jobs by status", async () => {
    const pid = await createTestProject(user.id);
    await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    const pending = await prisma.job.findMany({ where: { projectId: pid, status: "PENDING" } });
    expect(pending.length).toBe(1);
  });
});

describe("DB: CRUD on JobLog", () => {
  it("480 create job log", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "RUNNING" } });
    const log = await prisma.jobLog.create({
      data: { jobId: j.id, message: "test log", level: "INFO" },
    });
    expect(log.id).toBeTruthy();
  });

  it("481 read job logs", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "RUNNING" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "log 1", level: "INFO" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "log 2", level: "WARN" } });
    const logs = await prisma.jobLog.findMany({ where: { jobId: j.id } });
    expect(logs.length).toBe(2);
  });

  it("482 job log levels", async () => {
    const pid = await createTestProject(user.id);
    const j = await prisma.job.create({ data: { projectId: pid, status: "RUNNING" } });
    const levels = ["INFO", "SUCCESS", "WARN", "ERROR"];
    for (const level of levels) {
      const log = await prisma.jobLog.create({ data: { jobId: j.id, message: `${level} msg`, level } });
      expect(log.level).toBe(level);
    }
  });
});

describe("DB: CRUD on Session", () => {
  it("483 create session", async () => {
    const s = await prisma.session.create({
      data: { sessionToken: `test-${Date.now()}`, userId: user.id, expires: new Date(Date.now() + 86400000) },
    });
    expect(s.sessionToken).toBeTruthy();
  });

  it("484 read session", async () => {
    const token = `read-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 86400000) },
    });
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    expect(s).toBeTruthy();
  });

  it("485 delete session", async () => {
    const token = `del-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 86400000) },
    });
    await prisma.session.delete({ where: { sessionToken: token } });
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    expect(s).toBeNull();
  });
});

describe("DB: OpenAiUsage CRUD", () => {
  it("486 create usage", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-10-01", requests: 0, tokens: 0 },
    });
    expect(u.id).toBeTruthy();
    await prisma.openAiUsage.delete({ where: { id: u.id } });
  });

  it("487 increment usage", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-10-02", requests: 5, tokens: 500 },
    });
    await prisma.openAiUsage.update({
      where: { id: u.id },
      data: { requests: { increment: 1 }, tokens: { increment: 100 } },
    });
    const found = await prisma.openAiUsage.findUnique({ where: { id: u.id } });
    expect(found!.requests).toBe(6);
    expect(found!.tokens).toBe(600);
    await prisma.openAiUsage.delete({ where: { id: u.id } });
  });

  it("488 find usage by userId and date", async () => {
    const date = "2099-10-03";
    await prisma.openAiUsage.create({
      data: { userId: user.id, date, requests: 10, tokens: 1000 },
    });
    const found = await prisma.openAiUsage.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    expect(found!.requests).toBe(10);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });
  });

  it("489 delete usage", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-10-04", requests: 0, tokens: 0 },
    });
    await prisma.openAiUsage.delete({ where: { id: u.id } });
    const found = await prisma.openAiUsage.findUnique({ where: { id: u.id } });
    expect(found).toBeNull();
  });
});

describe("DB: aggregate queries", () => {
  it("490 count all users", async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThan(0);
  });

  it("491 count all projects", async () => {
    const count = await prisma.project.count();
    expect(typeof count).toBe("number");
  });

  it("492 count all sessions", async () => {
    const count = await prisma.session.count();
    expect(count).toBeGreaterThan(0);
  });

  it("493 count all chats", async () => {
    const count = await prisma.chat.count();
    expect(typeof count).toBe("number");
  });

  it("494 count all messages", async () => {
    const count = await prisma.message.count();
    expect(typeof count).toBe("number");
  });

  it("495 count all jobs", async () => {
    const count = await prisma.job.count();
    expect(typeof count).toBe("number");
  });

  it("496 groupBy job status", async () => {
    const pid = await createTestProject(user.id);
    await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    await prisma.job.create({ data: { projectId: pid, status: "COMPLETED" } });
    const groups = await prisma.job.groupBy({ by: ["status"], _count: true });
    expect(groups.length).toBeGreaterThan(0);
  });
});

describe("DB: ordering and pagination", () => {
  it("497 projects ordered by createdAt desc", async () => {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(projects[i].createdAt.getTime());
    }
  });

  it("498 pagination with skip/take", async () => {
    const all = await prisma.project.findMany({ where: { userId: user.id } });
    if (all.length >= 2) {
      const page1 = await prisma.project.findMany({ where: { userId: user.id }, take: 1 });
      const page2 = await prisma.project.findMany({ where: { userId: user.id }, skip: 1, take: 1 });
      expect(page1[0].id).not.toBe(page2[0].id);
    }
  });

  it("499 findFirst returns single result", async () => {
    const p = await prisma.project.findFirst({ where: { userId: user.id } });
    expect(p).toBeTruthy();
  });

  it("500 findMany with where filter", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    for (const p of projects) {
      expect(p.userId).toBe(user.id);
    }
  });
});
