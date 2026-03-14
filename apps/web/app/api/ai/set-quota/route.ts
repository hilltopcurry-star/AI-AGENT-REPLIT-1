import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  if (process.env.DEV_MODE !== "1") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const remainingRequests = typeof body.remainingRequests === "number" ? body.remainingRequests : undefined;
  const remainingTokens = typeof body.remainingTokens === "number" ? body.remainingTokens : undefined;

  if (remainingRequests === undefined && remainingTokens === undefined) {
    return NextResponse.json({ error: "Provide remainingRequests and/or remainingTokens" }, { status: 400 });
  }

  const updated = await prisma.aiQuotaBalance.upsert({
    where: { userId: session.user.id },
    update: {
      ...(remainingRequests !== undefined && { remainingRequests }),
      ...(remainingTokens !== undefined && { remainingTokens }),
    },
    create: {
      userId: session.user.id,
      remainingRequests: remainingRequests ?? 0,
      remainingTokens: remainingTokens ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    remainingRequests: updated.remainingRequests,
    remainingTokens: updated.remainingTokens,
  });
}
