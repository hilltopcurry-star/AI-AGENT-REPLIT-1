import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flyToken = process.env.FLY_API_TOKEN || "";
  const flyTokenPresent = flyToken.length > 0;

  return NextResponse.json({
    flyTokenPresent,
    ...(flyTokenPresent && flyToken.length >= 6
      ? { flyTokenPrefix: flyToken.slice(0, 6) }
      : {}),
    flyEnabled: flyTokenPresent,
    workerMode: {
      BUILD_RUNNER_MODE: process.env.BUILD_RUNNER_MODE || "mock",
      AI_AGENT_MODE: process.env.AI_AGENT_MODE || "mock",
    },
    deployStrategy: flyTokenPresent ? "fly-first" : "proxy-only",
  });
}
