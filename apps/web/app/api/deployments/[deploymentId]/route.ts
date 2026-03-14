import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeploymentRunning, getDeploymentPort } from "@/lib/deployer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deploymentId } = await params;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment || deployment.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: deployment.id,
    status: deployment.status,
    url: deployment.url,
    internalPort: deployment.internalPort,
    workspacePath: deployment.workspacePath,
    provider: deployment.provider,
    processRunning: isDeploymentRunning(deploymentId),
    livePort: getDeploymentPort(deploymentId),
    createdAt: deployment.createdAt,
  });
}
