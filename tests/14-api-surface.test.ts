import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiGet, apiPost, apiPostSSE, cleanupTestData, BASE_URL,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "API surface", features: "test" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("API: content-type handling", () => {
  it("335 POST with wrong content-type => 400", async () => {
    const chat = await createTestChat(projectId);
    const res = await fetch(`${BASE_URL}/api/chats/${chat}/messages`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Cookie: cookieHeader(token) },
      body: "hello",
    });
    expect([400, 415]).toContain(res.status);
  });

  it("336 POST with form-encoded => 400", async () => {
    const chat = await createTestChat(projectId);
    const res = await fetch(`${BASE_URL}/api/chats/${chat}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(token) },
      body: "content=hello&mode=Discuss",
    });
    expect([400, 415]).toContain(res.status);
  });
});

describe("API: large payloads", () => {
  it("337 very long message content is accepted", async () => {
    const chat = await createTestChat(projectId);
    const longContent = "A".repeat(5000);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: longContent, mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
  });
});

describe("API: project creation variants", () => {
  it("349 create project with minimal data", async () => {
    const r = await apiPost("/api/projects", { name: "Min" }, cookieHeader(token));
    expect([200, 201]).toContain(r.status);
  });

  it("352 create project returns correct structure", async () => {
    const r = await apiPost("/api/projects", { name: "Struct Test" }, cookieHeader(token));
    const body = r.body as Record<string, unknown>;
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("Struct Test");
    expect(body.userId).toBe(user.id);
  });
});

describe("API: response format consistency", () => {
  it("363 /api/health returns {ok: true}", async () => {
    const r = await apiGet("/api/health");
    expect(r.body).toEqual({ ok: true });
  });

  it("364 /api/agent-mode has mode, hasOpenAiKey, buildRunnerMode", async () => {
    const r = await apiGet("/api/agent-mode");
    const body = r.body as Record<string, unknown>;
    expect(body).toHaveProperty("mode");
    expect(body).toHaveProperty("hasOpenAiKey");
    expect(body).toHaveProperty("buildRunnerMode");
  });
});

describe("API: query parameter handling", () => {
  it("361 /api/jobs/latest without projectId => error", async () => {
    const r = await apiGet("/api/jobs/latest", cookieHeader(token));
    expect([400, 404]).toContain(r.status);
  });
});
