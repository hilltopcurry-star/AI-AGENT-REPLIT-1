import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processUserMessage, createBuildJob } from "@/lib/agent";
import type { AgentMode } from "@/lib/agent";
import { rateLimit, getEnvLimit } from "@/lib/rate-limit";
import { requireAndDeductCredits, getCostBuild, InsufficientCreditsError } from "@/lib/credits";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const chat = await prisma.chat.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!chat || chat.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { chatId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const chat = await prisma.chat.findUnique({
    where: { id },
    include: {
      project: { select: { userId: true, id: true, specJson: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!chat || chat.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = await rateLimit({
    userId: session.user.id,
    key: "chat_post",
    windowSec: 60,
    limit: getEnvLimit("CHAT_POST_LIMIT_PER_MIN", 30),
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", key: "chat_post", resetAt: rl.resetAt.toISOString(), limit: rl.limit },
      { status: 429 }
    );
  }

  let body: { content?: string; mode?: string; forceBasicMode?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { content, mode = "Discuss", forceBasicMode = false } = body as {
    content: string;
    mode?: AgentMode;
    forceBasicMode?: boolean;
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const rawContent = content;
  const trimmedContent = content.trim();

  const userMessage = await prisma.message.create({
    data: { chatId: id, role: "user", content: trimmedContent, mode },
  });

  const recentMessages = [...chat.messages].reverse();
  const chatMessages = [
    ...recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
      mode: m.mode,
    })),
    { role: "user", content: trimmedContent, mode },
  ];

  const result = await processUserMessage({
    userId: session.user.id,
    projectId: chat.project.id,
    mode: mode as AgentMode,
    message: trimmedContent,
    rawMessage: rawContent,
    chatMessages,
    forceBasicMode: !!forceBasicMode,
  });

  if (result.specUpdate) {
    await prisma.project.update({
      where: { id: chat.project.id },
      data: { specJson: result.specUpdate as unknown as Record<string, string> },
    });
  }

  let jobId: string | null = null;
  if (result.shouldCreateJob) {
    try {
      await requireAndDeductCredits(session.user.id, getCostBuild(), "build", undefined, chat.project.id);
      jobId = await createBuildJob(chat.project.id, session.user.id);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        result.shouldCreateJob = false;
        result.showConfirmButton = false;
        if (err.reserved) {
          result.response = `**Credits reserved.** You have ${err.balance} credits remaining, but these are held as a reserve. Add more credits to build and deploy.\n\nYour project is saved and ready.\n\n[Go to Billing](/billing) to add credits.`;
        } else {
          result.response = `**Insufficient credits.** You need ${err.required} credits to build, but you only have ${err.balance}.\n\nYour project is saved and ready to build once you add credits.\n\n[Go to Billing](/billing) to add credits.`;
        }
      } else {
        throw err;
      }
    }
  }

  const assistantMessage = await prisma.message.create({
    data: { chatId: id, role: "assistant", content: result.response, mode },
  });

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`
        )
      );

      const words = result.response.split(" ");
      let i = 0;

      function sendWord() {
        if (cancelled) return;
        if (i < words.length) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "token", content: words[i] + " " })}\n\n`
            )
          );
          i++;
          setTimeout(sendWord, 15);
        } else {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "assistant_message",
                message: assistantMessage,
                jobId,
                showConfirmButton: result.showConfirmButton || false,
                aiLimited: result.aiLimited || false,
              })}\n\n`
            )
          );
          if (result.specUpdate) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "spec_saved" })}\n\n`
              )
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }

      setTimeout(sendWord, 30);
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
