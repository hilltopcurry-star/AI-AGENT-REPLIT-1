import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ queueJobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { queueJobId } = await params;

  const queueJob = await prisma.buildQueueJob.findUnique({
    where: { id: queueJobId },
    select: { id: true, userId: true, status: true, jobId: true },
  });

  if (!queueJob || queueJob.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const seenIds = new Set<string>();
      let lastStatus = queueJob.status;

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "queue_status", status: lastStatus, queueJobId })}\n\n`)
      );

      const poll = async () => {
        while (!cancelled) {
          const current = await prisma.buildQueueJob.findUnique({
            where: { id: queueJobId },
          });

          if (!current) break;

          if (current.status !== lastStatus) {
            lastStatus = current.status;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "queue_status", status: lastStatus })}\n\n`)
            );
          }

          if (current.jobId) {
            const logs = await prisma.jobLog.findMany({
              where: { jobId: current.jobId },
              orderBy: { createdAt: "asc" },
            });

            for (const log of logs) {
              if (!seenIds.has(log.id)) {
                seenIds.add(log.id);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "log", log: { id: log.id, level: log.level, message: log.message, createdAt: log.createdAt } })}\n\n`)
                );
              }
            }
          }

          if (["SUCCESS", "FAILED", "CANCELLED"].includes(current.status)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", status: current.status, error: current.error })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };

      poll().catch(() => {
        try { controller.close(); } catch {}
      });
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
