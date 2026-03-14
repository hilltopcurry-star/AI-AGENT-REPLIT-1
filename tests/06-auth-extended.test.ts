import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiGet, apiPost, cleanupTestData, BASE_URL,
} from "./helpers";

let userA: { id: string; email: string };
let userB: { id: string; email: string };
let tokenA: string;
let tokenB: string;
let projectA: string;
let chatA: string;

beforeAll(async () => {
  userA = await createTestUser();
  userB = await createTestUser();
  tokenA = await createTestSession(userA.id);
  tokenB = await createTestSession(userB.id);
  projectA = await createTestProject(userA.id, { purpose: "auth test", features: "none" });
  chatA = await createTestChat(projectA);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

const protectedGetPaths = [
  "/api/projects",
  "/api/jobs/fake-id/logs",
  "/api/jobs/fake-id/stream",
  "/api/jobs/fake-id/verify",
  "/api/projects/fake-id/deployments",
  "/api/deployments/fake-id",
  "/api/chats/fake-id/messages",
  "/api/download/backup",
  "/api/download/backup-v2",
  "/api/tests/phase1",
];

describe("Auth: GET 401 for all protected paths without cookie", () => {
  for (let i = 0; i < protectedGetPaths.length; i++) {
    const p = protectedGetPaths[i];
    it(`101 unauth GET ${p} => 401 [${i}]`, async () => {
      const r = await apiGet(p);
      expect(r.status).toBe(401);
    });
  }
});

describe("Auth: POST 401 without cookie", () => {
  it("111 POST /api/chats/fake/messages => 401", async () => {
    const r = await apiPost("/api/chats/fake-id/messages", { content: "hi", mode: "Discuss" });
    expect(r.status).toBe(401);
  });

  it("112 POST /api/projects => 401", async () => {
    const r = await apiPost("/api/projects", { name: "test" });
    expect(r.status).toBe(401);
  });
});

describe("Auth: invalid token formats", () => {
  const badTokens = [
    "",
    "invalid-token",
    "null",
    "undefined",
    "00000000-0000-0000-0000-000000000000",
    "a".repeat(200),
    "'; DROP TABLE sessions; --",
    "<script>alert(1)</script>",
  ];

  for (let i = 0; i < badTokens.length; i++) {
    it(`113 bad token [${i}] => 401`, async () => {
      const r = await apiGet("/api/projects", cookieHeader(badTokens[i]));
      expect(r.status).toBe(401);
    });
  }
});

describe("Auth: cross-user isolation on all resources", () => {
  it("121 userB cannot GET userA's chat messages", async () => {
    const r = await apiGet(`/api/chats/${chatA}/messages`, cookieHeader(tokenB));
    expect(r.status).toBe(404);
  });

  it("122 userB cannot POST to userA's chat", async () => {
    const r = await apiPost(
      `/api/chats/${chatA}/messages`,
      { content: "hello", mode: "Discuss" },
      cookieHeader(tokenB)
    );
    expect(r.status).toBe(404);
  });

  it("123 userB cannot GET userA's project deployments", async () => {
    const r = await apiGet(`/api/projects/${projectA}/deployments`, cookieHeader(tokenB));
    expect(r.status).toBe(404);
  });

  it("124 userA CAN access own chat", async () => {
    const r = await apiGet(`/api/chats/${chatA}/messages`, cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("125 userA CAN access own projects", async () => {
    const r = await apiGet("/api/projects", cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("126 userA CAN access own deployments", async () => {
    const r = await apiGet(`/api/projects/${projectA}/deployments`, cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });
});

describe("Auth: session expiry edge cases", () => {
  it("127 session expired 1 second ago => 401", async () => {
    const s = await prisma.session.create({
      data: {
        sessionToken: "exp-1s-" + Date.now(),
        userId: userA.id,
        expires: new Date(Date.now() - 1000),
      },
    });
    const r = await apiGet("/api/projects", cookieHeader(s.sessionToken));
    expect(r.status).toBe(401);
  });

  it("128 session expired 1 hour ago => 401", async () => {
    const s = await prisma.session.create({
      data: {
        sessionToken: "exp-1h-" + Date.now(),
        userId: userA.id,
        expires: new Date(Date.now() - 3600 * 1000),
      },
    });
    const r = await apiGet("/api/projects", cookieHeader(s.sessionToken));
    expect(r.status).toBe(401);
  });

  it("129 session valid for 24h => 200", async () => {
    const s = await prisma.session.create({
      data: {
        sessionToken: "valid-24h-" + Date.now(),
        userId: userA.id,
        expires: new Date(Date.now() + 86400 * 1000),
      },
    });
    const r = await apiGet("/api/projects", cookieHeader(s.sessionToken));
    expect(r.status).toBe(200);
  });

  it("130 multiple valid sessions for same user both work", async () => {
    const t1 = await createTestSession(userA.id);
    const t2 = await createTestSession(userA.id);
    const r1 = await apiGet("/api/projects", cookieHeader(t1));
    const r2 = await apiGet("/api/projects", cookieHeader(t2));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});

describe("Auth: nonexistent resource IDs", () => {
  const fakeIds = [
    "nonexistent-id-1",
    "cm000000000000000000000",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  ];

  for (let i = 0; i < fakeIds.length; i++) {
    it(`131 GET /api/jobs/${fakeIds[i]}/logs => 404 [${i}]`, async () => {
      const r = await apiGet(`/api/jobs/${fakeIds[i]}/logs`, cookieHeader(tokenA));
      expect(r.status).toBe(404);
    });

    it(`134 GET /api/jobs/${fakeIds[i]}/verify => 404 [${i}]`, async () => {
      const r = await apiGet(`/api/jobs/${fakeIds[i]}/verify`, cookieHeader(tokenA));
      expect(r.status).toBe(404);
    });

    it(`137 GET /api/deployments/${fakeIds[i]} => 404 [${i}]`, async () => {
      const r = await apiGet(`/api/deployments/${fakeIds[i]}`, cookieHeader(tokenA));
      expect(r.status).toBe(404);
    });
  }
});

describe("Auth: public endpoints still accessible", () => {
  it("140 /api/health => 200 without cookie", async () => {
    const r = await apiGet("/api/health");
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).ok).toBe(true);
  });

  it("141 /api/agent-mode => 200 without cookie", async () => {
    const r = await apiGet("/api/agent-mode");
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.mode).toBeDefined();
  });

  it("142 /api/health with cookie => 200", async () => {
    const r = await apiGet("/api/health", cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("143 /api/agent-mode with cookie => 200", async () => {
    const r = await apiGet("/api/agent-mode", cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });
});

describe("Auth: HTTP method edge cases", () => {
  it("144 DELETE to /api/projects => method not allowed or 401", async () => {
    const headers: Record<string, string> = {};
    const res = await fetch(`${BASE_URL}/api/projects`, { method: "DELETE", headers });
    expect([401, 405]).toContain(res.status);
  });

  it("145 PUT to /api/chats/fake/messages => 401 or 405", async () => {
    const res = await fetch(`${BASE_URL}/api/chats/fake/messages`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect([401, 405]).toContain(res.status);
  });
});
