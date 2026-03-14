import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiGet, apiPost, cleanupTestData,
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
  projectA = await createTestProject(userA.id, { purpose: "test", features: "test" });
  chatA = await createTestChat(projectA);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Auth: unauthenticated => 401", () => {
  it("01 GET /api/projects => 401 without cookie", async () => {
    const r = await apiGet("/api/projects");
    expect(r.status).toBe(401);
  });

  it("02 GET /api/jobs/fake/logs => 401 without cookie", async () => {
    const r = await apiGet("/api/jobs/fake-id/logs");
    expect(r.status).toBe(401);
  });

  it("03 GET /api/jobs/fake/stream => 401 without cookie", async () => {
    const r = await apiGet("/api/jobs/fake-id/stream");
    expect(r.status).toBe(401);
  });

  it("04 GET /api/jobs/fake/verify => 401 without cookie", async () => {
    const r = await apiGet("/api/jobs/fake-id/verify");
    expect(r.status).toBe(401);
  });

  it("05 GET /api/projects/fake/deployments => 401 without cookie", async () => {
    const r = await apiGet("/api/projects/fake-id/deployments");
    expect(r.status).toBe(401);
  });

  it("06 GET /api/deployments/fake => 401 without cookie", async () => {
    const r = await apiGet("/api/deployments/fake-id");
    expect(r.status).toBe(401);
  });

  it("07 POST /api/chats/fake/messages => 401 without cookie", async () => {
    const r = await apiPost("/api/chats/fake-id/messages", { content: "hello", mode: "Discuss" });
    expect(r.status).toBe(401);
  });

  it("08 GET /api/chats/fake/messages => 401 without cookie", async () => {
    const r = await apiGet("/api/chats/fake-id/messages");
    expect(r.status).toBe(401);
  });

  it("09 GET /api/download/backup => 401 without cookie", async () => {
    const r = await apiGet("/api/download/backup");
    expect(r.status).toBe(401);
  });

  it("10 GET /api/tests/phase23 => 401 without cookie", async () => {
    const r = await apiGet("/api/tests/phase23");
    expect(r.status).toBe(401);
  });
});

describe("Auth: wrong owner => 404", () => {
  it("11 GET /api/chats/:id/messages with wrong user => 404", async () => {
    const r = await apiGet(`/api/chats/${chatA}/messages`, cookieHeader(tokenB));
    expect(r.status).toBe(404);
  });

  it("12 POST /api/chats/:id/messages with wrong user => 404", async () => {
    const r = await apiPost(
      `/api/chats/${chatA}/messages`,
      { content: "hello", mode: "Discuss" },
      cookieHeader(tokenB)
    );
    expect(r.status).toBe(404);
  });

  it("13 GET /api/projects/:id/deployments with wrong user => 404", async () => {
    const r = await apiGet(`/api/projects/${projectA}/deployments`, cookieHeader(tokenB));
    expect(r.status).toBe(404);
  });

  it("14 GET /api/jobs/nonexistent/logs => 404 with valid session", async () => {
    const r = await apiGet("/api/jobs/nonexistent-id/logs", cookieHeader(tokenA));
    expect(r.status).toBe(404);
  });

  it("15 GET /api/jobs/nonexistent/stream => 404 with valid session", async () => {
    const r = await apiGet("/api/jobs/nonexistent-id/stream", cookieHeader(tokenA));
    expect(r.status).toBe(404);
  });

  it("16 GET /api/deployments/nonexistent => 404 with valid session", async () => {
    const r = await apiGet("/api/deployments/nonexistent-id", cookieHeader(tokenA));
    expect(r.status).toBe(404);
  });

  it("17 valid user can read own chat messages", async () => {
    const r = await apiGet(`/api/chats/${chatA}/messages`, cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("18 valid user can access own projects", async () => {
    const r = await apiGet("/api/projects", cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("19 valid user can access own project deployments", async () => {
    const r = await apiGet(`/api/projects/${projectA}/deployments`, cookieHeader(tokenA));
    expect(r.status).toBe(200);
  });

  it("20 expired session token => 401", async () => {
    const expired = await prisma.session.create({
      data: {
        sessionToken: "expired-test-token-" + Date.now(),
        userId: userA.id,
        expires: new Date(Date.now() - 1000),
      },
    });
    const r = await apiGet("/api/projects", cookieHeader(expired.sessionToken));
    expect(r.status).toBe(401);
  });
});
