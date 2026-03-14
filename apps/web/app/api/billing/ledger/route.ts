import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { creditsEnabled } from "@/lib/credits";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!creditsEnabled()) {
    return NextResponse.json({ entries: [], enabled: false });
  }

  const url = new URL(req.url);
  const parsed = parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = Math.min(isNaN(parsed) ? 20 : Math.max(1, parsed), 100);

  const entries = await prisma.creditLedger.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ entries, enabled: true });
}
