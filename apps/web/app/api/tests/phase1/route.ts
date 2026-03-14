import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processMessage } from "@/lib/mock-agent";
import * as fs from "fs";
import * as path from "path";

interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}

function findFile(relativePath: string): boolean {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), "apps/web", relativePath),
    path.resolve("/home/runner/workspace/apps/web", relativePath),
  ];
  return candidates.some((c) => fs.existsSync(c));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];

  const requiredPaths = [
    "app/api/health/route.ts",
    "app/api/projects/[id]/chat/route.ts",
    "app/api/jobs/[jobId]/logs/route.ts",
    "app/api/jobs/[jobId]/stream/route.ts",
    "components/workspace/ChatPanel.tsx",
    "components/workspace/ConsolePanel.tsx",
    "components/workspace/DatabasePanel.tsx",
    "lib/mock-agent.ts",
    "lib/prisma.ts",
  ];

  for (const p of requiredPaths) {
    const exists = findFile(p);
    results.push({
      name: `path_exists: ${p}`,
      pass: exists,
      detail: exists ? "found" : "missing",
    });
  }

  try {
    const userCount = await prisma.user.count();
    results.push({ name: "prisma_user_model", pass: true, detail: `${userCount} rows` });
  } catch (e) {
    results.push({ name: "prisma_user_model", pass: false, detail: String(e) });
  }

  try {
    const projectCount = await prisma.project.count();
    results.push({ name: "prisma_project_model", pass: true, detail: `${projectCount} rows` });
  } catch (e) {
    results.push({ name: "prisma_project_model", pass: false, detail: String(e) });
  }

  try {
    const jobCount = await prisma.job.count();
    results.push({ name: "prisma_job_model", pass: true, detail: `${jobCount} rows` });
  } catch (e) {
    results.push({ name: "prisma_job_model", pass: false, detail: String(e) });
  }

  try {
    const logCount = await prisma.jobLog.count();
    results.push({ name: "prisma_joblog_model", pass: true, detail: `${logCount} rows` });
  } catch (e) {
    results.push({ name: "prisma_joblog_model", pass: false, detail: String(e) });
  }

  try {
    const msgs: { role: string; content: string; mode: string }[] = [];
    const r1 = await processMessage({ mode: "Plan", content: "start", projectId: "test", chatMessages: [{ role: "user", content: "start", mode: "Plan" }] });
    const hasQ1 = r1.response.includes("Question 1 of 3");

    msgs.push({ role: "user", content: "start", mode: "Plan" });
    msgs.push({ role: "user", content: "e-commerce", mode: "Plan" });
    const r2 = await processMessage({ mode: "Plan", content: "e-commerce", projectId: "test", chatMessages: msgs });
    const hasQ2 = r2.response.includes("Question 2 of 3");

    msgs.push({ role: "user", content: "search, cart, checkout", mode: "Plan" });
    const r3 = await processMessage({ mode: "Plan", content: "search, cart, checkout", projectId: "test", chatMessages: msgs });
    const hasQ3 = r3.response.includes("Question 3 of 3");

    msgs.push({ role: "user", content: "PostgreSQL", mode: "Plan" });
    const r4 = await processMessage({ mode: "Plan", content: "PostgreSQL", projectId: "test", chatMessages: msgs });
    const hasPlan = r4.response.includes("Project Plan") && r4.specUpdate !== undefined;

    const allPass = hasQ1 && hasQ2 && hasQ3 && hasPlan;
    results.push({
      name: "mock_agent_3_questions_then_plan",
      pass: allPass,
      detail: `Q1=${hasQ1} Q2=${hasQ2} Q3=${hasQ3} plan=${hasPlan}`,
    });
  } catch (e) {
    results.push({ name: "mock_agent_3_questions_then_plan", pass: false, detail: String(e) });
  }

  try {
    const exact = await processMessage({ mode: "Build", content: "Build it", projectId: "test", chatMessages: [] });
    results.push({
      name: "build_gate_exact_triggers",
      pass: exact.shouldCreateJob === true,
      detail: `shouldCreateJob=${exact.shouldCreateJob}`,
    });
  } catch (e) {
    results.push({ name: "build_gate_exact_triggers", pass: false, detail: String(e) });
  }

  try {
    const trailing = await processMessage({ mode: "Build", content: "Build it ", projectId: "test", chatMessages: [] });
    results.push({
      name: "build_gate_trailing_space_rejected",
      pass: trailing.shouldCreateJob === false,
      detail: `shouldCreateJob=${trailing.shouldCreateJob} (should be false)`,
    });
  } catch (e) {
    results.push({ name: "build_gate_trailing_space_rejected", pass: false, detail: String(e) });
  }

  try {
    const nearMiss = await processMessage({ mode: "Build", content: "build", projectId: "test", chatMessages: [] });
    results.push({
      name: "build_gate_near_miss_rejected",
      pass: nearMiss.shouldCreateJob === false && nearMiss.response.includes("Build it"),
      detail: `shouldCreateJob=${nearMiss.shouldCreateJob}, guides user=${nearMiss.response.includes("Build it")}`,
    });
  } catch (e) {
    results.push({ name: "build_gate_near_miss_rejected", pass: false, detail: String(e) });
  }

  try {
    const random = await processMessage({ mode: "Build", content: "hello world", projectId: "test", chatMessages: [] });
    results.push({
      name: "build_gate_random_rejected",
      pass: random.shouldCreateJob === false,
      detail: `shouldCreateJob=${random.shouldCreateJob}`,
    });
  } catch (e) {
    results.push({ name: "build_gate_random_rejected", pass: false, detail: String(e) });
  }

  const logsRouteExists = findFile("app/api/jobs/[jobId]/logs/route.ts");
  const streamRouteExists = findFile("app/api/jobs/[jobId]/stream/route.ts");
  results.push({
    name: "sse_endpoints_exist",
    pass: logsRouteExists && streamRouteExists,
    detail: `logs=${logsRouteExists} stream=${streamRouteExists}`,
  });

  const allPassed = results.every((r) => r.pass);

  return NextResponse.json({ ok: allPassed, results }, { status: allPassed ? 200 : 200 });
}
