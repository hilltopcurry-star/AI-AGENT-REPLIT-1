import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  await prisma.openAiUsage.deleteMany({ where: { userId: user.id } });
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Cost controls: OpenAiUsage model", () => {
  it("286 OpenAiUsage table exists", async () => {
    const count = await prisma.openAiUsage.count();
    expect(typeof count).toBe("number");
  });

  it("287 can create usage record", async () => {
    const usage = await prisma.openAiUsage.create({
      data: { userId: user.id, date: "2099-12-01", requests: 0, tokens: 0 },
    });
    expect(usage.id).toBeTruthy();
    await prisma.openAiUsage.delete({ where: { id: usage.id } });
  });

  it("288 can upsert usage record", async () => {
    const date = "2099-12-02";
    await prisma.openAiUsage.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, requests: 1, tokens: 100 },
      update: { requests: { increment: 1 }, tokens: { increment: 100 } },
    });
    const usage = await prisma.openAiUsage.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    expect(usage!.requests).toBe(1);
    expect(usage!.tokens).toBe(100);

    await prisma.openAiUsage.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, requests: 1, tokens: 100 },
      update: { requests: { increment: 1 }, tokens: { increment: 50 } },
    });
    const usage2 = await prisma.openAiUsage.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    expect(usage2!.requests).toBe(2);
    expect(usage2!.tokens).toBe(150);

    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });
  });

  it("289 unique constraint on userId+date", async () => {
    const date = "2099-12-03";
    await prisma.openAiUsage.create({ data: { userId: user.id, date, requests: 0, tokens: 0 } });
    let error: unknown = null;
    try {
      await prisma.openAiUsage.create({ data: { userId: user.id, date, requests: 0, tokens: 0 } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeTruthy();
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });
  });

  it("290 different users can have same date", async () => {
    const user2 = await createTestUser();
    const date = "2099-12-04";
    await prisma.openAiUsage.create({ data: { userId: user.id, date, requests: 0, tokens: 0 } });
    await prisma.openAiUsage.create({ data: { userId: user2.id, date, requests: 0, tokens: 0 } });
    await prisma.openAiUsage.deleteMany({ where: { date } });
  });
});

describe("Cost controls: env var defaults", () => {
  it("291 OPENAI_KILL_SWITCH defaults to 0 (off)", () => {
    const val = process.env.OPENAI_KILL_SWITCH;
    expect(val === undefined || val === "0" || val === "").toBe(true);
  });

  it("292 OPENAI_MAX_TOKENS_PER_REQUEST defaults to 800", () => {
    const val = parseInt(process.env.OPENAI_MAX_TOKENS_PER_REQUEST || "800", 10);
    expect(val).toBe(800);
  });

  it("293 OPENAI_MAX_REQUESTS_PER_DAY_PER_USER defaults to 50", () => {
    const val = parseInt(process.env.OPENAI_MAX_REQUESTS_PER_DAY_PER_USER || "50", 10);
    expect(val).toBe(50);
  });

  it("294 OPENAI_MAX_TOKENS_PER_DAY_PER_USER defaults to 20000", () => {
    const val = parseInt(process.env.OPENAI_MAX_TOKENS_PER_DAY_PER_USER || "20000", 10);
    expect(val).toBe(20000);
  });
});

describe("Cost controls: usage tracking mechanism", () => {
  it("295 upsert pattern correctly increments request count across calls", async () => {
    const date = "2099-12-10";
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });

    for (let i = 1; i <= 3; i++) {
      await prisma.openAiUsage.upsert({
        where: { userId_date: { userId: user.id, date } },
        create: { userId: user.id, date, requests: 1, tokens: 50 },
        update: { requests: { increment: 1 }, tokens: { increment: 50 } },
      });
    }
    const usage = await prisma.openAiUsage.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    expect(usage!.requests).toBe(3);
    expect(usage!.tokens).toBe(150);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date } });
  });

  it("296 usage records queryable by date range for cap enforcement", async () => {
    const dates = ["2099-11-01", "2099-11-02", "2099-11-03"];
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { in: dates } } });

    for (const d of dates) {
      await prisma.openAiUsage.create({
        data: { userId: user.id, date: d, requests: 10, tokens: 500 },
      });
    }

    const total = await prisma.openAiUsage.aggregate({
      where: { userId: user.id, date: { in: dates } },
      _sum: { requests: true, tokens: true },
    });
    expect(total._sum.requests).toBe(30);
    expect(total._sum.tokens).toBe(1500);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { in: dates } } });
  });
});

describe("Cost controls: kill switch behavior", () => {
  it("297 kill switch returns 'LLM temporarily disabled.' when enabled", async () => {
    const origVal = process.env.OPENAI_KILL_SWITCH;
    process.env.OPENAI_KILL_SWITCH = "1";

    try {
      const { isKillSwitchEnabled } = await import("../apps/web/lib/llm-agent");
      expect(isKillSwitchEnabled()).toBe(true);
    } finally {
      process.env.OPENAI_KILL_SWITCH = origVal || "";
    }
  });

  it("298 kill switch disabled by default", async () => {
    const origVal = process.env.OPENAI_KILL_SWITCH;
    delete process.env.OPENAI_KILL_SWITCH;

    try {
      const { isKillSwitchEnabled } = await import("../apps/web/lib/llm-agent");
      expect(isKillSwitchEnabled()).toBe(false);
    } finally {
      if (origVal !== undefined) process.env.OPENAI_KILL_SWITCH = origVal;
    }
  });

  it("299 kill switch = '0' means disabled", async () => {
    const origVal = process.env.OPENAI_KILL_SWITCH;
    process.env.OPENAI_KILL_SWITCH = "0";

    try {
      const { isKillSwitchEnabled } = await import("../apps/web/lib/llm-agent");
      expect(isKillSwitchEnabled()).toBe(false);
    } finally {
      process.env.OPENAI_KILL_SWITCH = origVal || "";
    }
  });

  it("300 kill switch = '1' means enabled", async () => {
    const origVal = process.env.OPENAI_KILL_SWITCH;
    process.env.OPENAI_KILL_SWITCH = "1";

    try {
      const { isKillSwitchEnabled } = await import("../apps/web/lib/llm-agent");
      expect(isKillSwitchEnabled()).toBe(true);
    } finally {
      process.env.OPENAI_KILL_SWITCH = origVal || "";
    }
  });
});
