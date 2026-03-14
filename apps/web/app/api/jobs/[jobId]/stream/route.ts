import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acquireStream, releaseStream, getEnvLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const streamLimit = getEnvLimit("JOB_STREAM_CONCURRENT_LIMIT", 3);
  const streamCheck = acquireStream(session.user.id, streamLimit);
  if (!streamCheck.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", key: "job_stream", limit: streamLimit, current: streamCheck.current },
      { status: 429 }
    );
  }

  let released = false;
  const safeRelease = () => {
    if (!released) {
      released = true;
      releaseStream(session.user.id);
    }
  };

  try {
    const { jobId } = await params;
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    });

    if (!job || job.project.userId !== session.user.id) {
      safeRelease();
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const resumeCreatedAt = url.searchParams.get("lastCreatedAt");
    const resumeId = url.searchParams.get("lastId");

    const encoder = new TextEncoder();
    let cancelled = false;
    const seenIds = new Set<string>();

    const stream = new ReadableStream({
      async start(controller) {
        let lastCreatedAt = resumeCreatedAt ? new Date(resumeCreatedAt) : new Date(0);
        let lastId = resumeId || "";

        const poll = async () => {
          if (cancelled) return;

          try {
            const logs = await prisma.jobLog.findMany({
              where: {
                jobId,
                OR: [
                  { createdAt: { gt: lastCreatedAt } },
                  { createdAt: lastCreatedAt, id: { gt: lastId } },
                ],
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            });

            for (const log of logs) {
              if (cancelled) return;
              if (seenIds.has(log.id)) continue;
              seenIds.add(log.id);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(log)}\n\n`)
              );
              lastCreatedAt = log.createdAt;
              lastId = log.id;
            }

            const currentJob = await prisma.job.findUnique({
              where: { id: jobId },
              select: { status: true },
            });

            if (
              currentJob?.status === "COMPLETED" ||
              currentJob?.status === "FAILED"
            ) {
              const finalLogs = await prisma.jobLog.findMany({
                where: {
                  jobId,
                  OR: [
                    { createdAt: { gt: lastCreatedAt } },
                    { createdAt: lastCreatedAt, id: { gt: lastId } },
                  ],
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              });

              for (const log of finalLogs) {
                if (cancelled) return;
                if (seenIds.has(log.id)) continue;
                seenIds.add(log.id);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(log)}\n\n`)
                );
              }

              const deployment = await prisma.deployment.findUnique({
                where: { jobId },
                select: { id: true, url: true, status: true },
              });

              const donePayload: Record<string, unknown> = {
                type: "job_done",
                jobId,
                status: currentJob.status,
              };
              if (deployment?.status === "SUCCESS" && deployment.url) {
                donePayload.deploymentUrl = deployment.url;
                donePayload.deploymentId = deployment.id;
              }

              controller.enqueue(
                encoder.encode(
                  `event: done\ndata: ${JSON.stringify(donePayload)}\n\n`
                )
              );
              safeRelease();
              controller.close();
              return;
            }

            if (!cancelled) {
              setTimeout(poll, 500);
            }
          } catch {
            if (!cancelled) {
              safeRelease();
              controller.close();
            }
          }
        };

        poll();
      },
      cancel() {
        cancelled = true;
        safeRelease();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    safeRelease();
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
