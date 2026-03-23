import { prisma } from "./prisma";
import * as https from "https";
import * as http from "http";

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AcceptanceResult {
  passed: boolean;
  checks: CheckResult[];
  attempts: number;
}

async function logJob(jobId: string, level: string, message: string) {
  try {
    await prisma.jobLog.create({ data: { jobId, level, message } });
  } catch {}
}

function httpGet(url: string, timeoutMs = 10000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function httpPost(
  url: string,
  data: Record<string, unknown>,
  timeoutMs = 10000
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const payload = JSON.stringify(data);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    };
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(payload);
    req.end();
  });
}

async function checkHealth(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/health`);
    const parsed = JSON.parse(body);
    if (status === 200 && parsed.ok === true) {
      return { name: "health", passed: true, detail: "GET /api/health returned {ok:true}" };
    }
    return { name: "health", passed: false, detail: `status=${status} body=${body.slice(0, 200)}` };
  } catch (e: any) {
    return { name: "health", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkDbConnection(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/db-check`);
    const parsed = JSON.parse(body);
    if (status === 200 && parsed.ok === true) {
      return { name: "db-check", passed: true, detail: "GET /api/db-check returned {ok:true}" };
    }
    return { name: "db-check", passed: false, detail: `status=${status} body=${body.slice(0, 200)}` };
  } catch (e: any) {
    return { name: "db-check", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkPageLoads(baseUrl: string): Promise<CheckResult> {
  try {
    const { status } = await httpGet(baseUrl);
    if (status === 200) {
      return { name: "homepage", passed: true, detail: "Homepage loads (200)" };
    }
    return { name: "homepage", passed: false, detail: `status=${status}` };
  } catch (e: any) {
    return { name: "homepage", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkProjectsPage(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/projects`);
    if (status === 200) {
      const hasProjectContent = body.toLowerCase().includes("project");
      return {
        name: "projects-page",
        passed: true,
        detail: `GET /projects returned 200 (has project content: ${hasProjectContent})`,
      };
    }
    return { name: "projects-page", passed: false, detail: `status=${status}` };
  } catch (e: any) {
    return { name: "projects-page", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkProjectTaskCreation(baseUrl: string): Promise<CheckResult> {
  try {
    const projRes = await httpPost(`${baseUrl}/api/projects`, {
      name: "Smoke Test Project",
      description: "Automated acceptance check",
    });
    if (projRes.status !== 201 && projRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `POST /api/projects failed: status=${projRes.status} body=${projRes.body.slice(0, 200)}`,
      };
    }

    let projectId: string;
    try {
      const parsed = JSON.parse(projRes.body);
      projectId = parsed.id;
    } catch {
      return { name: "crud", passed: false, detail: "Could not parse project response" };
    }

    const taskRes = await httpPost(`${baseUrl}/api/projects/${projectId}/tasks`, {
      title: "Smoke Test Task",
      priority: "high",
    });
    if (taskRes.status !== 201 && taskRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `POST /api/projects/${projectId}/tasks failed: status=${taskRes.status}`,
      };
    }

    return { name: "crud", passed: true, detail: "Created project + task via API" };
  } catch (e: any) {
    return { name: "crud", passed: false, detail: `error: ${e.message}` };
  }
}

export async function runAcceptanceChecks(
  baseUrl: string,
  jobId: string,
  hasTemplate: boolean,
  templateKey?: string
): Promise<CheckResult[]> {
  await logJob(jobId, "INFO", `[ACCEPTANCE] templateKey=${templateKey || "none"} hasTemplate=${hasTemplate}`);
  await logJob(jobId, "INFO", `[ACCEPTANCE] Running checks against ${baseUrl}`);

  const checks: CheckResult[] = [];

  const healthResult = await checkHealth(baseUrl);
  checks.push(healthResult);
  await logJob(jobId, healthResult.passed ? "SUCCESS" : "ERROR", `[ACCEPTANCE] ${healthResult.name}: ${healthResult.detail}`);

  const pageResult = await checkPageLoads(baseUrl);
  checks.push(pageResult);
  await logJob(jobId, pageResult.passed ? "SUCCESS" : "ERROR", `[ACCEPTANCE] ${pageResult.name}: ${pageResult.detail}`);

  if (hasTemplate) {
    const projectsPageResult = await checkProjectsPage(baseUrl);
    checks.push(projectsPageResult);
    const lvl = projectsPageResult.passed ? "SUCCESS" : "ERROR";
    await logJob(jobId, lvl, `[ACCEPTANCE] ${projectsPageResult.name}: ${projectsPageResult.detail}`);
    if (projectsPageResult.passed) {
      await logJob(jobId, "SUCCESS", "[ACCEPTANCE] projects page OK");
    }

    const dbResult = await checkDbConnection(baseUrl);
    checks.push(dbResult);
    await logJob(jobId, dbResult.passed ? "SUCCESS" : "ERROR", `[ACCEPTANCE] ${dbResult.name}: ${dbResult.detail}`);
    if (dbResult.passed) {
      await logJob(jobId, "SUCCESS", "[ACCEPTANCE] db-check OK");
    }

    const crudResult = await checkProjectTaskCreation(baseUrl);
    checks.push(crudResult);
    await logJob(jobId, crudResult.passed ? "SUCCESS" : "ERROR", `[ACCEPTANCE] ${crudResult.name}: ${crudResult.detail}`);
    if (crudResult.passed) {
      await logJob(jobId, "SUCCESS", "[ACCEPTANCE] crud OK");
    }

    const templateChecksPassed = projectsPageResult.passed && dbResult.passed && crudResult.passed;
    if (!templateChecksPassed) {
      const failed = [projectsPageResult, dbResult, crudResult].filter(c => !c.passed).map(c => c.name).join(", ");
      await logJob(jobId, "ERROR", `[ACCEPTANCE] Template checks FAILED (${failed}). This is NOT the correct template app.`);
    }
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  await logJob(jobId, "INFO", `[ACCEPTANCE] Result: ${passedCount}/${totalCount} checks passed`);

  return checks;
}

export async function runAcceptanceWithRetry(
  baseUrl: string,
  jobId: string,
  hasTemplate: boolean,
  maxAttempts = 3,
  templateKey?: string
): Promise<AcceptanceResult> {
  let lastChecks: CheckResult[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await logJob(jobId, "INFO", `[ACCEPTANCE] Attempt ${attempt}/${maxAttempts}`);

    if (attempt > 1) {
      const waitSec = attempt === 2 ? 15 : 30;
      await logJob(jobId, "INFO", `[ACCEPTANCE] Waiting ${waitSec}s before retry...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }

    lastChecks = await runAcceptanceChecks(baseUrl, jobId, hasTemplate, templateKey);
    const allPassed = lastChecks.every((c) => c.passed);

    if (allPassed) {
      await logJob(jobId, "SUCCESS", `[ACCEPTANCE] All checks passed on attempt ${attempt}`);
      return { passed: true, checks: lastChecks, attempts: attempt };
    }

    const failedNames = lastChecks.filter((c) => !c.passed).map((c) => c.name).join(", ");
    await logJob(jobId, "WARN", `[ACCEPTANCE] Failed checks: ${failedNames}`);
  }

  await logJob(jobId, "ERROR", `[ACCEPTANCE] All ${maxAttempts} attempts exhausted. Deployment NOT verified.`);
  return { passed: false, checks: lastChecks, attempts: maxAttempts };
}

export function formatAcceptanceReport(result: AcceptanceResult): string {
  const lines: string[] = [];
  lines.push(`\n=== Acceptance Check Report (${result.attempts} attempt${result.attempts > 1 ? "s" : ""}) ===`);
  for (const c of result.checks) {
    const icon = c.passed ? "PASS" : "FAIL";
    lines.push(`  [${icon}] ${c.name}: ${c.detail}`);
  }
  lines.push(`  Result: ${result.passed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  lines.push("===");
  return lines.join("\n");
}
