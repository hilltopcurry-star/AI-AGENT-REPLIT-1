import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

export const prisma = new PrismaClient();

export const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const COOKIE_NAME = "__Secure-authjs.session-token";

const testIds: string[] = [];

export function trackId(id: string) {
  testIds.push(id);
}

export async function createTestUser(email?: string): Promise<{ id: string; email: string }> {
  const e = email || `test-${randomUUID().slice(0, 8)}@test.local`;
  const user = await prisma.user.create({
    data: { email: e, name: "Test User" },
  });
  trackId(user.id);
  return { id: user.id, email: e };
}

export async function createTestSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken: token, userId, expires },
  });
  return token;
}

export function cookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}`;
}

export async function createTestProject(userId: string, spec?: Record<string, unknown>): Promise<string> {
  const project = await prisma.project.create({
    data: {
      userId,
      name: `Test Project ${Date.now()}`,
      specJson: spec || null,
    },
  });
  return project.id;
}

export async function createTestChat(projectId: string): Promise<string> {
  const chat = await prisma.chat.create({
    data: { projectId },
  });
  return chat.id;
}

export async function apiGet(path: string, cookie?: string): Promise<{ status: number; body: unknown; text: string }> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

export async function apiPost(
  path: string,
  data: unknown,
  cookie?: string
): Promise<{ status: number; body: unknown; text: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

export async function apiPostSSE(
  path: string,
  data: unknown,
  cookie: string
): Promise<{ status: number; events: Array<{ type: string; data: Record<string, unknown> }> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  const events: Array<{ type: string; data: Record<string, unknown> }> = [];

  if (!res.ok) {
    return { status: res.status, events };
  }

  const text = await res.text();
  const chunks = text.split("\n\n");
  for (const chunk of chunks) {
    if (!chunk.startsWith("data: ")) continue;
    const raw = chunk.slice(6);
    if (raw === "[DONE]") continue;
    try {
      const parsed = JSON.parse(raw);
      events.push({ type: parsed.type, data: parsed });
    } catch {}
  }

  return { status: res.status, events };
}

export async function createCompletedJob(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const shortId = projectId.slice(0, 8);
  const job = await prisma.job.create({
    data: { projectId, status: "COMPLETED" },
  });

  const workspacePath = `/tmp/workspaces/${job.id}`;
  await prisma.buildArtifact.create({
    data: { jobId: job.id, workspacePath },
  });

  const deployment = await prisma.deployment.create({
    data: {
      userId: project.userId,
      projectId,
      jobId: job.id,
      provider: "replit",
      status: "SUCCESS",
      internalPort: 7100,
      workspacePath,
    },
  });
  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { url: `/api/deployments/${deployment.id}/proxy` },
  });
  const mockDeployId = deployment.id;

  const logs = [
    { level: "INFO", message: `[RUNNER] Build started for project ${shortId}` },
    { level: "INFO", message: `[RUNNER] Project purpose: test` },
    { level: "INFO", message: "[RUNNER] Step 1/6: Validating environment variables" },
    { level: "SUCCESS", message: "[RUNNER] Step 1/6: Environment validation passed" },
    { level: "INFO", message: "[RUNNER] Step 2/6: Running `npm install` to resolve dependencies" },
    { level: "INFO", message: "[RUNNER] Step 2/6: Reading package.json for dependency resolution" },
    { level: "SUCCESS", message: "[RUNNER] Step 2/6: Dependency installation complete" },
    { level: "INFO", message: "[RUNNER] Step 3/6: Generating Prisma schema from specJson" },
    { level: "SUCCESS", message: "[RUNNER] Step 3/6: Database schema generation complete" },
    { level: "INFO", message: "[RUNNER] Step 4/6: Scaffold Next.js App Router pages and API route handlers" },
    { level: "SUCCESS", message: "[RUNNER] Step 4/6: Code scaffolding complete" },
    { level: "INFO", message: "[RUNNER] Step 5/6: Running `npm build` / `next build`" },
    { level: "SUCCESS", message: "[RUNNER] Step 5/6: Build compilation complete" },
    { level: "INFO", message: `[DEPLOY] Starting Deployment for project ${shortId}` },
    { level: "INFO", message: `[DEPLOY] Assigning port 3100 for deployed application` },
    { level: "INFO", message: `[DEPLOY] Running health check on deployed instance` },
    { level: "SUCCESS", message: `[DEPLOY] Deployment complete — deploymentId: ${mockDeployId}` },
    { level: "SUCCESS", message: `[DEPLOY] Live URL: /api/deployments/${mockDeployId}/proxy` },
    { level: "SUCCESS", message: `[RUNNER] Build complete for project ${shortId}` },
  ];
  for (const l of logs) {
    await prisma.jobLog.create({ data: { jobId: job.id, level: l.level, message: l.message } });
  }
  return job.id;
}

export async function cleanupTestData() {
  for (const id of testIds) {
    try {
      await prisma.user.delete({ where: { id } });
    } catch {}
  }
  testIds.length = 0;
}
