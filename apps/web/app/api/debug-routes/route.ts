import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";

export async function GET() {
  const cwd = process.cwd();
  const appDir = join(cwd, "app");

  const checks = [
    "app/api/jobs/[jobId]/logs/route.ts",
    "app/api/jobs/[jobId]/stream/route.ts",
    "app/api/jobs/[jobId]/verify/route.ts",
    "app/api/jobs/[id]/logs/route.ts",
    "app/api/jobs/[id]/stream/route.ts",
    "app/api/projects/[id]/chat/route.ts",
    "app/api/health/route.ts",
  ];

  const results: Record<string, boolean> = {};
  for (const path of checks) {
    results[path] = existsSync(join(cwd, path));
  }

  return NextResponse.json({
    ok: true,
    cwd,
    nextauthUrl: process.env.NEXTAUTH_URL || "NOT_SET",
    routes: results,
  });
}
