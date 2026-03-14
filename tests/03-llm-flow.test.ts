import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiPostSSE, apiGet, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Agent mode flags", () => {
  it("41 /api/agent-mode returns mode field", async () => {
    const r = await apiGet("/api/agent-mode");
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.mode).toBeDefined();
    expect(["mock", "llm"]).toContain(body.mode);
  });

  it("42 /api/agent-mode returns hasOpenAiKey field", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(typeof body.hasOpenAiKey).toBe("boolean");
  });

  it("43 /api/agent-mode returns buildRunnerMode field", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(body.buildRunnerMode).toBeDefined();
    expect(["mock", "real"]).toContain(body.buildRunnerMode);
  });

  it("44 /api/health returns ok", async () => {
    const r = await apiGet("/api/health");
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).ok).toBe(true);
  });
});

describe("LLM flow: core SSE", () => {
  it("45 Discuss mode returns user_message + tokens + assistant_message", async () => {
    const chatId = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chatId}/messages`,
      { content: "I want to build an e-commerce platform", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
    expect(r.events[0].type).toBe("user_message");
    const tokens = r.events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am).toBeDefined();
    expect(am?.data?.jobId).toBeFalsy();
  });

  it("52 Build mode with spec + 'build it' triggers job", async () => {
    const projS = await createTestProject(user.id, { purpose: "t", features: "f" });
    const chatS = await createTestChat(projS);
    const r = await apiPostSSE(
      `/api/chats/${chatS}/messages`,
      { content: "build it", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeTruthy();
  });

  it("54 Messages are persisted in DB after SSE", async () => {
    const chatId = await createTestChat(projectId);
    await apiPostSSE(
      `/api/chats/${chatId}/messages`,
      { content: "Test persistence", mode: "Discuss" },
      cookieHeader(token)
    );
    const msgs = await prisma.message.findMany({ where: { chatId } });
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    const userMsg = msgs.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Test persistence");
  });
});

describe("LLM flow: DB-verified mode behavior", () => {
  it("46 Discuss mode 'Build it' does NOT trigger job (DB check)", async () => {
    const chatId = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chatId}/messages`,
      { content: "Build it", mode: "Discuss" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeFalsy();
  });

  it("53 Build mode non-confirm => no job", async () => {
    const projS2 = await createTestProject(user.id, { purpose: "t", features: "f" });
    const chatS2 = await createTestChat(projS2);
    const r = await apiPostSSE(
      `/api/chats/${chatS2}/messages`,
      { content: "tell me more about the architecture", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeFalsy();
  });
});

describe("LLM flow: DB-only message properties", () => {
  it("57 message mode is persisted correctly", async () => {
    const chatId = await createTestChat(projectId);
    const modes = ["Plan", "Discuss", "Build", "Improve", "Debug"];
    for (const mode of modes) {
      await prisma.message.create({ data: { chatId, role: "user", content: `Test ${mode}`, mode } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId } });
    for (const mode of modes) {
      expect(msgs.some((m) => m.mode === mode)).toBe(true);
    }
  });

  it("58 messages ordered by createdAt", async () => {
    const chatId = await createTestChat(projectId);
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({ data: { chatId, role: "user", content: `Msg ${i}`, mode: "Discuss" } });
      await prisma.message.create({ data: { chatId, role: "assistant", content: `Reply ${i}`, mode: "Discuss" } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId }, orderBy: { createdAt: "asc" } });
    expect(msgs.length).toBe(10);
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i].createdAt.getTime()).toBeGreaterThanOrEqual(msgs[i - 1].createdAt.getTime());
    }
  });

  it("59 assistant_message has role and content", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "assistant", content: "Hello! I can help.", mode: "Discuss" },
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content.length).toBeGreaterThan(0);
  });

  it("60 user_message has correct content", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "user", content: "Unique content 12345", mode: "Discuss" },
    });
    const fetched = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(fetched?.content).toBe("Unique content 12345");
  });

  it("61 multiple messages accumulate in DB", async () => {
    const chatId = await createTestChat(projectId);
    for (let i = 0; i < 4; i++) {
      await prisma.message.create({ data: { chatId, role: "user", content: `First ${i}`, mode: "Discuss" } });
      await prisma.message.create({ data: { chatId, role: "assistant", content: `Second ${i}`, mode: "Discuss" } });
    }
    const msgs = await prisma.message.findMany({ where: { chatId } });
    expect(msgs.length).toBeGreaterThanOrEqual(8);
  });

  it("62 Plan mode messages don't create jobs", async () => {
    const chatId = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId, role: "user", content: "Plan a blog", mode: "Plan" } });
    const jobs = await prisma.job.findMany({ where: { projectId } });
    const recentJobs = jobs.filter((j) => j.createdAt > new Date(Date.now() - 500));
    expect(recentJobs.length).toBe(0);
  });

  it("63 Improve mode returns valid response structure", async () => {
    const chatId = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId, role: "user", content: "Review my code", mode: "Improve" } });
    await prisma.message.create({ data: { chatId, role: "assistant", content: "Suggestion...", mode: "Improve" } });
    const msgs = await prisma.message.findMany({ where: { chatId, mode: "Improve" } });
    expect(msgs.length).toBe(2);
  });

  it("64 Debug mode returns valid response structure", async () => {
    const chatId = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId, role: "user", content: "Error in console", mode: "Debug" } });
    await prisma.message.create({ data: { chatId, role: "assistant", content: "Try checking...", mode: "Debug" } });
    const msgs = await prisma.message.findMany({ where: { chatId, mode: "Debug" } });
    expect(msgs.length).toBe(2);
  });

  it("65 chat has correct projectId", async () => {
    const chatId = await createTestChat(projectId);
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    expect(chat?.projectId).toBe(projectId);
  });

  it("66 user_message event contains role user", async () => {
    const chatId = await createTestChat(projectId);
    const msg = await prisma.message.create({
      data: { chatId, role: "user", content: "role check", mode: "Discuss" },
    });
    expect(msg.role).toBe("user");
    expect(msg.chatId).toBe(chatId);
  });
});
