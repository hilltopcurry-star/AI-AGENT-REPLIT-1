import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() || "";
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const nextAuthUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";

  return NextResponse.json({
    hasGoogleClientId: clientId.length > 0,
    hasGoogleClientSecret: clientSecret.length > 0,
    clientIdPrefix: clientId.substring(0, 10) || "(empty)",
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length,
    hasAuthSecret: authSecret.length > 0,
    nextAuthUrl: nextAuthUrl || "(not set)",
  });
}
