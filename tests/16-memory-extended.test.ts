import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "Memory extended", features: "blog" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Memory: chat history accumulation (DB)", () => {
  it("419 messages accumulate across turns", async () => {
    const chat = await createTestChat(projectId);
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({ data: { chatId: chat, role: "user", content: `Turn ${i} message`, mode: "Discuss" } });
      await prisma.message.create({ data: { chatId: chat, role: "assistant", content: `Reply ${i}`, mode: "Discuss" } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId: chat } });
    expect(msgs.length).toBeGreaterThanOrEqual(10);
  });

  it("420 messages ordered by createdAt", async () => {
    const chat = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "First", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "assistant", content: "Reply 1", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "Second", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "assistant", content: "Reply 2", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({
      where: { chatId: chat },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i].createdAt.getTime()).toBeGreaterThanOrEqual(msgs[i - 1].createdAt.getTime());
    }
  });

  it("421 user messages alternate with assistant messages", async () => {
    const chat = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "Hello", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "assistant", content: "Hi!", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({
      where: { chatId: chat },
      orderBy: { createdAt: "asc" },
    });
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("422 messages retrievable from DB after creation", async () => {
    const chat = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "Msg A", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "assistant", content: "Reply A", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "Msg B", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({ where: { chatId: chat }, orderBy: { createdAt: "asc" } });
    expect(msgs.some((m) => m.content === "Msg A")).toBe(true);
    expect(msgs.some((m) => m.content === "Msg B")).toBe(true);
    expect(msgs.length).toBe(3);
  });
});

describe("Memory: spec persistence", () => {
  it("423 specJson stored on project", async () => {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    expect(p!.specJson).toBeTruthy();
  });

  it("424 specJson contains purpose field", async () => {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.purpose).toBe("Memory extended");
  });

  it("425 specJson contains features field", async () => {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.features).toBe("blog");
  });

  it("426 specJson survives multiple reads", async () => {
    const p1 = await prisma.project.findUnique({ where: { id: projectId } });
    const p2 = await prisma.project.findUnique({ where: { id: projectId } });
    expect(JSON.stringify(p1!.specJson)).toBe(JSON.stringify(p2!.specJson));
  });
});

describe("Memory: chat isolation between projects (DB)", () => {
  it("427 chats in different projects are independent", async () => {
    const pid2 = await createTestProject(user.id, { purpose: "Other" });
    const chat1 = await createTestChat(projectId);
    const chat2 = await createTestChat(pid2);
    await prisma.message.create({ data: { chatId: chat1, role: "user", content: "Project 1", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: chat2, role: "user", content: "Project 2", mode: "Discuss" } });
    const msgs1 = await prisma.message.findMany({ where: { chatId: chat1 } });
    const msgs2 = await prisma.message.findMany({ where: { chatId: chat2 } });
    expect(msgs1.some((m) => m.content === "Project 1")).toBe(true);
    expect(msgs1.some((m) => m.content === "Project 2")).toBe(false);
    expect(msgs2.some((m) => m.content === "Project 2")).toBe(true);
  });

  it("428 multiple chats per project", async () => {
    const c1 = await createTestChat(projectId);
    const c2 = await createTestChat(projectId);
    expect(c1).not.toBe(c2);
    const chats = await prisma.chat.findMany({ where: { projectId } });
    expect(chats.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Memory: mode preservation (DB)", () => {
  const modes = ["Plan", "Discuss", "Build", "Improve", "Debug"];
  for (const mode of modes) {
    it(`429+ mode ${mode} is persisted on messages`, async () => {
      const chat = await createTestChat(projectId);
      await prisma.message.create({ data: { chatId: chat, role: "user", content: `${mode} test`, mode } });
      const msgs = await prisma.message.findMany({ where: { chatId: chat, mode, role: "user" } });
      expect(msgs.length).toBeGreaterThan(0);
    });
  }
});

describe("Memory: data integrity under sequential load (DB)", () => {
  it("434 3 sequential messages all persist", async () => {
    const chat = await createTestChat(projectId);
    for (let i = 0; i < 3; i++) {
      await prisma.message.create({ data: { chatId: chat, role: "user", content: `Seq ${i}`, mode: "Discuss" } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId: chat, role: "user" } });
    expect(msgs.length).toBeGreaterThanOrEqual(3);
  });
});
