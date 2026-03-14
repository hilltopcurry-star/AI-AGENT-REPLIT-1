import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkAiAvailability } from "@/lib/llm-agent";
import { getAgentMode } from "@/lib/agent";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentMode = getAgentMode();

  if (agentMode !== "llm") {
    return NextResponse.json({
      mode: "basic",
      available: true,
      limited: false,
      llmEnabled: false,
    });
  }

  const availability = await checkAiAvailability(session.user.id);

  return NextResponse.json({
    mode: availability.available ? "ai" : "basic",
    available: availability.available,
    limited: !availability.available,
    llmEnabled: true,
    reason: availability.reason || null,
  });
}
