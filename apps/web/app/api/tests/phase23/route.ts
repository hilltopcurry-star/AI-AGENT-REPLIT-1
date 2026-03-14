import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processUserMessage, createBuildJob } from "@/lib/agent";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const results: Record<string, unknown> = { userId, startedAt: new Date().toISOString() };

  try {
    const project = await prisma.project.create({
      data: {
        userId,
        name: `Phase-2.3 Proof ${new Date().toISOString().slice(0, 19)}`,
        specJson: {
          purpose: "A simple counter app for deployment proof",
          features: "Increment counter, decrement counter, reset",
          stack: "Next.js",
        },
      },
    });
    results.projectId = project.id;

    const chat = await prisma.chat.create({ data: { projectId: project.id } });
    await prisma.message.create({
      data: { chatId: chat.id, mode: "Build", role: "user", content: "Build it" },
    });

    const gateResult = await processUserMessage({
      userId,
      projectId: project.id,
      mode: "Build",
      message: "Build it",
      rawMessage: "Build it",
      chatMessages: [{ role: "user", content: "Build it", mode: "Build" }],
    });

    results.buildGatePassed = gateResult.shouldCreateJob;
    if (!gateResult.shouldCreateJob) {
      results.error = "Build gate did not trigger";
      return NextResponse.json(results, { status: 500 });
    }

    const jobId = await createBuildJob(project.id, userId);
    results.jobId = jobId;

    let status = "RUNNING";
    let attempts = 0;
    while (status === "RUNNING" && attempts < 180) {
      await new Promise((r) => setTimeout(r, 2000));
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      status = job?.status || "UNKNOWN";
      attempts++;
    }

    const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
    results.jobStatus = finalJob?.status;

    const deployment = await prisma.deployment.findFirst({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    });

    if (deployment) {
      results.deploymentId = deployment.id;
      results.deploymentStatus = deployment.status;
      results.deploymentUrl = deployment.url;
      results.deploymentProvider = deployment.provider;
      results.deploymentError = deployment.error;
    } else {
      results.deploymentError = "No deployment record found";
    }

    const logCount = await prisma.jobLog.count({ where: { jobId } });
    results.totalLogs = logCount;

    const deployLogs = await prisma.jobLog.findMany({
      where: { jobId, message: { contains: "[DEPLOY]" } },
      orderBy: { createdAt: "asc" },
    });
    results.deployLogs = deployLogs.map((l) => `[${l.level}] ${l.message}`);

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000";
    const protocol = domain.includes("localhost") ? "http" : "https";
    results.verificationUrls = {
      health: `${protocol}://${domain}/api/health`,
      agentMode: `${protocol}://${domain}/api/agent-mode`,
      jobLogs: `${protocol}://${domain}/api/jobs/${jobId}/logs`,
      jobStream: `${protocol}://${domain}/api/jobs/${jobId}/stream`,
      projectDeployments: `${protocol}://${domain}/api/projects/${project.id}/deployments`,
      deploymentProxy: deployment?.url || null,
      deploymentProxyHealth: deployment?.url ? `${deployment.url}/api/health` : null,
    };

    results.completedAt = new Date().toISOString();
    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.completedAt = new Date().toISOString();
    return NextResponse.json(results, { status: 500 });
  }
}
