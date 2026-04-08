import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  cookieHeader, apiGet, cleanupTestData, createCompletedJob,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;
let completedJobId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "deploy test", features: "test" });
  completedJobId = await createCompletedJob(projectId);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Deploy: Deployment model validation", () => {
  it("176 Deployment status is valid", async () => {
    const deps = await prisma.deployment.findMany({ take: 20 });
    const valid = ["PENDING", "DEPLOYING", "SUCCESS", "FAILED"];
    for (const d of deps) {
      expect(valid).toContain(d.status);
    }
  });

  it("177 Deployment provider is set", async () => {
    const deps = await prisma.deployment.findMany({ take: 10 });
    for (const d of deps) {
      expect(d.provider).toBeTruthy();
    }
  });

  it("178 SUCCESS deployments have url set", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "SUCCESS" } });
    for (const d of deps) {
      expect(d.url).toBeTruthy();
    }
  });

  it("179 SUCCESS deployments have internalPort or null", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "SUCCESS" } });
    for (const d of deps) {
      expect(d.internalPort === null || typeof d.internalPort === "number").toBe(true);
    }
  });

  it("180 SUCCESS deployments have workspacePath or null", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "SUCCESS" } });
    for (const d of deps) {
      expect(d.workspacePath === null || typeof d.workspacePath === "string").toBe(true);
    }
  });

  it("181 internalPort is in valid range (7100-7999)", async () => {
    const deps = await prisma.deployment.findMany({
      where: { internalPort: { not: null } },
    });
    for (const d of deps) {
      expect(d.internalPort!).toBeGreaterThanOrEqual(7100);
      expect(d.internalPort!).toBeLessThanOrEqual(7999);
    }
  });

  it("182 FAILED deployments have error or null url", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "FAILED" } });
    for (const d of deps) {
      expect(d.error != null || d.url == null).toBe(true);
    }
  });

  it("183 Deployment has userId set", async () => {
    const deps = await prisma.deployment.findMany({ take: 10 });
    for (const d of deps) {
      expect(d.userId).toBeTruthy();
    }
  });

  it("184 Deployment has projectId set", async () => {
    const deps = await prisma.deployment.findMany({ take: 10 });
    for (const d of deps) {
      expect(d.projectId).toBeTruthy();
    }
  });

  it("185 Deployment has jobId set (unique)", async () => {
    const deps = await prisma.deployment.findMany({ take: 20 });
    const jobIds = deps.map((d) => d.jobId);
    expect(new Set(jobIds).size).toBe(jobIds.length);
  });

  it("186 Deployment createdAt is valid date", async () => {
    const deps = await prisma.deployment.findMany({ take: 10 });
    for (const d of deps) {
      expect(d.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe("Deploy: proxy auth enforcement", () => {
  it("187 proxy root without auth allows access", async () => {
    const d = await prisma.deployment.findFirst({ where: { status: "SUCCESS" } });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}/proxy`);
    expect([200, 503]).toContain(r.status);
  });

  it("188 proxy subpath without auth allows access", async () => {
    const d = await prisma.deployment.findFirst({ where: { status: "SUCCESS" } });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}/proxy/api/health`);
    expect([200, 503]).toContain(r.status);
  });

  it("189 proxy with wrong user => 404", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS", userId: { not: user.id } },
    });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}/proxy`, cookieHeader(token));
    expect(r.status).toBe(404);
  });

  it("190 deployment debug endpoint without auth => 401", async () => {
    const d = await prisma.deployment.findFirst({ where: { status: "SUCCESS" } });
    if (!d) return;
    const r = await apiGet(`/api/deployments/${d.id}`);
    expect(r.status).toBe(401);
  });
});

describe("Deploy: project deployments API", () => {
  it("191 /api/projects/:id/deployments returns array", async () => {
    const r = await apiGet(`/api/projects/${projectId}/deployments`, cookieHeader(token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("192 deployments list without auth => 401", async () => {
    const r = await apiGet(`/api/projects/${projectId}/deployments`);
    expect(r.status).toBe(401);
  });

  it("193 deployments for nonexistent project => 404", async () => {
    const r = await apiGet("/api/projects/nonexistent/deployments", cookieHeader(token));
    expect(r.status).toBe(404);
  });
});

describe("Deploy: proxy with valid owner", () => {
  it("194 proxy returns 200 or 503 for owner's deployment", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    if (!d) return;
    const ownerSession = await prisma.session.findFirst({
      where: { userId: d.userId, expires: { gt: new Date() } },
    });
    if (!ownerSession) return;
    const r = await apiGet(
      `/api/deployments/${d.id}/proxy`,
      cookieHeader(ownerSession.sessionToken)
    );
    expect([200, 503]).toContain(r.status);
  });

  it("195 proxy /api/health returns 200 or 503", async () => {
    const d = await prisma.deployment.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    if (!d) return;
    const ownerSession = await prisma.session.findFirst({
      where: { userId: d.userId, expires: { gt: new Date() } },
    });
    if (!ownerSession) return;
    const r = await apiGet(
      `/api/deployments/${d.id}/proxy/api/health`,
      cookieHeader(ownerSession.sessionToken)
    );
    expect([200, 503]).toContain(r.status);
  });
});

describe("Deploy: deployment URL format", () => {
  it("196 SUCCESS deployment URL contains /api/deployments/", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "SUCCESS" } });
    for (const d of deps) {
      if (d.url) {
        expect(d.url).toContain("/api/deployments/");
        expect(d.url).toContain("/proxy");
      }
    }
  });

  it("197 deployment URL contains deployment ID", async () => {
    const deps = await prisma.deployment.findMany({ where: { status: "SUCCESS" } });
    for (const d of deps) {
      if (d.url) {
        expect(d.url).toContain(d.id);
      }
    }
  });
});

describe("Deploy: deploy logs analysis", () => {
  const deployLogPatterns = [
    "[DEPLOY]",
    "port",
    "Deployment",
  ];

  for (const pattern of deployLogPatterns) {
    it(`198+ deploy logs contain "${pattern}"`, async () => {
      const logs = await prisma.jobLog.findMany({
        where: { jobId: completedJobId, message: { contains: pattern } },
      });
      expect(logs.length).toBeGreaterThan(0);
    });
  }

  it("201 deploy logs have SUCCESS level entry", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, level: "SUCCESS", message: { contains: "[DEPLOY]" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("202 deploy logs mention Live URL", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "Live URL" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("203 deploy logs mention health check", async () => {
    const logs = await prisma.jobLog.findMany({
      where: { jobId: completedJobId, message: { contains: "health" } },
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("Deploy: nonexistent deployment IDs", () => {
  const fakeIds = ["fake-deploy-1", "fake-deploy-2", "fake-deploy-3"];

  for (const fakeId of fakeIds) {
    it(`204+ /api/deployments/${fakeId} => 404`, async () => {
      const r = await apiGet(`/api/deployments/${fakeId}`, cookieHeader(token));
      expect(r.status).toBe(404);
    });

    it(`207+ /api/deployments/${fakeId}/proxy => 404`, async () => {
      const r = await apiGet(`/api/deployments/${fakeId}/proxy`, cookieHeader(token));
      expect(r.status).toBe(404);
    });
  }
});
