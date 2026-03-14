import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueBuild } from "@/lib/build-queue";
import { requireAndDeductCredits, getCostBuild, InsufficientCreditsError } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    await requireAndDeductCredits(session.user.id, getCostBuild(), "build", undefined, projectId);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({
        error: err.reserved ? "Credits reserved" : "Insufficient credits",
        balance: err.balance,
        required: err.required,
      }, { status: 402 });
    }
    throw err;
  }

  const job = await prisma.job.create({
    data: { projectId, status: "PENDING" },
  });

  try {
    const { queueJobId, position } = await enqueueBuild(session.user.id, projectId, job.id);
    return NextResponse.json({ ok: true, jobId: job.id, queueJobId, position });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 429 });
  }
}
