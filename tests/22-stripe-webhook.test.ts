import { describe, it, expect, beforeAll } from "vitest";
import { prisma, createTestUser, createTestSession, cookieHeader } from "./helpers";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:5000";

let user: { id: string; email: string };
let token: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
});

describe("Stripe integration", () => {
  describe("checkout endpoint", () => {
    it("584 requires authentication", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "pro" }),
      });
      expect(res.status).toBe(401);
    });

    it("585 returns 503 when Stripe not configured", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "pro" }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("Stripe not configured");
    });

    it("586 rejects invalid plan key", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "invalid" }),
      });
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  describe("webhook endpoint", () => {
    it("587 requires stripe-signature header", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });
      expect([400, 503]).toContain(res.status);
    });

    it("588 rejects invalid signature", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "t=123,v1=fake",
        },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });
      expect([400, 503]).toContain(res.status);
    });
  });

  describe("portal endpoint", () => {
    it("589 requires authentication", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/portal`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("590 returns 503 when Stripe not configured", async () => {
      const res = await fetch(`${BASE_URL}/api/stripe/portal`, {
        method: "POST",
        headers: { Cookie: cookieHeader(token) },
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("Stripe not configured");
    });
  });

  describe("plan API with Stripe disabled", () => {
    it("591 GET /api/billing/plan returns stripeEnabled field", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("stripeEnabled");
      expect(body.stripeEnabled).toBe(false);
    });

    it("592 POST /api/billing/plan works when Stripe disabled (mock upgrade)", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(token) },
        body: JSON.stringify({ planKey: "pro" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.planKey).toBe("pro");
    });

    it("593 subscription record updated after mock upgrade", async () => {
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub).toBeDefined();
      expect(sub!.planKey).toBe("pro");
      expect(sub!.status).toBe("active");
    });

    it("594 GET /api/billing/plan returns subscription info", async () => {
      const res = await fetch(`${BASE_URL}/api/billing/plan`, {
        headers: { Cookie: cookieHeader(token) },
      });
      const body = await res.json();
      expect(body.planKey).toBe("pro");
      expect(body.subscription).toBeDefined();
      expect(body.subscription.status).toBe("active");
    });
  });

  describe("Subscription model for Stripe fields", () => {
    it("595 subscription stores stripeCustomerId", async () => {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { stripeCustomerId: "cus_test_12345" },
      });
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub!.stripeCustomerId).toBe("cus_test_12345");
    });

    it("596 subscription stores stripeSubscriptionId", async () => {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { stripeSubscriptionId: "sub_test_67890" },
      });
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub!.stripeSubscriptionId).toBe("sub_test_67890");
    });

    it("597 subscription stores currentPeriodEnd", async () => {
      const futureDate = new Date("2027-01-01");
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { currentPeriodEnd: futureDate },
      });
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub!.currentPeriodEnd).toBeDefined();
      expect(sub!.currentPeriodEnd!.getFullYear()).toBe(2027);
    });

    it("598 subscription supports past_due status", async () => {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { status: "past_due" },
      });
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub!.status).toBe("past_due");
    });

    it("599 subscription supports canceled status", async () => {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { status: "canceled", planKey: "basic" },
      });
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub!.status).toBe("canceled");
      expect(sub!.planKey).toBe("basic");
    });
  });
});
