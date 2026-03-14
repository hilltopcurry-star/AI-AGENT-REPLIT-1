import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBalance, getLowThreshold, getReserveMin, creditsEnabled, ensureInitialCredits, isReserved } from "@/lib/credits";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!creditsEnabled()) {
    return NextResponse.json({ balance: 999, enabled: false, low: false, reserved: false });
  }

  await ensureInitialCredits(session.user.id);
  const balance = await getBalance(session.user.id);
  const threshold = getLowThreshold();
  const reserveMin = getReserveMin();

  return NextResponse.json({
    balance,
    enabled: true,
    low: balance <= threshold,
    reserved: isReserved(balance),
    reserveMin,
    threshold,
  });
}
