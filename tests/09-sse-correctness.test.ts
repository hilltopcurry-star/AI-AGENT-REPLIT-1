import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiPostSSE, apiGet, cleanupTestData,
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
    purpose: "SSE test", features: "counter", techPreferences: "Next.js",
  });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("SSE: core event structure", () => {
  it("210 Discuss returns user_message + tokens + assistant_message", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Hello", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events[0].type).toBe("user_message");
    const last = r.events[r.events.length - 1];
    expect(last.type).toBe("assistant_message");
    const tokens = r.events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("219 Build mode with confirmation has jobId", async () => {
    const chat = await createTestChat(projectWithSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeTruthy();
  });

  it("227 GET /api/chats/:id/messages returns persisted messages", async () => {
    const chat = await createTestChat(projectId);
    await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "get test", mode: "Discuss" },
      cookieHeader(token)
    );
    const r = await apiGet(`/api/chats/${chat}/messages`, cookieHeader(token));
    expect(r.status).toBe(200);
    const msgs = r.body as Array<{ content: string }>;
    expect(msgs.some((m) => m.content === "get test")).toBe(true);
  });
});
