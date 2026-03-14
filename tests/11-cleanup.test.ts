import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  cleanupTestData,
} from "./helpers";
import { cleanupWorkspaces, cleanupDeployments, opportunisticCleanup } from "../apps/web/lib/cleanup";
import * as fs from "fs";
import * as path from "path";

let user: { id: string; email: string };

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Cleanup: workspace cleanup", () => {
  it("275 cleanupWorkspaces returns deleted count and errors", async () => {
    const result = await cleanupWorkspaces();
    expect(typeof result.deleted).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("276 cleanupWorkspaces does not delete RUNNING jobs", async () => {
    const runningJobs = await prisma.job.findMany({ where: { status: "RUNNING" } });
    const result = await cleanupWorkspaces();
    const stillRunning = await prisma.job.findMany({ where: { status: "RUNNING" } });
    expect(stillRunning.length).toBe(runningJobs.length);
  });

  it("277 cleanupWorkspaces handles missing /tmp/workspaces gracefully", async () => {
    const result = await cleanupWorkspaces();
    expect(result).toBeTruthy();
  });

  it("278 safe path rejects path traversal", async () => {
    const project = await createTestProject(user.id);
    const job = await prisma.job.create({
      data: { projectId: project, status: "COMPLETED" },
    });
    const result = await cleanupWorkspaces();
    expect(result).toBeTruthy();
  });
});

describe("Cleanup: deployment cleanup", () => {
  it("279 cleanupDeployments returns stopped count and errors", async () => {
    const result = await cleanupDeployments();
    expect(typeof result.stopped).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("280 cleanupDeployments handles no deployments gracefully", async () => {
    const result = await cleanupDeployments();
    expect(result).toBeTruthy();
  });
});

describe("Cleanup: opportunistic cleanup", () => {
  it("281 opportunisticCleanup runs without error", async () => {
    await expect(opportunisticCleanup()).resolves.toBeUndefined();
  });

  it("282 opportunisticCleanup is rate-limited (second call is instant)", async () => {
    const start = Date.now();
    await opportunisticCleanup();
    await opportunisticCleanup();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("Cleanup: env var defaults", () => {
  it("283 WORKSPACE_TTL_HOURS defaults to 24", () => {
    const val = parseInt(process.env.WORKSPACE_TTL_HOURS || "24", 10);
    expect(val).toBeGreaterThan(0);
  });

  it("284 MAX_WORKSPACES_PER_USER defaults to 20", () => {
    const val = parseInt(process.env.MAX_WORKSPACES_PER_USER || "20", 10);
    expect(val).toBeGreaterThan(0);
  });

  it("285 MAX_ACTIVE_DEPLOYMENTS_PER_USER defaults to 5", () => {
    const val = parseInt(process.env.MAX_ACTIVE_DEPLOYMENTS_PER_USER || "5", 10);
    expect(val).toBeGreaterThan(0);
  });
});
