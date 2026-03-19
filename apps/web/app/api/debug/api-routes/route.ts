import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { execSync } from "child_process";

const EXPECTED_ROUTES = [
  "/api/health",
  "/api/billing/plan",
  "/api/billing/balance",
  "/api/billing/ledger",
  "/api/billing/add-credits",
  "/api/metrics/summary",
  "/api/ai/quota",
  "/api/ai/status",
  "/api/queue/build",
  "/api/queue/status",
  "/api/admin/stats",
  "/api/agent-mode",
  "/api/debug-routes",
  "/api/debug/api-routes",
  "/api/stripe/checkout",
  "/api/stripe/webhook",
  "/api/stripe/portal",
];

function getGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { timeout: 3000 }).toString().trim();
  } catch {
    try {
      const fs = require("fs");
      const head = fs.readFileSync(".git/HEAD", "utf8").trim();
      if (head.startsWith("ref:")) {
        const ref = head.replace("ref: ", "");
        return fs.readFileSync(`.git/${ref}`, "utf8").trim();
      }
      return head;
    } catch {
      return process.env.RAILWAY_GIT_COMMIT_SHA || "unknown";
    }
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commit = getGitCommit();

  return NextResponse.json({
    commit,
    deployedAt: process.env.RAILWAY_DEPLOYMENT_ID || "local",
    nodeEnv: process.env.NODE_ENV,
    expectedRoutes: EXPECTED_ROUTES,
    note: "If any route returns 404 on Railway, the build may not include it. Check Railway build logs.",
  });
}
