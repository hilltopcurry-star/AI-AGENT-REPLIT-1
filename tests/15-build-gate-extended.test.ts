import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, apiPostSSE, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectWithSpec: string;
let projectNoSpec: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectWithSpec = await createTestProject(user.id, {
    purpose: "Gate test", features: "auth, forms", techPreferences: "React",
  });
  projectNoSpec = await createTestProject(user.id);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Build gate: case insensitive triggers (sample)", () => {
  const exactCaseTriggers = [
    "BUILD IT", "Build It",
  ];

  for (let i = 0; i < exactCaseTriggers.length; i++) {
    it(`366+ "${exactCaseTriggers[i]}" triggers job [${i}]`, async () => {
      const chat = await createTestChat(projectWithSpec);
      const r = await apiPostSSE(
        `/api/chats/${chat}/messages`,
        { content: exactCaseTriggers[i], mode: "Build" },
        cookieHeader(token)
      );
      const am = r.events.find((e) => e.type === "assistant_message");
      expect(am?.data?.jobId).toBeTruthy();
    });
  }

  const nonExactPhrases = [
    "YES", "Yes", "GO AHEAD", "CONFIRMED", "DO IT", "BUILD", "CONFIRM", "GO",
  ];

  for (let i = 0; i < nonExactPhrases.length; i++) {
    it(`366+ "${nonExactPhrases[i]}" does NOT trigger job in mock mode [${i + 2}]`, async () => {
      const chat = await createTestChat(projectWithSpec);
      const r = await apiPostSSE(
        `/api/chats/${chat}/messages`,
        { content: nonExactPhrases[i], mode: "Build" },
        cookieHeader(token)
      );
      const am = r.events.find((e) => e.type === "assistant_message");
      expect(am?.data?.jobId).toBeFalsy();
    });
  }
});

describe("Build gate: non-triggers with extra chars", () => {
  const nonTriggers = [
    "build it!",
    "build it.",
    " build it",
    "build it ",
    "yes!",
    " yes",
    "go ahead!",
    " go ahead",
    "confirmed!",
    " confirmed",
  ];

  for (let i = 0; i < nonTriggers.length; i++) {
    it(`376+ "${nonTriggers[i]}" does NOT trigger job [${i}]`, async () => {
      const chat = await createTestChat(projectWithSpec);
      const r = await apiPostSSE(
        `/api/chats/${chat}/messages`,
        { content: nonTriggers[i], mode: "Build" },
        cookieHeader(token)
      );
      const am = r.events.find((e) => e.type === "assistant_message");
      expect(am?.data?.jobId).toBeFalsy();
    });
  }
});

describe("Build gate: project without spec", () => {
  it("386 Build mode with no spec still triggers job (no confirm button)", async () => {
    const chat = await createTestChat(projectNoSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "Build it", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.showConfirmButton).toBeFalsy();
    expect(am?.data?.jobId).toBeTruthy();
  });

  it("387 Build mode non-trigger with no spec", async () => {
    const chat = await createTestChat(projectNoSpec);
    const r = await apiPostSSE(
      `/api/chats/${chat}/messages`,
      { content: "I want to build something", mode: "Build" },
      cookieHeader(token)
    );
    const am = r.events.find((e) => e.type === "assistant_message");
    expect(am?.data?.jobId).toBeFalsy();
  });
});
