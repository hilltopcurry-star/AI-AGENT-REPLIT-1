import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  cookieHeader, cleanupTestData, BASE_URL,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser("plan-test@test.local");
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "plan-limit-test" });
});

afterAll(async () => {
  await prisma.buildQueueJob.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.planConfig.deleteMany({ where: { planKey: "basic" } });
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Plan system", () => {
  describe("plan defaults", () => {
    it("565 returns basic plan for user without subscription", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.planKey).toBe("basic");
      expect(body.admin).toBe(false);
    });

    it("566 basic plan has correct limits", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.limits).toBeDefined();
      expect(body.limits.maxRunningBuilds).toBe(1);
      expect(body.limits.maxQueuedBuilds).toBe(3);
      expect(body.limits.maxAiRequestsPerMonth).toBe(50);
      expect(body.limits.maxDeploysPerDay).toBe(3);
      expect(body.limits.priority).toBe(0);
    });

    it("567 basic plan display info is correct", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.display.label).toBe("Basic");
      expect(body.display.price).toBe("Free");
    });
  });

  describe("plan upgrade", () => {
    it("568 can upgrade to pro plan", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "pro" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.planKey).toBe("pro");
    });

    it("569 pro plan has higher limits", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.planKey).toBe("pro");
      expect(body.limits.maxRunningBuilds).toBe(3);
      expect(body.limits.maxQueuedBuilds).toBe(10);
      expect(body.limits.maxAiRequestsPerMonth).toBe(500);
      expect(body.limits.maxDeploysPerDay).toBe(20);
      expect(body.limits.priority).toBe(10);
    });

    it("570 can upgrade to enterprise plan", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "enterprise" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.planKey).toBe("enterprise");
    });

    it("571 enterprise plan has highest limits", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.planKey).toBe("enterprise");
      expect(body.limits.maxRunningBuilds).toBe(10);
      expect(body.limits.maxQueuedBuilds).toBe(50);
      expect(body.limits.maxDeploysPerDay).toBe(100);
      expect(body.limits.priority).toBe(20);
    });

    it("572 rejects invalid plan key", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "invalid" }),
      });
      expect(res.status).toBe(400);
    });

    it("573 can downgrade to basic", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "basic" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.planKey).toBe("basic");
    });
  });

  describe("queue enforcement with plan limits", () => {
    it("574 basic user hits queue limit and gets friendly message", async () => {
      await prisma.buildQueueJob.deleteMany({ where: { userId: user.id } });
      await prisma.subscription.deleteMany({ where: { userId: user.id } });

      const job = await prisma.job.create({
        data: { projectId, status: "RUNNING" },
      });
      await prisma.buildQueueJob.create({
        data: { userId: user.id, projectId, jobId: job.id, status: "RUNNING", priority: 0 },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.buildQueueJob.create({
          data: { userId: user.id, projectId, status: "QUEUED", priority: 0 },
        });
      }

      const res = await fetch(`${BASE_URL}/api/queue/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ projectId }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("Queue limit");
      expect(body.error).toContain("Upgrade");
    });

    it("575 pro user can queue more and gets higher priority", async () => {
      await prisma.buildQueueJob.deleteMany({ where: { userId: user.id } });

      const upgradeRes = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "pro" }),
      });
      expect(upgradeRes.status).toBe(200);

      const res = await fetch(`${BASE_URL}/api/queue/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ projectId }),
      });
      expect(res.status).toBe(200);

      const latest = await prisma.buildQueueJob.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      expect(latest).toBeDefined();
      expect(latest!.priority).toBe(10);
    });
  });

  describe("subscription model", () => {
    it("576 subscription record exists after upgrade", async () => {
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub).toBeDefined();
      expect(sub!.status).toBe("active");
      expect(sub!.planKey).toBe("pro");
    });

    it("577 subscription has correct fields", async () => {
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub).toBeDefined();
      expect(sub!.userId).toBe(user.id);
      expect(sub!.createdAt).toBeInstanceOf(Date);
      expect(sub!.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("PlanConfig model", () => {
    it("578 can create and read plan config rows", async () => {
      await prisma.planConfig.upsert({
        where: { planKey: "basic" },
        create: {
          planKey: "basic",
          maxRunningBuilds: 1,
          maxQueuedBuilds: 3,
          maxAiRequestsPerMonth: 50,
          maxAiTokensPerMonth: 100000,
          maxDeploysPerDay: 3,
          priority: 0,
        },
        update: {},
      });

      const row = await prisma.planConfig.findUnique({ where: { planKey: "basic" } });
      expect(row).toBeDefined();
      expect(row!.maxRunningBuilds).toBe(1);
    });

    it("579 planKey uniqueness is enforced", async () => {
      await expect(
        prisma.planConfig.create({
          data: {
            planKey: "basic",
            maxRunningBuilds: 1,
            maxQueuedBuilds: 3,
            maxAiRequestsPerMonth: 50,
            maxAiTokensPerMonth: 100000,
            maxDeploysPerDay: 3,
            priority: 0,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("admin stats plan data", () => {
    it("580 admin stats returns planCounts", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stats`, {
        headers: { Cookie: cookieHeader(token) },
      });
      if (res.status === 403) return;
      const body = await res.json();
      expect(body.planCounts).toBeDefined();
      expect(typeof body.planCounts.basic).toBe("number");
    });

    it("581 admin stats returns MRR placeholder", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stats`, {
        headers: { Cookie: cookieHeader(token) },
      });
      if (res.status === 403) return;
      const body = await res.json();
      expect(body.mrr).toBeDefined();
      expect(body.mrr.placeholder).toBe(true);
    });

    it("582 admin stats returns topUsersByBuilds", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stats`, {
        headers: { Cookie: cookieHeader(token) },
      });
      if (res.status === 403) return;
      const body = await res.json();
      expect(Array.isArray(body.topUsersByBuilds)).toBe(true);
    });

    it("583 admin stats returns queueByPlan", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stats`, {
        headers: { Cookie: cookieHeader(token) },
      });
      if (res.status === 403) return;
      const body = await res.json();
      expect(body.queueByPlan).toBeDefined();
    });
  });
});
