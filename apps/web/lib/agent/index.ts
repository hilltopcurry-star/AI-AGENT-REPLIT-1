import { processMessage as mockProcessMessage, createBuildJob as createMockBuildJob } from "@/lib/mock-agent";
import { processLlmMessage, checkAiAvailability } from "@/lib/llm-agent";
import { processBasicMessage } from "@/lib/basic-agent";
import { runJob, getBuildRunnerMode } from "@/lib/job-runner";
import { prisma } from "@/lib/prisma";
import { opportunisticCleanup } from "@/lib/cleanup";
import type { AgentMode } from "@/lib/mock-agent";

export type { AgentMode } from "@/lib/mock-agent";

export interface AgentInput {
  userId: string;
  projectId: string;
  mode: AgentMode;
  message: string;
  rawMessage: string;
  chatMessages: { role: string; content: string; mode: string }[];
  forceBasicMode?: boolean;
}

export interface AgentResponse {
  response: string;
  shouldCreateJob: boolean;
  specUpdate?: Record<string, unknown>;
  showConfirmButton?: boolean;
  aiLimited?: boolean;
}

export function getAgentMode(): "mock" | "llm" {
  const env = process.env.AI_AGENT_MODE?.toLowerCase();
  if (env === "llm") return "llm";
  return "mock";
}

const quotaNoticeTimestamps = new Map<string, number>();
const QUOTA_NOTICE_COOLDOWN_MS = 60_000;

function shouldShowQuotaNotice(userId: string): boolean {
  const now = Date.now();
  const last = quotaNoticeTimestamps.get(userId) ?? 0;
  if (now - last < QUOTA_NOTICE_COOLDOWN_MS) return false;
  quotaNoticeTimestamps.set(userId, now);
  return true;
}

export async function createBuildJob(projectId: string, userId?: string): Promise<string> {
  opportunisticCleanup().catch(() => {});
  const runnerMode = getBuildRunnerMode();

  if (runnerMode === "real") {
    const job = await prisma.job.create({
      data: { projectId, status: "RUNNING" },
    });

    void runJob(job.id, projectId, userId);

    return job.id;
  }

  return createMockBuildJob(projectId);
}

export async function processUserMessage(input: AgentInput): Promise<AgentResponse> {
  const agentMode = getAgentMode();

  if (input.forceBasicMode) {
    return runBasicAgent(input);
  }

  if (agentMode === "llm") {
    const availability = await checkAiAvailability(input.userId);

    if (!availability.available) {
      const showNotice = shouldShowQuotaNotice(input.userId);
      const basicResult = await runBasicAgent(input);

      if (showNotice) {
        const reason =
          availability.reason === "kill_switch"
            ? "AI is temporarily paused"
            : availability.reason === "daily_limit"
            ? "AI quota reached for today"
            : availability.reason === "ai_quota_exhausted"
            ? "AI quota finished. You can continue in Basic Mode or buy AI quota from Billing"
            : "AI unavailable";

        basicResult.response =
          `**${reason}. Switching to Basic Mode.** Your credits are still available for building.\n\n---\n\n` +
          basicResult.response;
      }

      basicResult.aiLimited = true;
      return basicResult;
    }

    return processLlmMessage(input);
  }

  return runMockAgent(input);
}

async function runBasicAgent(input: AgentInput): Promise<AgentResponse> {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  const contentForBasic = input.mode === "Build" ? input.rawMessage : input.message;

  return processBasicMessage({
    message: contentForBasic,
    mode: input.mode,
    projectSpec: project?.specJson as Record<string, unknown> | null,
  });
}

async function runMockAgent(input: AgentInput): Promise<AgentResponse> {
  const contentForMock = input.mode === "Build" ? input.rawMessage : input.message;

  return mockProcessMessage({
    mode: input.mode,
    content: contentForMock,
    projectId: input.projectId,
    chatMessages: input.chatMessages,
  });
}
