import { prisma } from "./prisma";
import { getMemory, cleanupExpiredMemory } from "./memory";
import { getToolDefinitions, executeTool } from "./tools";
import type { AgentInput, AgentResponse } from "./agent";
import { aiQuotaEnabled, getAiQuota, deductAiQuotaAtomic, refundAiQuotaTokens, AiQuotaExhaustedError } from "./ai-quota";

export function isKillSwitchEnabled(): boolean {
  return process.env.OPENAI_KILL_SWITCH === "1";
}

function getMaxTokensPerRequest(): number {
  return parseInt(process.env.OPENAI_MAX_TOKENS_PER_REQUEST || "800", 10);
}

function getMaxRequestsPerDayPerUser(): number {
  return parseInt(process.env.OPENAI_MAX_REQUESTS_PER_DAY_PER_USER || "50", 10);
}

function getMaxTokensPerDayPerUser(): number {
  return parseInt(process.env.OPENAI_MAX_TOKENS_PER_DAY_PER_USER || "20000", 10);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function checkDailyUsage(userId: string): Promise<{ allowed: boolean; requests: number; tokens: number }> {
  const date = todayDateString();
  const usage = await prisma.openAiUsage.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!usage) return { allowed: true, requests: 0, tokens: 0 };

  const maxReqs = getMaxRequestsPerDayPerUser();
  const maxTokens = getMaxTokensPerDayPerUser();

  if (usage.requests >= maxReqs || usage.tokens >= maxTokens) {
    return { allowed: false, requests: usage.requests, tokens: usage.tokens };
  }
  return { allowed: true, requests: usage.requests, tokens: usage.tokens };
}

export async function checkAiAvailability(userId: string): Promise<{
  available: boolean;
  reason?: "kill_switch" | "daily_limit" | "no_key" | "not_llm_mode" | "ai_quota_exhausted";
}> {
  if (isKillSwitchEnabled()) {
    return { available: false, reason: "kill_switch" };
  }
  if (!hasOpenAiKey()) {
    return { available: false, reason: "no_key" };
  }
  if (aiQuotaEnabled()) {
    const quota = await getAiQuota(userId);
    if (quota.remainingRequests <= 0 || quota.remainingTokens <= 0) {
      return { available: false, reason: "ai_quota_exhausted" };
    }
  }
  const usage = await checkDailyUsage(userId);
  if (!usage.allowed) {
    return { available: false, reason: "daily_limit" };
  }
  return { available: true };
}

async function incrementUsage(userId: string, tokensUsed: number): Promise<void> {
  const date = todayDateString();
  await prisma.openAiUsage.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, requests: 1, tokens: tokensUsed },
    update: { requests: { increment: 1 }, tokens: { increment: tokensUsed } },
  });
}

function getSystemPrompt(mode: string, memory: Record<string, string>): string {
  const memoryContext = Object.keys(memory).length > 0
    ? `\n\nUSER MEMORY (preferences from past conversations):\n${Object.entries(memory).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
    : "";

  return `You are an AI app builder assistant. You help non-technical users build web applications.

You follow a strict 3-step conversation flow:

STEP 1 - CLARIFY: Ask smart clarifying questions to understand the user's needs. Ask about:
- What the app should do (purpose)
- Key features they need
- Who will use it
- Any design or technology preferences
Ask 2-4 questions. Be conversational and friendly. If the user is non-technical or impatient, propose best-practice defaults.

STEP 2 - PLAN: Once you have enough information, use the save_project_spec tool to save the plan, then present it clearly:
- Architecture overview
- Tech stack (Next.js + Prisma + Tailwind by default)
- Key features to build
- Milestones
End with: "Ready to build? Just confirm and I'll get started!"

STEP 3 - BUILD CONFIRMATION: When the user confirms they want to build (says "yes", "build it", "go ahead", etc.):
- Use the create_build_job tool with confirmBuild=true
- Then respond with confirmation that the build will start
- Do NOT claim any files have been created — the build system handles that separately.

TOOL USAGE:
- Use save_project_spec when you have gathered enough info to create a plan (typically after 2-3 exchanges)
- Use set_memory when the user expresses a stable preference (theme, stack, auth method, etc.)
- Use create_build_job ONLY when the user explicitly confirms they want to build. NEVER auto-build.

RULES:
- Never lie or make false claims about what has been built.
- If you don't understand something, ask for clarification.
- Never auto-build without explicit user confirmation.
- Keep responses concise and helpful.
- You are currently in the "${mode}" conversation mode.
${memoryContext}`;
}

function hasOpenAiKey(): boolean {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface OpenAiChoice {
  message: {
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface OpenAiResult {
  choice: OpenAiChoice;
  tokensUsed: number;
}

async function callOpenAi(
  messages: OpenAiMessage[],
  useTools: boolean = false
): Promise<OpenAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxTokens = getMaxTokensPerRequest();

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  if (useTools) {
    body.tools = getToolDefinitions();
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const tokensUsed = data.usage?.total_tokens || 0;
  return { choice: data.choices?.[0], tokensUsed };
}

export async function processLlmMessage(input: AgentInput): Promise<AgentResponse> {
  if (isKillSwitchEnabled()) {
    return {
      response: "LLM temporarily disabled.",
      shouldCreateJob: false,
    };
  }

  if (!hasOpenAiKey()) {
    return {
      response: "LLM mode is enabled but `OPENAI_API_KEY` is not set. Please add it to your environment variables.",
      shouldCreateJob: false,
    };
  }

  const { mode, message, projectId, userId, chatMessages } = input;

  if (mode === "Build") {
    const memory = await getMemory({ userId, projectId });
    return handleBuildMode(input, memory);
  }

  const dailyUsage = await checkDailyUsage(userId);
  if (!dailyUsage.allowed) {
    return {
      response: "You've reached your daily AI usage limit. Please try again tomorrow, or switch to a different mode.",
      shouldCreateJob: false,
    };
  }

  cleanupExpiredMemory().catch(() => {});

  const memory = await getMemory({ userId, projectId });

  const openAiMessages: OpenAiMessage[] = [
    { role: "system", content: getSystemPrompt(mode, memory) },
  ];

  const recentForContext = chatMessages.slice(-15);
  for (const msg of recentForContext) {
    openAiMessages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  if (!recentForContext.some((m) => m.content === message && m.role === "user")) {
    openAiMessages.push({ role: "user", content: message });
  }

  let maxTokensReserve = getMaxTokensPerRequest() * 6;
  if (aiQuotaEnabled()) {
    const currentQuota = await getAiQuota(userId);
    if (currentQuota.remainingRequests <= 0 || currentQuota.remainingTokens <= 0) {
      return {
        response: "Your AI quota has been exhausted. Please add more AI quota from the Billing page to continue using AI features. Your build credits remain available.",
        shouldCreateJob: false,
      };
    }
    maxTokensReserve = Math.min(maxTokensReserve, currentQuota.remainingTokens);
    try {
      await deductAiQuotaAtomic(userId, 1, maxTokensReserve);
    } catch (e) {
      if (e instanceof AiQuotaExhaustedError) {
        return {
          response: "Your AI quota has been exhausted. Please add more AI quota from the Billing page to continue using AI features. Your build credits remain available.",
          shouldCreateJob: false,
        };
      }
      throw e;
    }
  }

  try {
    const useTools = mode === "Plan" || mode === "Discuss";
    let result = await callOpenAi(openAiMessages, useTools);
    let totalTokens = result.tokensUsed;
    let choice = result.choice;

    let specUpdate: Record<string, unknown> | undefined;
    const toolContext = { userId, projectId };

    let iterations = 0;
    while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && iterations < 5) {
      iterations++;

      openAiMessages.push({
        role: "assistant",
        content: choice.message.content || "",
        tool_calls: choice.message.tool_calls,
      });

      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        const toolResult = await executeTool(tc.function.name, args, toolContext);

        if (tc.function.name === "save_project_spec" && toolResult.success) {
          specUpdate = toolResult.data as Record<string, unknown>;
        }

        openAiMessages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          tool_call_id: tc.id,
        });
      }

      result = await callOpenAi(openAiMessages, useTools);
      totalTokens += result.tokensUsed;
      choice = result.choice;
    }

    await incrementUsage(userId, totalTokens);
    const unusedTokens = Math.max(0, maxTokensReserve - totalTokens);
    refundAiQuotaTokens(userId, unusedTokens).catch(() => {});

    const responseText = choice.message.content || "I've processed your request. What would you like to do next?";

    const showConfirmButton = mode === "Plan" && specUpdate != null;

    return {
      response: responseText,
      shouldCreateJob: false,
      specUpdate,
      showConfirmButton,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      response: `I encountered an error communicating with the AI service: ${errMsg}\n\nPlease try again.`,
      shouldCreateJob: false,
    };
  }
}

async function handleBuildMode(input: AgentInput, memory: Record<string, string>): Promise<AgentResponse> {
  const { message, rawMessage, projectId, userId, chatMessages } = input;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const hasSpec = !!project?.specJson;

  const lower = rawMessage.toLowerCase();
  const confirmPhrases = [
    "build it", "yes build", "start building", "go ahead", "let's build",
    "yes", "confirm", "do it", "start", "build", "yes please", "go",
    "let's go", "build now", "yes build it", "confirmed",
  ];
  const isConfirmation = confirmPhrases.some((phrase) => lower === phrase);

  if (isConfirmation) {
    if (!hasSpec) {
      return {
        response: "I'd love to build for you, but we don't have a plan yet. Switch to **Plan** mode first and let's figure out what to build together!",
        shouldCreateJob: false,
      };
    }
    return {
      response: "**Build started!** Switch to the **Console** tab to watch the build progress.\n\nI'll generate your project files and run the build pipeline. Each step is logged in real-time.",
      shouldCreateJob: true,
    };
  }

  if (hasSpec) {
    const openAiMessages: OpenAiMessage[] = [
      { role: "system", content: getSystemPrompt("Build", memory) },
    ];
    const recent = chatMessages.slice(-10);
    for (const msg of recent) {
      openAiMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
    if (!recent.some((m) => m.content === message && m.role === "user")) {
      openAiMessages.push({ role: "user", content: message });
    }

    let buildMaxReserve = getMaxTokensPerRequest();
    if (aiQuotaEnabled()) {
      const currentQuota = await getAiQuota(userId);
      if (currentQuota.remainingRequests <= 0 || currentQuota.remainingTokens <= 0) {
        return {
          response: "Your AI quota has been exhausted. Please add more AI quota from the Billing page.",
          shouldCreateJob: false,
        };
      }
      buildMaxReserve = Math.min(buildMaxReserve, currentQuota.remainingTokens);
      try {
        await deductAiQuotaAtomic(userId, 1, buildMaxReserve);
      } catch (e) {
        if (e instanceof AiQuotaExhaustedError) {
          return {
            response: "Your AI quota has been exhausted. Please add more AI quota from the Billing page.",
            shouldCreateJob: false,
          };
        }
        throw e;
      }
    }

    try {
      const result = await callOpenAi(openAiMessages, false);
      await incrementUsage(userId, result.tokensUsed);
      const buildRefund = Math.max(0, buildMaxReserve - result.tokensUsed);
      refundAiQuotaTokens(userId, buildRefund).catch(() => {});
      const text = result.choice.message.content || "Your project plan is ready! When you're ready to build, click **Confirm Build** or say **\"Build it\"**.";
      return { response: text, shouldCreateJob: false, showConfirmButton: true };
    } catch {
      return {
        response: "Your project plan is ready! When you're ready to build, click **Confirm Build** or say **\"Build it\"**.",
        shouldCreateJob: false,
        showConfirmButton: true,
      };
    }
  }

  return {
    response: "Let's create a plan first before building. Switch to **Plan** mode and describe what you'd like to build!",
    shouldCreateJob: false,
  };
}
