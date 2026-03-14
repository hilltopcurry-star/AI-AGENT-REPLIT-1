import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { scope?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { scope = "all", projectId } = body;

  const where: Record<string, unknown> = {
    userId: session.user.id,
  };

  if (scope === "user") {
    where.scope = "user";
  } else if (scope === "project") {
    where.scope = "project";
    if (projectId) where.projectId = projectId;
  }

  const result = await prisma.memoryItem.deleteMany({ where });
  return NextResponse.json({ ok: true, deleted: result.count });
}
