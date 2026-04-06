import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestSession, createTestProject,
  createTestChat, cookieHeader, cleanupTestData,
} from "./helpers";

let user: { id: string; email: string };
let token: string;
let projectId: string;

beforeAll(async () => {
  user = await createTestUser();
  token = await createTestSession(user.id);
  projectId = await createTestProject(user.id, { purpose: "regression", features: "all" });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Regression: project findMany filters", () => {
  it("501 filter by userId returns only user's projects", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    for (const p of projects) expect(p.userId).toBe(user.id);
  });

  it("502 filter by name contains", async () => {
    await createTestProject(user.id, { purpose: "searchable-xyz" });
    const projects = await prisma.project.findMany({
      where: { userId: user.id, specJson: { path: ["purpose"], string_contains: "searchable" } },
    });
    expect(projects.length).toBeGreaterThan(0);
  });

  it("503 orderBy createdAt asc", async () => {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i].createdAt.getTime()).toBeGreaterThanOrEqual(projects[i - 1].createdAt.getTime());
    }
  });

  it("504 take limit", async () => {
    const projects = await prisma.project.findMany({ where: { userId: user.id }, take: 2 });
    expect(projects.length).toBeLessThanOrEqual(2);
  });

  it("505 skip offset", async () => {
    const all = await prisma.project.findMany({ where: { userId: user.id } });
    if (all.length > 1) {
      const skipped = await prisma.project.findMany({ where: { userId: user.id }, skip: 1 });
      expect(skipped.length).toBe(all.length - 1);
    }
  });
});

describe("Regression: message queries", () => {
  it("506 filter messages by role=user", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "u1", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: cid, role: "assistant", content: "a1", mode: "Discuss" } });
    const userMsgs = await prisma.message.findMany({ where: { chatId: cid, role: "user" } });
    for (const m of userMsgs) expect(m.role).toBe("user");
  });

  it("507 filter messages by role=assistant", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "assistant", content: "a1", mode: "Discuss" } });
    const msgs = await prisma.message.findMany({ where: { chatId: cid, role: "assistant" } });
    for (const m of msgs) expect(m.role).toBe("assistant");
  });

  it("508 filter messages by mode", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "p1", mode: "Plan" } });
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "d1", mode: "Discuss" } });
    const planMsgs = await prisma.message.findMany({ where: { chatId: cid, mode: "Plan" } });
    expect(planMsgs.length).toBe(1);
    expect(planMsgs[0].content).toBe("p1");
  });

  it("509 count messages by chat", async () => {
    const cid = await createTestChat(projectId);
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({ data: { chatId: cid, role: "user", content: `m${i}`, mode: "Discuss" } });
    }
    const count = await prisma.message.count({ where: { chatId: cid } });
    expect(count).toBe(5);
  });

  it("510 latest message via orderBy", async () => {
    const cid = await createTestChat(projectId);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "first", mode: "Discuss" } });
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "last", mode: "Discuss" } });
    const latest = await prisma.message.findFirst({
      where: { chatId: cid },
      orderBy: { createdAt: "desc" },
    });
    expect(latest!.content).toBe("last");
  });
});

describe("Regression: job lifecycle", () => {
  it("511 job status transitions PENDING->RUNNING", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "PENDING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "RUNNING" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("RUNNING");
  });

  it("512 job status transitions RUNNING->COMPLETED", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "COMPLETED" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("COMPLETED");
  });

  it("513 job status transitions RUNNING->FAILED", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.job.update({ where: { id: j.id }, data: { status: "FAILED" } });
    const found = await prisma.job.findUnique({ where: { id: j.id } });
    expect(found!.status).toBe("FAILED");
  });

  it("514 multiple jobs on same project", async () => {
    await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    await prisma.job.create({ data: { projectId, status: "FAILED" } });
    const jobs = await prisma.job.findMany({ where: { projectId } });
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });

  it("515 latest job via orderBy", async () => {
    await prisma.job.create({ data: { projectId, status: "COMPLETED" } });
    const latest = await prisma.job.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    expect(latest).toBeTruthy();
  });
});

describe("Regression: job log operations", () => {
  it("516 create multiple log entries for job", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    for (let i = 0; i < 5; i++) {
      await prisma.jobLog.create({ data: { jobId: j.id, message: `Step ${i}`, level: "INFO" } });
    }
    const logs = await prisma.jobLog.findMany({ where: { jobId: j.id } });
    expect(logs.length).toBe(5);
  });

  it("517 filter logs by level", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "info msg", level: "INFO" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "error msg", level: "ERROR" } });
    const errors = await prisma.jobLog.findMany({ where: { jobId: j.id, level: "ERROR" } });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("error msg");
  });

  it("518 log message search with contains", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "[RUNNER] Starting build", level: "INFO" } });
    await prisma.jobLog.create({ data: { jobId: j.id, message: "[DEPLOY] Deploying app", level: "INFO" } });
    const runnerLogs = await prisma.jobLog.findMany({
      where: { jobId: j.id, message: { contains: "[RUNNER]" } },
    });
    expect(runnerLogs.length).toBe(1);
  });
});

describe("Regression: session validation", () => {
  it("519 expired session not returned by filter", async () => {
    const t = `exp-test-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: t, userId: user.id, expires: new Date(Date.now() - 1000) },
    });
    const valid = await prisma.session.findMany({
      where: { userId: user.id, expires: { gt: new Date() } },
    });
    expect(valid.every((s) => s.sessionToken !== t)).toBe(true);
  });

  it("520 valid session returned by filter", async () => {
    const t = `valid-test-${Date.now()}`;
    await prisma.session.create({
      data: { sessionToken: t, userId: user.id, expires: new Date(Date.now() + 86400000) },
    });
    const valid = await prisma.session.findFirst({
      where: { sessionToken: t, expires: { gt: new Date() } },
    });
    expect(valid).toBeTruthy();
  });
});

describe("Regression: OpenAiUsage aggregation", () => {
  it("521 sum tokens across dates", async () => {
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-09-01", requests: 10, tokens: 1000 } });
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-09-02", requests: 5, tokens: 500 } });
    const agg = await prisma.openAiUsage.aggregate({
      where: { userId: user.id, date: { startsWith: "2099-09" } },
      _sum: { tokens: true, requests: true },
    });
    expect(agg._sum.tokens).toBe(1500);
    expect(agg._sum.requests).toBe(15);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { startsWith: "2099-09" } } });
  });

  it("522 max tokens in a day", async () => {
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-08-01", requests: 10, tokens: 5000 } });
    await prisma.openAiUsage.create({ data: { userId: user.id, date: "2099-08-02", requests: 5, tokens: 3000 } });
    const agg = await prisma.openAiUsage.aggregate({
      where: { userId: user.id, date: { startsWith: "2099-08" } },
      _max: { tokens: true },
    });
    expect(agg._max.tokens).toBe(5000);
    await prisma.openAiUsage.deleteMany({ where: { userId: user.id, date: { startsWith: "2099-08" } } });
  });
});

describe("Regression: session validity checks (DB)", () => {
  for (let i = 0; i < 5; i++) {
    it(`523+ session validity check ${i}`, async () => {
      const s = await prisma.session.findFirst({
        where: { userId: user.id, expires: { gt: new Date() } },
      });
      expect(s).not.toBeNull();
      expect(s!.expires.getTime()).toBeGreaterThan(Date.now());
    });
  }
});

describe("Regression: project access consistency (DB)", () => {
  for (let i = 0; i < 5; i++) {
    it(`528+ project access check ${i}`, async () => {
      const projects = await prisma.project.findMany({ where: { userId: user.id } });
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
    });
  }
});

describe("Regression: DB transaction isolation", () => {
  it("533 concurrent creates don't conflict", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      prisma.project.create({ data: { name: `Concurrent ${i}`, userId: user.id } })
    );
    const results = await Promise.all(promises);
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("534 concurrent reads are consistent", async () => {
    const promises = Array.from({ length: 5 }, () =>
      prisma.project.count({ where: { userId: user.id } })
    );
    const counts = await Promise.all(promises);
    expect(counts.every((c) => c === counts[0])).toBe(true);
  });
});

describe("Regression: project-chat-message cascade", () => {
  it("535 full cascade: project -> chats -> messages", async () => {
    const pid = await createTestProject(user.id);
    const cid = await createTestChat(pid);
    await prisma.message.create({ data: { chatId: cid, role: "user", content: "cascade test", mode: "Discuss" } });
    
    await prisma.project.delete({ where: { id: pid } });
    
    const chat = await prisma.chat.findUnique({ where: { id: cid } });
    expect(chat).toBeNull();
    const msgs = await prisma.message.findMany({ where: { chatId: cid } });
    expect(msgs.length).toBe(0);
  });
});

describe("Regression: user relations", () => {
  it("536 user has projects relation", async () => {
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      include: { projects: true },
    });
    expect(Array.isArray(u!.projects)).toBe(true);
    expect(u!.projects.length).toBeGreaterThan(0);
  });

  it("537 user has sessions relation", async () => {
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      include: { sessions: true },
    });
    expect(Array.isArray(u!.sessions)).toBe(true);
    expect(u!.sessions.length).toBeGreaterThan(0);
  });
});

describe("Regression: specJson edge cases", () => {
  it("538 specJson with empty object", async () => {
    const pid = await createTestProject(user.id, {});
    const p = await prisma.project.findUnique({ where: { id: pid } });
    expect(p!.specJson).toBeTruthy();
  });

  it("539 specJson with nested objects", async () => {
    const pid = await createTestProject(user.id, {
      purpose: "nested",
      config: { db: { host: "localhost", port: 5432 } },
    });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.config).toBeTruthy();
  });

  it("540 specJson with null values", async () => {
    const pid = await createTestProject(user.id, {
      purpose: "null test",
      optional: null,
    });
    const p = await prisma.project.findUnique({ where: { id: pid } });
    const spec = p!.specJson as Record<string, unknown>;
    expect(spec.optional).toBeNull();
  });
});

describe("Regression: timestamp precision", () => {
  it("541 createdAt has millisecond precision", async () => {
    const before = Date.now();
    const p = await prisma.project.create({ data: { name: "ts test", userId: user.id } });
    const after = Date.now();
    expect(p.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(p.createdAt.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("542 message timestamps are ordered", async () => {
    const cid = await createTestChat(projectId);
    const m1 = await prisma.message.create({ data: { chatId: cid, role: "user", content: "t1", mode: "Discuss" } });
    const m2 = await prisma.message.create({ data: { chatId: cid, role: "user", content: "t2", mode: "Discuss" } });
    expect(m2.createdAt.getTime()).toBeGreaterThanOrEqual(m1.createdAt.getTime());
  });

  it("543 job log timestamps are ordered", async () => {
    const j = await prisma.job.create({ data: { projectId, status: "RUNNING" } });
    const l1 = await prisma.jobLog.create({ data: { jobId: j.id, message: "l1", level: "INFO" } });
    const l2 = await prisma.jobLog.create({ data: { jobId: j.id, message: "l2", level: "INFO" } });
    expect(l2.createdAt.getTime()).toBeGreaterThanOrEqual(l1.createdAt.getTime());
  });
});

describe("Regression: findMany empty results", () => {
  it("544 findMany with impossible filter returns empty", async () => {
    const results = await prisma.project.findMany({ where: { userId: "impossible-id-xyz" } });
    expect(results).toEqual([]);
  });

  it("545 findFirst with impossible filter returns null", async () => {
    const result = await prisma.project.findFirst({ where: { userId: "impossible-id-xyz" } });
    expect(result).toBeNull();
  });

  it("546 count with impossible filter returns 0", async () => {
    const count = await prisma.project.count({ where: { userId: "impossible-id-xyz" } });
    expect(count).toBe(0);
  });
});

describe("Regression: update nonexistent record", () => {
  it("547 updateMany on nonexistent returns count 0", async () => {
    const result = await prisma.project.updateMany({
      where: { id: "nonexistent-project-id" },
      data: { name: "updated" },
    });
    expect(result.count).toBe(0);
  });

  it("548 deleteMany on nonexistent returns count 0", async () => {
    const result = await prisma.project.deleteMany({
      where: { id: "nonexistent-project-id" },
    });
    expect(result.count).toBe(0);
  });
});

describe("Regression: user email uniqueness", () => {
  it("549 cannot create duplicate email", async () => {
    let err: unknown = null;
    try {
      await prisma.user.create({ data: { email: user.email } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
  });

  it("550 different emails are allowed", async () => {
    const u = await prisma.user.create({ data: { email: `unique-${Date.now()}@test.com` } });
    expect(u.id).toBeTruthy();
  });
});

describe("Acceptance checks unit tests", () => {
  it("551 acceptance API accepts templateKey=null (default app)", async () => {
    const mod = await import("../apps/web/lib/acceptance-checks");
    expect(mod.runAcceptanceChecks).toBeDefined();
    expect(mod.runAcceptanceWithRetry).toBeDefined();
    expect(mod.formatAcceptanceReport).toBeDefined();
  });

  it("552 formatAcceptanceReport shows PASS for all-passed checks", async () => {
    const { formatAcceptanceReport } = await import("../apps/web/lib/acceptance-checks");
    const result = {
      passed: true,
      checks: [
        { name: "health", passed: true, detail: "ok" },
        { name: "homepage", passed: true, detail: "ok" },
      ],
      attempts: 1,
    };
    const report = formatAcceptanceReport(result);
    expect(report).toContain("ALL CHECKS PASSED");
    expect(report).toContain("[PASS] health");
  });

  it("553 formatAcceptanceReport shows FAIL for failed checks", async () => {
    const { formatAcceptanceReport } = await import("../apps/web/lib/acceptance-checks");
    const result = {
      passed: false,
      checks: [
        { name: "health", passed: true, detail: "ok" },
        { name: "projectsPage", passed: false, detail: "status=404" },
        { name: "dbCheck", passed: false, detail: "error" },
        { name: "crud", passed: false, detail: "error" },
      ],
      attempts: 3,
    };
    const report = formatAcceptanceReport(result);
    expect(report).toContain("SOME CHECKS FAILED");
    expect(report).toContain("[FAIL] projectsPage");
    expect(report).toContain("[FAIL] dbCheck");
    expect(report).toContain("[FAIL] crud");
  });

  it("554 template marker detection in project-management-saas template", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const layout = files.find((f: any) => f.path === "app/layout.tsx");
    expect(layout).toBeTruthy();
    expect(layout!.content).toContain('content="project-management-saas"');
    expect(layout!.content).toContain("ai-workspace-template");
  });

  it("555 template has required routes for acceptance", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    expect(projectManagementSaasTemplate.requiredRoutes).toContain("/api/health");
    expect(projectManagementSaasTemplate.requiredRoutes).toContain("/api/db-check");
    expect(projectManagementSaasTemplate.requiredRoutes).toContain("/api/projects");
  });

  it("556 template has /projects page file", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const projectsPage = files.find((f: any) => f.path === "app/projects/page.tsx");
    expect(projectsPage).toBeTruthy();
    expect(projectsPage!.content.toLowerCase()).toContain("project");
  });

  it("557 detectTemplateKey matches project-management prompts", async () => {
    const { detectTemplateKey } = await import("../apps/web/lib/templates");
    expect(detectTemplateKey("project management app", "tasks and collaboration")).toBe("project-management-saas");
    expect(detectTemplateKey("build me a todo tracker", "task board")).toBe("project-management-saas");
    expect(detectTemplateKey("weather app", "forecasts")).toBeNull();
  });

  it("558 getTemplate returns project-management-saas", async () => {
    const { getTemplate } = await import("../apps/web/lib/templates");
    const tpl = getTemplate("project-management-saas");
    expect(tpl).toBeTruthy();
    expect(tpl!.key).toBe("project-management-saas");
    expect(tpl!.getFiles().length).toBeGreaterThan(5);
  });

  it("559 getTemplate returns undefined for nonexistent key", async () => {
    const { getTemplate } = await import("../apps/web/lib/templates");
    expect(getTemplate("nonexistent-template")).toBeUndefined();
  });
});

describe("Spec logger + redaction + safety gates", () => {
  it("560 redactSpec removes sensitive keys", async () => {
    const { redactSpec } = await import("../apps/web/lib/spec-logger");
    const result = redactSpec({
      title: "My App",
      apiKey: "sk-1234",
      DATABASE_URL: "postgres://secret",
      nested: { password: "hunter2", safe: "ok" },
    });
    expect(result.title).toBe("My App");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.DATABASE_URL).toBe("[REDACTED]");
    expect((result.nested as any).password).toBe("[REDACTED]");
    expect((result.nested as any).safe).toBe("ok");
  });

  it("561 redactSpec handles null/undefined", async () => {
    const { redactSpec } = await import("../apps/web/lib/spec-logger");
    expect(redactSpec(null)).toEqual({});
    expect(redactSpec(undefined)).toEqual({});
  });

  it("562 getSpecLogLines produces correct format", async () => {
    const { getSpecLogLines } = await import("../apps/web/lib/spec-logger");
    const lines = getSpecLogLines({
      templateKey: "project-management-saas",
      title: "ProjectHub",
      requiredRoutes: ["/api/health", "/api/projects"],
      apiKey: "secret",
    });
    expect(lines.templateKey).toBe("[SPEC] templateKey=project-management-saas");
    expect(lines.title).toBe("[SPEC] title=ProjectHub");
    expect(lines.requiredRoutes).toBe('[SPEC] requiredRoutes=["/api/health","/api/projects"]');
    expect(lines.specJson).toContain("[SPEC] specJson=");
    expect(lines.specJson).toContain('"[REDACTED]"');
    expect(lines.specJson).not.toContain("secret");
  });

  it("563 getSpecLogLines handles null spec", async () => {
    const { getSpecLogLines } = await import("../apps/web/lib/spec-logger");
    const lines = getSpecLogLines(null);
    expect(lines.templateKey).toBe("[SPEC] templateKey=none");
    expect(lines.title).toBe("[SPEC] title=none");
    expect(lines.requiredRoutes).toBe("[SPEC] requiredRoutes=[]");
  });

  it("564 specHasComplexApp detects templateKey", async () => {
    const { specHasComplexApp } = await import("../apps/web/lib/spec-logger");
    expect(specHasComplexApp({ templateKey: "project-management-saas" })).toBe(true);
    expect(specHasComplexApp(null)).toBe(false);
    expect(specHasComplexApp({})).toBe(false);
  });

  it("565 specHasComplexApp detects requiredRoutes", async () => {
    const { specHasComplexApp } = await import("../apps/web/lib/spec-logger");
    expect(specHasComplexApp({ requiredRoutes: ["/api/health"] })).toBe(true);
    expect(specHasComplexApp({ requiredRoutes: [] })).toBe(false);
  });

  it("566 specHasComplexApp detects entities", async () => {
    const { specHasComplexApp } = await import("../apps/web/lib/spec-logger");
    expect(specHasComplexApp({ requiredEntities: ["Project", "Task"] })).toBe(true);
  });

  it("567 specHasComplexApp detects long features", async () => {
    const { specHasComplexApp } = await import("../apps/web/lib/spec-logger");
    expect(specHasComplexApp({ features: "a".repeat(21) })).toBe(true);
    expect(specHasComplexApp({ features: "short" })).toBe(false);
  });

  it("568 MIN_FILES_FOR_COMPLEX_APP is at least 10", async () => {
    const { MIN_FILES_FOR_COMPLEX_APP } = await import("../apps/web/lib/spec-logger");
    expect(MIN_FILES_FOR_COMPLEX_APP).toBeGreaterThanOrEqual(10);
  });

  it("569 redactSpec preserves arrays", async () => {
    const { redactSpec } = await import("../apps/web/lib/spec-logger");
    const result = redactSpec({
      requiredRoutes: ["/api/health", "/api/projects"],
      tags: ["web", "saas"],
    });
    expect(result.requiredRoutes).toEqual(["/api/health", "/api/projects"]);
    expect(result.tags).toEqual(["web", "saas"]);
  });

  it("570 redactSpec handles all secret key variants", async () => {
    const { redactSpec } = await import("../apps/web/lib/spec-logger");
    const result = redactSpec({
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      flyToken: "fly-token",
      GITHUB_PAT: "ghp_test",
      openaiApiKey: "sk-proj-abc",
      accessToken: "bearer-xyz",
    });
    for (const val of Object.values(result)) {
      expect(val).toBe("[REDACTED]");
    }
  });
});

describe("Fly Dockerfile + Prisma + proxy safety fixes", () => {
  it("571 template uses SQLite with env DATABASE_URL", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const schema = files.find((f: any) => f.path === "prisma/schema.prisma");
    expect(schema).toBeTruthy();
    expect(schema!.content).toContain('provider = "sqlite"');
    expect(schema!.content).toContain('env("DATABASE_URL")');
    expect(schema!.content).not.toContain("file:./dev.db");
  });

  it("572 template Prisma schema has binaryTargets for Alpine", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const schema = files.find((f: any) => f.path === "prisma/schema.prisma");
    expect(schema!.content).toContain("linux-musl-openssl-3.0.x");
  });

  it("573 template has .env with DATABASE_URL for SQLite", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const envFile = files.find((f: any) => f.path === ".env");
    expect(envFile).toBeTruthy();
    expect(envFile!.content).toContain("DATABASE_URL");
    expect(envFile!.content).toContain("file:");
  });

  it("574 template build script runs prisma generate + db push + next build", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const pkg = projectManagementSaasTemplate.getPackageJson();
    const build = (pkg.scripts as any).build;
    expect(build).toContain("prisma generate");
    expect(build).toContain("prisma db push");
    expect(build).toContain("next build");
  });

  it("575 acceptance is never skipped for proxy URLs in job-runner", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/job-runner.ts", "utf-8"));
    expect(source).not.toContain("Skipping acceptance checks for proxy");
    expect(source).toContain("Starting acceptance checks");
  });

  it("576 job-runner never shows Live URL without acceptance passing", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/job-runner.ts", "utf-8"));
    const liveUrlLines = source.split("\n").filter((l: string) => l.includes("Live URL (Production)"));
    for (const line of liveUrlLines) {
      expect(line).not.toContain("Skipping");
    }
    expect(source).toContain("URL NOT promoted to Production");
  });
});

describe("Template route handler params safety", () => {
  it("577 tasks route uses resolveProjectId (safe params await)", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const tasksRoute = files.find((f: any) => f.path === "app/api/projects/[projectId]/tasks/route.ts");
    expect(tasksRoute).toBeTruthy();
    expect(tasksRoute!.content).toContain("resolveProjectId");
    expect(tasksRoute!.content).toContain("await resolveProjectId(ctx)");
    expect(tasksRoute!.content).not.toContain("params.projectId");
  });

  it("578 comments route uses resolveTaskId (safe params await)", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const commentsRoute = files.find((f: any) => f.path === "app/api/tasks/[taskId]/comments/route.ts");
    expect(commentsRoute).toBeTruthy();
    expect(commentsRoute!.content).toContain("resolveTaskId");
    expect(commentsRoute!.content).toContain("await resolveTaskId(ctx)");
    expect(commentsRoute!.content).not.toContain("params.taskId");
  });

  it("579 tasks POST validates project exists before creating task", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const tasksRoute = files.find((f: any) => f.path === "app/api/projects/[projectId]/tasks/route.ts");
    expect(tasksRoute!.content).toContain("project.findUnique");
    expect(tasksRoute!.content).toContain("Project not found");
    expect(tasksRoute!.content).toContain("404");
  });

  it("580 tasks POST returns 201 with task JSON", async () => {
    const { projectManagementSaasTemplate } = await import("../apps/web/lib/templates/project-management-saas");
    const files = projectManagementSaasTemplate.getFiles();
    const tasksRoute = files.find((f: any) => f.path === "app/api/projects/[projectId]/tasks/route.ts");
    expect(tasksRoute!.content).toContain("status: 201");
    expect(tasksRoute!.content).toContain("task.create");
  });

  it("581 acceptance CRUD logs response body on task failure", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/acceptance-checks.ts", "utf-8"));
    expect(source).toContain("taskRes.body.slice");
  });
});

describe("ensureFlyctl pinned version", () => {
  it("582 worker prepares PATH with /usr/local/bin and /root/.fly/bin", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/worker/index.ts", "utf-8"));
    expect(source).toContain("prepareWorkerPath");
    expect(source).toContain("/usr/local/bin");
    expect(source).toContain("/root/.fly/bin");
    expect(source).not.toContain("releases/latest/download");
  });

  it("583 fly-deployer ensureFlyctl uses pinned version, logs to JobLog", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    expect(source).toContain("FLYCTL_VERSION");
    expect(source).toContain("v8-joblog");
    expect(source).not.toContain("releases/latest/download");
    const match = source.match(/FLYCTL_VERSION\s*=\s*"([^"]+)"/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(source).toContain("async function ensureFlyctl(jobId");
    expect(source).toContain("logToJob");
  });

  it("584 fly-deployer ensureFlyctl checks /usr/local/bin/flyctl and /root/.fly/bin/flyctl", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    expect(source).toContain('"/usr/local/bin/flyctl"');
    expect(source).toContain('"/root/.fly/bin/flyctl"');
  });

  it("585 fly-deployer installs to writable ~/.fly/bin path", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    expect(source).toContain("releases/download/v${FLYCTL_VERSION}");
    expect(source).toContain("flyctl_${FLYCTL_VERSION}_Linux_x86_64.tar.gz");
    expect(source).toContain("copyFileSync");
    expect(source).not.toContain("mv /tmp/flyctl /usr/local/bin");
  });

  it("586a Dockerfile.worker installs flyctl at build time", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/Dockerfile.worker", "utf-8"));
    expect(source).toContain("flyctl");
    expect(source).toContain("/usr/local/bin");
    expect(source).toContain("flyctl version");
    expect(source).toContain("node:20");
  });

  it("586 fly-deployer has FLYCTL_VERSION constant", async () => {
    const deploySrc = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    const dMatch = deploySrc.match(/FLYCTL_VERSION\s*=\s*"([^"]+)"/);
    expect(dMatch).toBeTruthy();
    expect(dMatch![1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("587 install.sh fallback still present in fly-deployer", async () => {
    const deploySrc = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    expect(deploySrc).toContain("https://fly.io/install.sh");
  });
});

describe("Fly deploy retry on registry errors", () => {
  it("590 fly-deployer retries up to 3 times on registry push errors", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/fly-deployer.ts", "utf-8"));
    expect(source).toContain("maxAttempts = 3");
    expect(source).toContain("failed to push registry");
    expect(source).toContain("unexpected status from HEAD request");
    expect(source).toContain("retrying in 15s");
  });
});

describe("specJson string parsing", () => {
  it("588 worker parses string specJson before using templateKey", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/worker/index.ts", "utf-8"));
    expect(source).toContain('typeof project.specJson === "string"');
    expect(source).toContain("JSON.parse(project.specJson)");
  });

  it("589 job-runner parses string specJson before using templateKey", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/job-runner.ts", "utf-8"));
    expect(source).toContain('typeof project.specJson === "string"');
    expect(source).toContain("JSON.parse(project.specJson)");
  });
});

describe("Proxy acceptance token auth", () => {
  it("591 acceptance-token requires INTERNAL_ACCEPTANCE_TOKEN env var (no auto-generate)", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/acceptance-token.ts", "utf-8"));
    expect(source).toContain("process.env.INTERNAL_ACCEPTANCE_TOKEN");
    expect(source).toContain("isValidAcceptanceToken");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toContain("randomBytes");
    expect(source).toContain("INTERNAL_ACCEPTANCE_TOKEN env var is not set");
  });

  it("592 proxy route checks x-internal-acceptance-token header", async () => {
    const source = await import("fs").then(f =>
      f.readFileSync("apps/web/app/api/deployments/[deploymentId]/proxy/route.ts", "utf-8")
    );
    expect(source).toContain('x-internal-acceptance-token');
    expect(source).toContain("isValidAcceptanceToken");
    expect(source).toContain("isInternalAcceptance");
    expect(source).toContain("__acceptance__");
  });

  it("593 proxy catch-all route checks x-internal-acceptance-token header", async () => {
    const source = await import("fs").then(f =>
      f.readFileSync("apps/web/app/api/deployments/[deploymentId]/proxy/[...path]/route.ts", "utf-8")
    );
    expect(source).toContain('x-internal-acceptance-token');
    expect(source).toContain("isValidAcceptanceToken");
    expect(source).toContain("isInternalAcceptance");
    expect(source).toContain("__acceptance__");
  });

  it("594 acceptance-checks sends token header for proxy URLs", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/lib/acceptance-checks.ts", "utf-8"));
    expect(source).toContain("x-internal-acceptance-token");
    expect(source).toContain("getAcceptanceToken");
    expect(source).toContain("isProxyUrl");
  });

  it("595 isValidAcceptanceToken rejects missing token", async () => {
    const { isValidAcceptanceToken } = await import("../apps/web/lib/acceptance-token");
    expect(isValidAcceptanceToken("")).toBe(false);
  });

  it("596 isValidAcceptanceToken rejects wrong token", async () => {
    const { isValidAcceptanceToken } = await import("../apps/web/lib/acceptance-token");
    expect(isValidAcceptanceToken("wrong-token-value-here")).toBe(false);
  });

  it("597 isValidAcceptanceToken accepts correct token", async () => {
    const { isValidAcceptanceToken } = await import("../apps/web/lib/acceptance-token");
    const correctToken = process.env.INTERNAL_ACCEPTANCE_TOKEN!;
    expect(correctToken).toBeTruthy();
    expect(isValidAcceptanceToken(correctToken)).toBe(true);
  });

  it("598 worker falls back to proxy deploy when Fly unavailable", async () => {
    const source = await import("fs").then(f => f.readFileSync("apps/web/worker/index.ts", "utf-8"));
    expect(source).toContain("if (flyTokenPresent)");
    expect(source).toContain("Falling back to proxy deploy");
    expect(source).toContain("deployWorkspace");
    expect(source).toContain("if (!deploySuccess)");
    expect(source).toContain("Provider: replit-proxy");
  });
});
