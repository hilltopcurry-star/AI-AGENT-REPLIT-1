import * as crypto from "crypto";

export function getAcceptanceToken(): string {
  const token = process.env.INTERNAL_ACCEPTANCE_TOKEN;
  if (!token) {
    throw new Error(
      "INTERNAL_ACCEPTANCE_TOKEN env var is not set. " +
      "Set the same value in both WEB and WORKER services."
    );
  }
  return token;
}

export function isValidAcceptanceToken(token: string): boolean {
  const expected = process.env.INTERNAL_ACCEPTANCE_TOKEN;
  if (!expected || !token) return false;
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
