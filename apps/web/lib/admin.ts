import { prisma } from "./prisma";

let adminEmails: string[] | null = null;

function parseAdminEmails(): string[] {
  if (adminEmails !== null) return adminEmails;
  adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.toLowerCase());
}

const adminCache = new Map<string, { isAdmin: boolean; ts: number }>();
const CACHE_TTL = 60_000;

export async function isAdminUser(userId: string): Promise<boolean> {
  const cached = adminCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.isAdmin;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const result = isAdminEmail(user?.email);
  adminCache.set(userId, { isAdmin: result, ts: Date.now() });
  return result;
}
