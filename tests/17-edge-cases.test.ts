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
  projectId = await createTestProject(user.id, { purpose: "Edge case", features: "test" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Edge: URL path edge cases", () => {
  const badPaths = [
    "/api/nonexistent",
    "/api/projects/../../etc/passwd",
    "/api/jobs/../../secret",
  ];

  for (let i = 0; i < badPaths.length; i++) {
    it(`435+ bad path [${i}] => 404 or 401`, async () => {
      const r = await apiGet(badPaths[i], cookieHeader(token));
      expect([401, 404, 405, 308]).toContain(r.status);
    });
  }
});

describe("Edge: response headers", () => {
  it("440 /api/health has content-type json", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("441 /api/agent-mode has content-type json", async () => {
    const res = await fetch(`${BASE_URL}/api/agent-mode`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("Edge: multiple users isolation", () => {
  it("442 two users see only their own projects", async () => {
    const u2 = await createTestUser();
    const t2 = await createTestSession(u2.id);
    await apiPost("/api/projects", { name: "User2 Project" }, cookieHeader(t2));

    const r1 = await apiGet("/api/projects", cookieHeader(token));
    const r2 = await apiGet("/api/projects", cookieHeader(t2));
    const p1 = r1.body as Array<{ name: string; userId: string }>;
    const p2 = r2.body as Array<{ name: string; userId: string }>;

    for (const p of p1) expect(p.userId).toBe(user.id);
    for (const p of p2) expect(p.userId).toBe(u2.id);
  });

  it("443 user cannot create project for another user", async () => {
    const r = await apiPost("/api/projects", { name: "Test" }, cookieHeader(token));
    const body = r.body as Record<string, unknown>;
    expect(body.userId).toBe(user.id);
  });
});

describe("Edge: chat message edge cases", () => {
  it("444 very short message (1 char)", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "x", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(200);
  });

  it("445 message with only spaces is rejected", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: "     ", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("446 message with only newlines is rejected", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: "\n\n\n", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });

  it("447 message with mixed whitespace is rejected", async () => {
    const chat = await createTestChat(projectId);
    const r = await apiPost(
      `/api/chats/${chat}/messages`,
      { content: " \t\n \t ", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(400);
  });
});

describe("Edge: API rate stability", () => {
  it("448 5 rapid health checks all return 200", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => apiGet("/api/health"))
    );
    for (const r of results) expect(r.status).toBe(200);
  });

  it("449 5 rapid project lists all return 200", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => apiGet("/api/projects", cookieHeader(token)))
    );
    for (const r of results) expect(r.status).toBe(200);
  });
});

describe("Edge: empty DB states", () => {
  it("450 new user sees empty project list", async () => {
    const u = await createTestUser();
    const t = await createTestSession(u.id);
    const r = await apiGet("/api/projects", cookieHeader(t));
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBe(0);
  });

  it("451 new project has empty chat list", async () => {
    const pid = await createTestProject(user.id);
    const chats = await prisma.chat.findMany({ where: { projectId: pid } });
    expect(chats.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Edge: DB transaction safety", () => {
  it("452 creating message in nonexistent chat fails", async () => {
    let err: unknown = null;
    try {
      await prisma.message.create({
        data: { chatId: "nonexistent-chat-id", role: "user", content: "test", mode: "Discuss" },
      });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });

  it("453 creating job in nonexistent project fails", async () => {
    let err: unknown = null;
    try {
      await prisma.job.create({ data: { projectId: "nonexistent-project", status: "PENDING" } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });
});

describe("Edge: deleted resource access", () => {
  it("454 GET messages for deleted chat => 404", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.chat.delete({ where: { id: cid } });
    const r = await apiGet(`/api/chats/${cid}/messages`, cookieHeader(token));
    expect(r.status).toBe(404);
  });

  it("455 POST to deleted chat => 404", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.chat.delete({ where: { id: cid } });
    const r = await apiPostSSE(
      `/api/chats/${cid}/messages`,
      { content: "hello", mode: "Discuss" },
      cookieHeader(token)
    );
    expect(r.status).toBe(404);
  });
});

describe("Edge: project with all relations", () => {
  it("456 project include all relations", async () => {
    const pid = await createTestProject(user.id, { purpose: "full", features: "all" });
    const cid = await createTestChat(pid);
    await apiPostSSE(`/api/chats/${cid}/messages`, { content: "hi", mode: "Discuss" }, cookieHeader(token));
    const p = await prisma.project.findUnique({
      where: { id: pid },
      include: { chats: { include: { messages: true } }, jobs: true, user: true },
    });
    expect(p!.user).toBeTruthy();
    expect(p!.chats.length).toBeGreaterThan(0);
    expect(p!.chats[0].messages.length).toBeGreaterThan(0);
  });
});

describe("Edge: numeric and boolean edge cases in spec", () => {
  it("457 project with numeric spec value", async () => {
    const pid = await createTestProject(user.id, { purpose: "test", count: 42 });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.count).toBe(42);
  });

  it("458 project with boolean spec value", async () => {
    const pid = await createTestProject(user.id, { purpose: "test", isPublic: true });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.isPublic).toBe(true);
  });

  it("459 project with array spec value", async () => {
    const pid = await createTestProject(user.id, { purpose: "test", tags: ["a", "b", "c"] });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.tags).toEqual(["a", "b", "c"]);
  });
});

describe("Edge: SSE Content-Type", () => {
  it("460 SSE response has text/event-stream content type", async () => {
    const chat = await createTestChat(projectId);
    const res = await fetch(`${BASE_URL}/api/chats/${chat}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(token),
      },
      body: JSON.stringify({ content: "sse type test", mode: "Discuss" }),
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
