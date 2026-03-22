import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
  "/api/debug/fly",
  "/api/stripe/checkout",
  "/api/stripe/webhook",
  "/api/stripe/portal",
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT ?? "unknown";

  return NextResponse.json({
    commit,
    deployedAt: process.env.RAILWAY_DEPLOYMENT_ID || "local",
    nodeEnv: process.env.NODE_ENV,
    expectedRoutes: EXPECTED_ROUTES,
    note: "If any route returns 404 on Railway, the build may not include it. Check Railway build logs.",
  });
}
