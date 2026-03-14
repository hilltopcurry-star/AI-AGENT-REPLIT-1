import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "all";
  const projectId = url.searchParams.get("projectId");

  const where: Record<string, unknown> = {
    userId: session.user.id,
    expiresAt: { gt: new Date() },
  };

  if (scope === "user") {
    where.scope = "user";
  } else if (scope === "project") {
    where.scope = "project";
    if (projectId) where.projectId = projectId;
  }

  if (scope === "all" && projectId) {
    where.projectId = projectId;
  }

  const items = await prisma.memoryItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      scope: true,
      key: true,
      value: true,
      projectId: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json(items);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const item = await prisma.memoryItem.findUnique({ where: { id } });
  if (!item || item.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.memoryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: 1 });
}
