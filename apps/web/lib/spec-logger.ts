const REDACTED_KEYS = new Set([
  "apikey", "api_key", "openaiApiKey", "openai_api_key",
  "secrets", "secret", "flyToken", "fly_token", "flyApiToken",
  "stripeSecretKey", "stripe_secret_key", "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET", "stripeWebhookSecret",
  "DATABASE_URL", "databaseUrl", "database_url",
  "password", "token", "accessToken", "access_token",
  "refreshToken", "refresh_token", "privateKey", "private_key",
  "GITHUB_PAT", "githubPat",
]);

export function redactSpec(spec: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!spec) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (REDACTED_KEYS.has(key) || REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactSpec(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface SpecLogLines {
  templateKey: string;
  title: string;
  requiredRoutes: string;
  specJson: string;
}

export function getSpecLogLines(spec: Record<string, unknown> | null | undefined): SpecLogLines {
  const safe = redactSpec(spec);
  return {
    templateKey: `[SPEC] templateKey=${(spec?.templateKey as string) || "none"}`,
    title: `[SPEC] title=${(spec?.title as string) || (spec?.purpose as string) || "none"}`,
    requiredRoutes: `[SPEC] requiredRoutes=${JSON.stringify((spec?.requiredRoutes as string[]) || [])}`,
    specJson: `[SPEC] specJson=${JSON.stringify(safe)}`,
  };
}

export function specHasComplexApp(spec: Record<string, unknown> | null | undefined): boolean {
  if (!spec) return false;
  const routes = spec.requiredRoutes as string[] | undefined;
  const entities = spec.requiredEntities as string[] | undefined;
  const features = spec.features as string | undefined;
  const templateKey = spec.templateKey as string | undefined;
  if (templateKey) return true;
  if (routes && routes.length > 0) return true;
  if (entities && entities.length > 0) return true;
  if (features && features.length > 20) return true;
  return false;
}

export const MIN_FILES_FOR_COMPLEX_APP = 10;
