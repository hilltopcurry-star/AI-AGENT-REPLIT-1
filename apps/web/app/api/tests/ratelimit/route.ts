import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, isRateLimitEnabled, cleanupExpiredBuckets } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ name: string; pass: boolean; detail: string }> = [];
  const testKey = `_test_${Date.now()}`;

  const enabled = isRateLimitEnabled();
  results.push({
    name: "rate_limits_enabled",
    pass: true,
    detail: `RATE_LIMITS_ENABLED=${enabled}`,
  });

  if (!enabled) {
    const r = await rateLimit({ userId: session.user.id, key: testKey, windowSec: 60, limit: 2 });
    results.push({
      name: "disabled_allows_all",
      pass: r.ok === true,
      detail: `ok=${r.ok} (expected true when disabled)`,
    });
    return NextResponse.json({ pass: results.every((r) => r.pass), results });
  }

  const r1 = await rateLimit({ userId: session.user.id, key: testKey, windowSec: 60, limit: 3 });
  results.push({
    name: "first_request_ok",
    pass: r1.ok === true && r1.remaining === 2,
    detail: `ok=${r1.ok} remaining=${r1.remaining}`,
  });

  const r2 = await rateLimit({ userId: session.user.id, key: testKey, windowSec: 60, limit: 3 });
  results.push({
    name: "second_request_ok",
    pass: r2.ok === true && r2.remaining === 1,
    detail: `ok=${r2.ok} remaining=${r2.remaining}`,
  });

  const r3 = await rateLimit({ userId: session.user.id, key: testKey, windowSec: 60, limit: 3 });
  results.push({
    name: "third_request_ok",
    pass: r3.ok === true && r3.remaining === 0,
    detail: `ok=${r3.ok} remaining=${r3.remaining}`,
  });

  const r4 = await rateLimit({ userId: session.user.id, key: testKey, windowSec: 60, limit: 3 });
  results.push({
    name: "fourth_request_blocked",
    pass: r4.ok === false && r4.remaining === 0,
    detail: `ok=${r4.ok} remaining=${r4.remaining}`,
  });

  results.push({
    name: "429_has_resetAt",
    pass: r4.resetAt instanceof Date && r4.resetAt.getTime() > Date.now() - 120000,
    detail: `resetAt=${r4.resetAt?.toISOString()}`,
  });

  const cleaned = await cleanupExpiredBuckets();
  results.push({
    name: "cleanup_runs",
    pass: true,
    detail: `cleaned=${cleaned} expired buckets`,
  });

  const allPass = results.every((r) => r.pass);
  return NextResponse.json({ pass: allPass, results });
}
