import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiPostSSE, cleanupTestData, BASE_URL,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectWithSpec: string;
let projectNoSpec: string;
let chatWithSpec: string;
let chatNoSpec: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectWithSpec = await createTestProject(user.id, {
    purpose: "Test app", features: "Login, Dashboard", techPreferences: "Next.js",
  });
  projectNoSpec = await createTestProject(user.id);
  chatWithSpec = await createTestChat(projectWithSpec);
  chatNoSpec = await createTestChat(projectNoSpec);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

async function sendChat(chatId: string, content: string, mode: string) {
  return apiPostSSE(`/api/chats/${chatId}/messages`, { content, mode }, cookieHeader(token));
}

function hasJobId(events: Array<{ type: string; data: Record<string, unknown> }>) {
  const am = events.find((e) => e.type === "assistant_message");
  return am?.data?.jobId != null;
}

describe("Build gate: strict Build it check", () => {
  it("21 exact 'Build it' in Build mode triggers job", async () => {
    const r = await sendChat(chatWithSpec, "Build it", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(true);
  });

  it("22 'build it' (lowercase) in Build mode triggers job", async () => {
    const chat2 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat2, "build it", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(true);
  });

  it("23 'Build It' (mixed case) triggers job (case-insensitive match)", async () => {
    const chat3 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat3, "Build It", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(true);
  });

  it("24 'build it ' (trailing space) does NOT trigger job (strict exact match)", async () => {
    const chat4 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat4, "build it ", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("25 'Build it' in Discuss mode does NOT trigger job", async () => {
    const chat5 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat5, "Build it", "Discuss");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("26 'Build it' in Plan mode does NOT trigger job", async () => {
    const chat6 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat6, "Build it", "Plan");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("27 'build' alone does NOT trigger job (near-miss)", async () => {
    const chat7 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat7, "build", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("28 'please build it' does NOT trigger job (has prefix)", async () => {
    const chat8 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat8, "please build it", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("29 empty content returns 400", async () => {
    const r = await sendChat(chatWithSpec, "", "Build");
    expect(r.status).toBe(400);
  });

  it("30 whitespace-only content returns 400", async () => {
    const r = await sendChat(chatWithSpec, "   ", "Build");
    expect(r.status).toBe(400);
  });

  it("31 'Build it' with no spec still triggers job", async () => {
    const chatNs = await createTestChat(projectNoSpec);
    const r = await sendChat(chatNs, "Build it", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(true);
  });

  it("32 'start building' in Build mode is near-miss (does NOT trigger)", async () => {
    const chat9 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat9, "start building", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("33 'yes' in Build mode does NOT trigger job (mock: exact match only)", async () => {
    const chat10 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat10, "yes", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("34 'go ahead' in Build mode does NOT trigger job (mock: exact match only)", async () => {
    const chat11 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat11, "go ahead", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("35 'maybe build' does NOT trigger job", async () => {
    const chat12 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat12, "maybe build", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("36 'no' does NOT trigger job", async () => {
    const chat13 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat13, "no", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("37 'Build it now please' does NOT trigger job (strict exact match)", async () => {
    const chat14 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat14, "Build it now please", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("38 'confirmed' in Build mode does NOT trigger job (mock: exact match only)", async () => {
    const chat15 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat15, "confirmed", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("39 'do it' in Build mode does NOT trigger job (mock: exact match only)", async () => {
    const chat16 = await createTestChat(projectWithSpec);
    const r = await sendChat(chat16, "do it", "Build");
    expect(r.status).toBe(200);
    expect(hasJobId(r.events)).toBe(false);
  });

  it("40 malformed JSON body returns 400", async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookieHeader(token),
    };
    const res = await fetch(`${BASE_URL}/api/chats/${chatWithSpec}/messages`, {
      method: "POST",
      headers,
      body: "not json{",
    });
    expect(res.status).toBe(400);
  });
});
