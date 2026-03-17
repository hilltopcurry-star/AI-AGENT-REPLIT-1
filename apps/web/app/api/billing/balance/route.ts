import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBalance, getLowThreshold, getReserveMin, creditsEnabled, ensureInitialCredits, isReserved } from "@/lib/credits";
import { isAdminEmail } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdminEmail(session.user.email);

  if (!creditsEnabled()) {
    return NextResponse.json({ balance: 999, enabled: false, low: false, reserved: false, admin });
  }

  await ensureInitialCredits(session.user.id);
  const balance = await getBalance(session.user.id);
  const threshold = getLowThreshold();
  const reserveMin = getReserveMin();

  return NextResponse.json({
    balance,
    enabled: true,
    low: admin ? false : balance <= threshold,
    reserved: admin ? false : isReserved(balance),
    reserveMin,
    threshold,
    admin,
  });
}
