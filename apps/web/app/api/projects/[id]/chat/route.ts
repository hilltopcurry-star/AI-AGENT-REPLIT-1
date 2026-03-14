import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processUserMessage, createBuildJob } from "@/lib/agent";
import type { AgentMode } from "@/lib/agent";
import { rateLimit, getEnvLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { chats: { take: 1, orderBy: { createdAt: "asc" } } },
  });

  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let chatId = project.chats[0]?.id;
  if (!chatId) {
    const chat = await prisma.chat.create({ data: { projectId } });
    chatId = chat.id;
  }

  const body = await req.json();
  const { message, content: bodyContent, mode = "Discuss" } = body as {
    message?: string;
    content?: string;
    mode?: AgentMode;
  };

  const rawContent = message || bodyContent || "";
  const msgContent = rawContent.trim();
  if (!msgContent) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const userMessage = await prisma.message.create({
    data: { chatId, role: "user", content: msgContent, mode },
  });

  const recentMessages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const chatMessages = [...recentMessages].reverse().map((m) => ({
    role: m.role,
    content: m.content,
    mode: m.mode,
  }));

  const result = await processUserMessage({
    userId: session.user.id,
    projectId,
    mode: mode as AgentMode,
    message: msgContent,
    rawMessage: rawContent,
    chatMessages,
  });

  if (result.specUpdate) {
    await prisma.project.update({
      where: { id: projectId },
      data: { specJson: result.specUpdate as unknown as Record<string, string> },
    });
  }

  let jobId: string | null = null;
  if (result.shouldCreateJob) {
    jobId = await createBuildJob(projectId, session.user.id);
  }

  const assistantMessage = await prisma.message.create({
    data: { chatId, role: "assistant", content: result.response, mode },
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
