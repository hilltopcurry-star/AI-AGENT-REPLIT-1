import { NextResponse } from "next/server";
import { getAgentMode } from "@/lib/agent";
import { getBuildRunnerMode } from "@/lib/job-runner";

export async function GET() {
  return NextResponse.json({
    mode: getAgentMode(),
    hasOpenAiKey: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0),
    buildRunnerMode: getBuildRunnerMode(),
  });
}
