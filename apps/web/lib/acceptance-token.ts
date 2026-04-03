import * as crypto from "crypto";

let cachedToken: string | null = null;

export function getAcceptanceToken(): string {
  if (cachedToken) return cachedToken;

  if (process.env.INTERNAL_ACCEPTANCE_TOKEN) {
    cachedToken = process.env.INTERNAL_ACCEPTANCE_TOKEN;
    return cachedToken;
  }

  cachedToken = crypto.randomBytes(32).toString("hex");
  process.env.INTERNAL_ACCEPTANCE_TOKEN = cachedToken;
  return cachedToken;
}

export function isValidAcceptanceToken(token: string): boolean {
  const expected = getAcceptanceToken();
  if (!expected || !token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
