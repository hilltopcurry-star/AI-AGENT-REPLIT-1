import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, createTestUser, createTestProject, createTestChat, cleanupTestData } from "./helpers";

let user: { id: string; email: string };

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Schema: User model", () => {
  it("301 user has id", async () => {
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.id).toBeTruthy();
  });

  it("302 user has email", async () => {
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.email).toBeTruthy();
  });

  it("303 user email is unique", async () => {
    let err: unknown = null;
    try {
      await prisma.user.create({ data: { email: user.email } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });

  it("304 user can have name", async () => {
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u).toHaveProperty("name");
  });

  it("305 user can have image", async () => {
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u).toHaveProperty("image");
  });
});

describe("Schema: Project model", () => {
  it("306 project has id", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.id).toBeTruthy();
  });

  it("307 project has userId", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.userId).toBe(user.id);
  });

  it("308 project has name", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.name).toBeTruthy();
  });

  it("309 project has createdAt", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.createdAt).toBeInstanceOf(Date);
  });

  it("310 project belongs to user", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid }, include: { user: true } });
    expect(p!.user.id).toBe(user.id);
  });

  it("311 project has chats relation", async () => {
    const pid = await createTestProject(user.id);
    await createTestChat(pid);
    const p = await prisma.project.findUnique({ where: { id: pid }, include: { chats: true } });
    expect(p!.chats.length).toBeGreaterThan(0);
  });

  it("312 project has jobs relation", async () => {
    const pid = await createTestProject(user.id);
    const p = await prisma.project.findUnique({ where: { id: pid }, include: { jobs: true } });
    expect(Array.isArray(p!.jobs)).toBe(true);
  });
});

describe("Schema: Chat model", () => {
  it("313 chat has id", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const c = await prisma.chat.findUnique({ where: { id: cid } });
    expect(c!.id).toBeTruthy();
  });

  it("314 chat has projectId", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const c = await prisma.chat.findUnique({ where: { id: cid } });
    expect(c!.projectId).toBe(pid);
  });

  it("315 chat has messages relation", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const c = await prisma.chat.findUnique({ where: { id: cid }, include: { messages: true } });
    expect(Array.isArray(c!.messages)).toBe(true);
  });

  it("316 chat has createdAt", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const c = await prisma.chat.findUnique({ where: { id: cid } });
    expect(c!.createdAt).toBeInstanceOf(Date);
  });
});

describe("Schema: Message model", () => {
  it("317 message has required fields", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    const msg = await prisma.message.create({
      data: { chatId: cid, role: "user", content: "test msg", mode: "Discuss" },
    });
    expect(msg.id).toBeTruthy();
    expect(msg.chatId).toBe(cid);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("test msg");
    expect(msg.mode).toBe("Discuss");
  });

  it("318 message role is user or assistant", async () => {
    const msgs = await prisma.message.findMany({ take: 20 });
    for (const m of msgs) {
      expect(["user", "assistant"]).toContain(m.role);
    }
  });

  it("319 message has createdAt", async () => {
    const msgs = await prisma.message.findMany({ take: 10 });
    for (const m of msgs) {
      expect(m.createdAt).toBeInstanceOf(Date);
    }
  });

  it("320 message content is string", async () => {
    const msgs = await prisma.message.findMany({ take: 10 });
    for (const m of msgs) {
      expect(typeof m.content).toBe("string");
    }
  });
});

describe("Schema: Session model", () => {
  it("321 session has sessionToken", async () => {
    const sessions = await prisma.session.findMany({ where: { userId: user.id }, take: 5 });
    for (const s of sessions) {
      expect(s.sessionToken).toBeTruthy();
    }
  });

  it("322 session has expires", async () => {
    const sessions = await prisma.session.findMany({ where: { userId: user.id }, take: 5 });
    for (const s of sessions) {
      expect(s.expires).toBeInstanceOf(Date);
    }
  });

  it("323 session has userId", async () => {
    const sessions = await prisma.session.findMany({ where: { userId: user.id }, take: 5 });
    for (const s of sessions) {
      expect(s.userId).toBe(user.id);
    }
  });

  it("324 sessionToken is unique", async () => {
    const sessions = await prisma.session.findMany({ take: 50 });
    const tokens = sessions.map((s) => s.sessionToken);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe("Schema: Job model fields", () => {
  it("325 job has id", async () => {
    const pid = await createTestProject(user.id);
    const job = await prisma.job.create({ data: { projectId: pid, status: "PENDING" } });
    expect(job.id).toBeTruthy();
  });

  it("326 job has status", async () => {
    const jobs = await prisma.job.findMany({ take: 10 });
    for (const j of jobs) {
      expect(j.status).toBeTruthy();
    }
  });

  it("327 job has projectId", async () => {
    const jobs = await prisma.job.findMany({ take: 10 });
    for (const j of jobs) {
      expect(j.projectId).toBeTruthy();
    }
  });

  it("328 job has createdAt", async () => {
    const jobs = await prisma.job.findMany({ take: 10 });
    for (const j of jobs) {
      expect(j.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe("Schema: OpenAiUsage model fields", () => {
  it("329 OpenAiUsage has userId", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-11-01", requests: 0, tokens: 0 },
    });
    expect(u.userId).toBe(user.id);
    await prisma.openAiUsage.delete({ where: { id: u.id } });
  });

  it("330 OpenAiUsage has date field", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-11-02", requests: 0, tokens: 0 },
    });
    expect(u.date).toBe("2099-11-02");
    await prisma.openAiUsage.delete({ where: { id: u.id } });
  });

  it("331 OpenAiUsage has requests and tokens", async () => {
    const u = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-11-03", requests: 5, tokens: 500 },
    });
    expect(u.requests).toBe(5);
    expect(u.tokens).toBe(500);
    await prisma.openAiUsage.delete({ where: { id: u.id } });
  });
});

describe("Schema: cascade & referential integrity", () => {
  it("332 deleting project cascades to chats", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.project.delete({ where: { id: pid } });
    const chat = await prisma.chat.findUnique({ where: { id: cid } });
    expect(chat).toBeNull();
  });

  it("333 deleting chat cascades to messages", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "del test", mode: "Discuss" } });
    await prisma.chat.delete({ where: { id: cid } });
    const msgs = await prisma.message.findMany({ where: { chatId: cid } });
    expect(msgs.length).toBe(0);
  });

  it("334 project requires valid userId", async () => {
    let err: unknown = null;
    try {
      await prisma.project.create({ data: { name: "bad", userId: "nonexistent-user-id" } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });
});
