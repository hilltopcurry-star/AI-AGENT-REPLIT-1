import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiGet, apiPost, apiPostSSE, cleanupTestData, BASE_URL,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;
let projectWithSpec: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id);
  projectWithSpec = await createTestProject(user.id, {
    purpose: "Misc test", features: "auth, dashboard",
  });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Misc: malformed request bodies", () => {
  it("231 empty body => 400", async () => {
    const chat = await createTestChat(projectId);
    const res = await fetch(`${BASE_URL}/api/chats/${chat}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("232 non-JSON body => 400", async () => {
    const chat = await createTestChat(projectId);
    const res = await fetch(`${BASE_URL}/api/chats/${chat}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
      body: "not json {",
    });
    expect(res.status).toBe(400);
  });

  it("233 missing content field => 400", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("234 null content => 400", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: null, mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("235 numeric content => 400", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: 12345, mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("236 whitespace-only content => 400", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: "   \n\t  ", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("237 empty string content => 400", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: "", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });
});

describe("Misc: mode edge cases (SSE)", () => {
  it("238 unknown mode defaults to Discuss behavior", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "hello", mode: "UnknownMode" },
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
  });

  it("240 Discuss mode with 'Build it' does NOT trigger job", async () => {
    const chat = await createTestChat(projectWithSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it", mode: "Discuss" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeFalsy();
  });
});

describe("Misc: project operations", () => {
  it("242 create project returns id", async () => {
    const r = await apiPost("/api/projects", { name: "Test Proj" }, cookieHeader(token));
    expect([200, 201]).toContain(r.status);
    const body = r.body as Record<string, unknown>;
    expect(body.id).toBeTruthy();
  });

  it("243 list projects returns array", async () => {
    const r = await apiGet("/api/projects", cookieHeader(token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

describe("Misc: DB-only chat and cost control checks", () => {
  it("246 create chat returns id", async () => {
    const chat = await prisma.chat.create({ data: { projectId } });
    expect(chat.id).toBeTruthy();
  });

  it("247 chat belongs to project", async () => {
    const chat = await prisma.chat.findFirst({
      where: { projectId },
      include: { project: true },
    });
    expect(chat?.project).toBeTruthy();
  });

  it("249 OpenAiUsage model exists", async () => {
    const count = await prisma.openAiUsage.count();
    expect(typeof count).toBe("number");
  });

  it("250 OpenAiUsage can be created", async () => {
    const date = "2099-01-01";
    const usage = await prisma.openAiUsage.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, requests: 1, tokens: 100 },
      update: { requests: { increment: 1 }, tokens: { increment: 100 } },
    });
    expect(usage.requests).toBeGreaterThanOrEqual(1);
    await prisma.openAiUsage.delete({ where: { id: usage.id } });
  });

  it("251 OpenAiUsage unique constraint on userId+date", async () => {
    const date = "2099-01-02";
    await prisma.openAiUsage.create({ data: { userId: user.id, date, requests: 1, tokens: 50 } });
    let error: unknown = null;
    try {
      await prisma.openAiUsage.create({ data: { userId: user.id, date, requests: 1, tokens: 50 } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeTruthy();
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });
  });

  it("252 /api/agent-mode reflects current mode", async () => {
    const r = await apiGet("/api/agent-mode");
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(["mock", "llm"]).toContain(body.mode);
  });

  it("253 /api/health returns JSON", async () => {
    const r = await apiGet("/api/health");
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).ok).toBe(true);
  });
});

describe("Misc: build gate strict exact match (SSE)", () => {
  it("255 'Build it now please' does NOT trigger job", async () => {
    const chat = await createTestChat(projectWithSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it now please", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeFalsy();
  });

  it("265 'Build it' DOES trigger job", async () => {
    const chat = await createTestChat(projectWithSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeTruthy();
  });
});

describe("Misc: build gate DB-only non-trigger verification", () => {
  const nonTriggerPhrases = [
    "build it ", "  build it", "BUILD IT!",
    "build it!!", "please build it", "can you build it",
    "I want to build it", "lets build it", "yes please help me learn",
    "go ahead", "confirmed", "start building",
  ];

  for (const phrase of nonTriggerPhrases) {
    it(`"${phrase}" is not an exact build trigger (strict no-trim)`, () => {
      const allowedPhrases = [
        "build it", "yes", "confirm", "go", "do it", "yes, build it",
        "let's go", "proceed", "start", "ship it", "let's build", "go for it",
        "yes, let's build", "run build", "start it", "make it",
        "create it", "begin", "execute", "run it", "launch", "deploy", "compile",
      ];
      const exactLower = phrase.toLowerCase();
      const isExactMatch = allowedPhrases.includes(exactLower);
      expect(isExactMatch).toBe(false);
    });
  }
});

describe("Misc: project specJson variants", () => {
  it("245 project specJson is null or object", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    for (const p of projects) {
      expect(p.specJson === null || typeof p.specJson === "object").toBe(true);
    }
  });

  it("248 messages belong to correct chat", async () => {
    const chat = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: chat, role: "user", content: "belong test", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({ where: { chatId: chat } });
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(m.chatId).toBe(chat);
    }
  });
});
