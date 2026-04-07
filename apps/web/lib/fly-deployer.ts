import { prisma } from "./prisma";
import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";

const FLY_API_BASE = "https://api.machines.dev/v1";

async function logToJob(jobId: string | null, level: string, message: string) {
  if (!jobId) return;
  await prisma.jobLog.create({ data: { jobId, level, message } });
}

function generateAppName(projectId: string): string {
  const short = projectId.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase();
  const suffix = Date.now().toString(36).slice(-4);
  return `aiapp-${short}-${suffix}`;
}

function getFlyOrg(): string {
  return process.env.FLY_ORG || "personal";
}

function getFlyRegion(): string {
  return process.env.FLY_REGION || "iad";
}

const FLYCTL_VERSION = "0.4.29";

async function ensureFlyctl(jobId: string | null): Promise<boolean> {
  const jlog = async (level: string, msg: string) => {
    console.log(msg);
    await logToJob(jobId, level, msg);
  };

  await jlog("INFO", `[DEPLOY] ensureFlyctl: v9-curl-preflight (${FLYCTL_VERSION})`);

  const home = process.env.HOME || "/root";
  const flyBin = path.join(home, ".fly", "bin");
  process.env.PATH = `/usr/local/bin:/root/.fly/bin:${flyBin}:/usr/bin:/bin:${process.env.PATH}`;
  await jlog("INFO", `[DEPLOY] ensureFlyctl: PATH=${process.env.PATH}`);

  const hasCurl = spawnSync("which", ["curl"], { timeout: 3000, encoding: "utf-8" });
  if (hasCurl.status !== 0) {
    await jlog("WARN", "[DEPLOY] ensureFlyctl: curl not found, installing via apt-get...");
    try {
      execSync("apt-get update -qq && apt-get install -y -qq curl ca-certificates tar gzip >/dev/null 2>&1", { timeout: 60000 });
      await jlog("INFO", "[DEPLOY] ensureFlyctl: curl installed successfully");
    } catch (e) {
      await jlog("ERROR", `[DEPLOY] ensureFlyctl: apt-get install curl failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    await jlog("INFO", `[DEPLOY] ensureFlyctl: curl available at ${(hasCurl.stdout || "").trim()}`);
  }

  const checkPaths = [
    "/usr/local/bin/flyctl",
    "/root/.fly/bin/flyctl",
    path.join(flyBin, "flyctl"),
  ];
  const seen = new Set<string>();

  for (const p of checkPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    const exists = fs.existsSync(p);
    await jlog("INFO", `[DEPLOY] ensureFlyctl: checking ${p} — exists=${exists}`);
    if (exists) {
      try {
        const r = spawnSync(p, ["version"], { timeout: 10000, encoding: "utf-8" });
        const stdout = (r.stdout || "").trim();
        const stderr = (r.stderr || "").trim();
        await jlog("INFO", `[DEPLOY] ensureFlyctl: ${p} version exit=${r.status} stdout="${stdout.split("\n")[0]}" stderr="${stderr.substring(0, 200)}"`);
        if (r.status === 0) {
          await jlog("SUCCESS", `[DEPLOY] ensureFlyctl: FOUND at ${p}`);
          return true;
        }
      } catch (e) {
        await jlog("ERROR", `[DEPLOY] ensureFlyctl: ${p} spawn error: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  try {
    const r = spawnSync("flyctl", ["version"], { timeout: 10000, encoding: "utf-8" });
    const stdout = (r.stdout || "").trim();
    const stderr = (r.stderr || "").trim();
    await jlog("INFO", `[DEPLOY] ensureFlyctl: PATH lookup exit=${r.status} stdout="${stdout.split("\n")[0]}" stderr="${stderr.substring(0, 200)}"`);
    if (r.status === 0) {
      const which = spawnSync("which", ["flyctl"], { timeout: 5000, encoding: "utf-8" });
      await jlog("SUCCESS", `[DEPLOY] ensureFlyctl: on PATH at ${(which.stdout || "").trim()}`);
      return true;
    }
  } catch (e) {
    await jlog("WARN", `[DEPLOY] ensureFlyctl: PATH lookup failed: ${e instanceof Error ? e.message : e}`);
  }

  await jlog("INFO", `[DEPLOY] ensureFlyctl: not found, installing to ${flyBin}...`);
  try { fs.mkdirSync(flyBin, { recursive: true }); } catch {}

  const tarUrl = `https://github.com/superfly/flyctl/releases/download/v${FLYCTL_VERSION}/flyctl_${FLYCTL_VERSION}_Linux_x86_64.tar.gz`;
  await jlog("INFO", `[DEPLOY] ensureFlyctl: downloading ${tarUrl}`);

  try {
    execSync("rm -f /tmp/flyctl.tar.gz /tmp/flyctl", { timeout: 5000 });
    execSync(`curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 15 -o /tmp/flyctl.tar.gz "${tarUrl}"`, { timeout: 120000, encoding: "utf-8" });

    const stat = fs.statSync("/tmp/flyctl.tar.gz");
    if (stat.size < 1000) {
      await jlog("ERROR", `[DEPLOY] ensureFlyctl: download too small (${stat.size} bytes)`);
    } else {
      await jlog("INFO", `[DEPLOY] ensureFlyctl: downloaded ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
      execSync("tar -xzf /tmp/flyctl.tar.gz -C /tmp", { timeout: 30000, encoding: "utf-8" });

      if (fs.existsSync("/tmp/flyctl")) {
        const dest = path.join(flyBin, "flyctl");
        fs.copyFileSync("/tmp/flyctl", dest);
        fs.chmodSync(dest, 0o755);
        const r = spawnSync(dest, ["version"], { timeout: 10000, encoding: "utf-8" });
        if (r.status === 0) {
          await jlog("SUCCESS", `[DEPLOY] ensureFlyctl: installed OK — ${(r.stdout || "").trim().split("\n")[0]}`);
          return true;
        }
        await jlog("ERROR", `[DEPLOY] ensureFlyctl: version check failed after copy, exit=${r.status} stderr=${(r.stderr || "").substring(0, 200)}`);
      } else {
        await jlog("ERROR", "[DEPLOY] ensureFlyctl: flyctl binary not in tar");
      }
    }
  } catch (e: unknown) {
    await jlog("ERROR", `[DEPLOY] ensureFlyctl: tar download failed: ${(e as Error).message || e}`);
  }

  await jlog("INFO", "[DEPLOY] ensureFlyctl: trying install.sh fallback...");
  try {
    execSync(`curl -fsSL "https://fly.io/install.sh" | sh`, {
      timeout: 120000,
      encoding: "utf-8",
      env: { ...process.env, FLYCTL_INSTALL: path.join(home, ".fly") },
    });
  } catch {}
  const homeFlyctl = path.join(flyBin, "flyctl");
  if (fs.existsSync(homeFlyctl)) {
    const r = spawnSync(homeFlyctl, ["version"], { timeout: 10000, encoding: "utf-8" });
    if (r.status === 0) {
      await jlog("SUCCESS", `[DEPLOY] ensureFlyctl: install.sh OK — ${(r.stdout || "").trim().split("\n")[0]}`);
      return true;
    }
  }

  try { execSync("rm -f /tmp/flyctl.tar.gz /tmp/flyctl", { timeout: 5000 }); } catch {}
  await jlog("ERROR", "[DEPLOY] ensureFlyctl: ALL ATTEMPTS FAILED — flyctl is NOT available");
  return false;
}

function findFlyctlPath(): string {
  const home = process.env.HOME || "/root";
  const candidates = [
    "/usr/local/bin/flyctl",
    "/root/.fly/bin/flyctl",
    path.join(home, ".fly", "bin", "flyctl"),
  ];
  const checked = new Set<string>();
  for (const p of candidates) {
    if (checked.has(p)) continue;
    checked.add(p);
    if (fs.existsSync(p)) {
      try {
        const r = spawnSync(p, ["version"], { timeout: 5000, encoding: "utf-8" });
        if (r.status === 0) return p;
      } catch {}
    }
  }
  try {
    const r = spawnSync("flyctl", ["version"], { timeout: 5000, encoding: "utf-8" });
    if (r.status === 0) return "flyctl";
  } catch {}
  return "";
}

async function flyApiRequest(
  method: string,
  urlPath: string,
  token: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const url = `${FLY_API_BASE}${urlPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  const text = await resp.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: resp.status, data };
}

function flyctlEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FLYCTL_API_TOKEN: process.env.FLY_API_TOKEN,
    FLY_API_TOKEN: process.env.FLY_API_TOKEN,
    CI: "1",
    FLY_NO_UPDATE_CHECK: "1",
  };
}

async function ensureFlyApp(
  appName: string,
  token: string,
  org: string,
  jobId: string | null
): Promise<boolean> {
  await logToJob(jobId, "INFO", `[DEPLOY] Checking if Fly app '${appName}' exists...`);

  const flyctl = findFlyctlPath();

  if (flyctl) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await logToJob(jobId, "INFO", `[DEPLOY] Creating Fly app '${appName}' via flyctl (attempt ${attempt}/3)...`);
      const result = spawnSync(
        flyctl,
        ["apps", "create", appName, "--org", org, "--json"],
        { timeout: 120000, encoding: "utf-8", env: flyctlEnv() }
      );
      const output = ((result.stdout || "") + " " + (result.stderr || "")).trim();
      await logToJob(jobId, "INFO", `[DEPLOY] flyctl apps create exit=${result.status} output=${output.substring(0, 500)}`);

      if (result.status === 0) {
        await logToJob(jobId, "SUCCESS", `[DEPLOY] Fly app '${appName}' created`);
        return true;
      }
      if (output.includes("already exists")) {
        await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' already exists`);
        return true;
      }
      if (result.status === null) {
        await logToJob(jobId, "WARN", `[DEPLOY] flyctl apps create timed out after 120s (attempt ${attempt}/3)`);
      }
      if (attempt < 3) {
        await logToJob(jobId, "INFO", `[DEPLOY] Retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }
    await logToJob(jobId, "ERROR", `[DEPLOY] Failed to create Fly app '${appName}' after 3 attempts`);
    return false;
  }

  await logToJob(jobId, "INFO", `[DEPLOY] Creating Fly app '${appName}' via API in org '${org}'...`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const create = await flyApiRequest("POST", "/apps", token, { app_name: appName, org_slug: org });
    clearTimeout(timer);

    if (create.status === 201 || create.status === 200) {
      await logToJob(jobId, "SUCCESS", `[DEPLOY] Fly app '${appName}' created via API`);
      return true;
    }
    const errMsg = typeof create.data === "object" ? JSON.stringify(create.data) : String(create.data);
    if (errMsg.includes("already exists")) {
      await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' already exists (confirmed)`);
      return true;
    }
    await logToJob(jobId, "ERROR", `[DEPLOY] Failed to create Fly app via API: ${errMsg}`);
  } catch (e) {
    await logToJob(jobId, "ERROR", `[DEPLOY] Fly API app create error: ${e instanceof Error ? e.message : e}`);
  }
  return false;
}

async function destroyFlyApp(appName: string, token: string, jobId: string | null): Promise<boolean> {
  await logToJob(jobId, "INFO", `[DEPLOY] Destroying Fly app '${appName}'...`);
  const flyctl = findFlyctlPath();
  if (flyctl) {
    try {
      const result = spawnSync(
        flyctl,
        ["apps", "destroy", appName, "--yes"],
        {
          timeout: 60000,
          encoding: "utf-8",
          env: flyctlEnv(),
        }
      );
      if (result.status === 0) {
        await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' destroyed via flyctl`);
        return true;
      }
    } catch {}
  }

  const apiResult = await flyApiRequest("DELETE", `/apps/${appName}`, token);
  if (apiResult.status === 200 || apiResult.status === 202) {
    await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' destroyed via API`);
    return true;
  }

  await logToJob(jobId, "WARN", `[DEPLOY] Could not destroy Fly app '${appName}'`);
  return false;
}

async function deployWithFlyctl(
  appName: string,
  workspacePath: string,
  region: string,
  jobId: string | null
): Promise<{ success: boolean; error?: string }> {
  const flyctl = findFlyctlPath();
  if (!flyctl) {
    return { success: false, error: "flyctl binary not found by findFlyctlPath()" };
  }

  await logToJob(jobId, "INFO", `[DEPLOY] Deploying '${appName}' via ${flyctl} from ${workspacePath}...`);

  try {
    const writeFlyToml = () => {
      const flyToml = `app = "${appName}"
primary_region = "${region}"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
`;
      fs.writeFileSync(path.join(workspacePath, "fly.toml"), flyToml, "utf-8");
    };

    writeFlyToml();

    const maxAttempts = 3;
    let registryFailCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await logToJob(jobId, "INFO", `[DEPLOY] flyctl deploy attempt ${attempt}/${maxAttempts}...`);

      const result = spawnSync(
        flyctl,
        ["deploy", "--now", "--remote-only", "--depot=false", "--no-cache", "--yes"],
        {
          cwd: workspacePath,
          timeout: 600000,
          encoding: "utf-8",
          env: flyctlEnv(),
        }
      );

      const output = (result.stdout || "") + "\n" + (result.stderr || "");
      const lines = output.split("\n").filter((l: string) => l.trim());
      for (const line of lines.slice(-20)) {
        await logToJob(jobId, "INFO", `[DEPLOY] [flyctl] ${line.substring(0, 300)}`);
      }

      if (result.status === null) {
        await logToJob(jobId, "WARN", `[DEPLOY] flyctl deploy timed out after 600s on attempt ${attempt}`);
      } else if (result.status === 0) {
        await logToJob(jobId, "SUCCESS", `[DEPLOY] flyctl deploy succeeded for '${appName}' on attempt ${attempt}`);
        return { success: true };
      }

      const isRegistryError = output.includes("failed to push registry") || output.includes("unexpected status from HEAD request");
      if (isRegistryError) {
        registryFailCount++;
        if (attempt < maxAttempts) {
          await logToJob(jobId, "INFO", `[DEPLOY] Registry push error (transient), retrying in 15s...`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
      } else if (result.status !== null) {
        return { success: false, error: `flyctl deploy failed (exit ${result.status}): ${lines.slice(-3).join(" ")}` };
      }
    }

    if (registryFailCount >= maxAttempts) {
      await logToJob(jobId, "WARN", `[DEPLOY] All ${maxAttempts} attempts failed with registry errors. Destroying app and recreating...`);
      const token = process.env.FLY_API_TOKEN || "";
      const destroyed = await destroyFlyApp(appName, token, jobId);
      if (destroyed) {
        await new Promise(r => setTimeout(r, 10000));
        const org = getFlyOrg();
        const recreated = await ensureFlyApp(appName, token, org, jobId);
        if (recreated) {
          writeFlyToml();
          await logToJob(jobId, "INFO", `[DEPLOY] Final deploy attempt after app recreation...`);
          const result = spawnSync(
            flyctl,
            ["deploy", "--now", "--remote-only", "--depot=false", "--no-cache", "--yes"],
            {
              cwd: workspacePath,
              timeout: 600000,
              encoding: "utf-8",
              env: flyctlEnv(),
            }
          );
          const output = (result.stdout || "") + "\n" + (result.stderr || "");
          const lines = output.split("\n").filter((l: string) => l.trim());
          for (const line of lines.slice(-20)) {
            await logToJob(jobId, "INFO", `[DEPLOY] [flyctl] ${line.substring(0, 300)}`);
          }
          if (result.status === 0) {
            await logToJob(jobId, "SUCCESS", `[DEPLOY] flyctl deploy succeeded after app recreation!`);
            return { success: true };
          }
          return { success: false, error: `flyctl deploy failed after app recreation (exit ${result.status}): ${lines.slice(-3).join(" ")}` };
        }
      }
    }

    return { success: false, error: "flyctl deploy failed after all retry attempts" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `flyctl error: ${msg}` };
  }
}

export async function createDockerContext(
  workspacePath: string,
  jobId: string | null
): Promise<string> {
  await logToJob(jobId, "INFO", "[DEPLOY] Generating Docker context...");

  const nextConfig = path.join(workspacePath, "next.config.js");
  if (fs.existsSync(nextConfig)) {
    const content = fs.readFileSync(nextConfig, "utf-8");
    if (!content.includes("standalone")) {
      fs.writeFileSync(
        nextConfig,
        'module.exports = { output: "standalone" };\n',
        "utf-8"
      );
      await logToJob(jobId, "INFO", "[DEPLOY] Updated next.config.js with standalone output");
    }
  }

  const hasPublicDir = fs.existsSync(path.join(workspacePath, "public"));
  const publicCopyLine = hasPublicDir
    ? "COPY --from=builder /app/public ./public"
    : "RUN mkdir -p ./public";

  const hasPrisma = fs.existsSync(path.join(workspacePath, "prisma", "schema.prisma"));
  const prismaSchemaContent = hasPrisma
    ? fs.readFileSync(path.join(workspacePath, "prisma", "schema.prisma"), "utf-8")
    : "";
  const isSqlite = prismaSchemaContent.includes('provider = "sqlite"');

  const prismaRunnerCopy = hasPrisma
    ? [
        "COPY --from=builder /app/prisma ./prisma",
        "COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma",
        "COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma",
      ].join("\n")
    : "";

  const sqliteEnvLine = isSqlite ? 'ENV DATABASE_URL="file:./prisma/dev.db"' : "";

  const startCmd = hasPrisma
    ? isSqlite
      ? `CMD ["sh", "-c", "npx prisma db push --accept-data-loss 2>/dev/null || true; node server.js"]`
      : `CMD ["sh", "-c", "npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss 2>/dev/null || true; node server.js"]`
    : `CMD ["node", "server.js"]`;

  const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
${publicCopyLine}
${prismaRunnerCopy}
${sqliteEnvLine}
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
${startCmd}
`;

  const dockerfilePath = path.join(workspacePath, "Dockerfile");
  fs.writeFileSync(dockerfilePath, dockerfile, "utf-8");

  const dockerignore = `node_modules
.next
docker-context.tar.gz
.git
`;
  fs.writeFileSync(path.join(workspacePath, ".dockerignore"), dockerignore, "utf-8");

  const tarPath = path.join(workspacePath, "docker-context.tar.gz");
  try {
    const tarResult = spawnSync(
      "tar",
      ["-czf", tarPath, "--exclude=node_modules", "--exclude=.next", "--exclude=docker-context.tar.gz", "-C", workspacePath, "."],
      { timeout: 30000, encoding: "utf-8" }
    );
    if (tarResult.status !== null && tarResult.status > 1) {
      throw new Error(`tar exited with code ${tarResult.status}: ${tarResult.stderr || ""}`);
    }
  } catch (err) {
    await logToJob(jobId, "ERROR", `[DEPLOY] Failed to create docker context tar: ${err}`);
    throw err;
  }

  await logToJob(jobId, "SUCCESS", `[DEPLOY] Docker context created: ${tarPath}`);
  return tarPath;
}

export async function deployToFly(opts: {
  queueJobId?: string;
  userId: string;
  projectId: string;
  jobId: string | null;
  workspacePath: string;
}): Promise<{ flyDeploymentId: string; status: string; url?: string; error?: string }> {
  const { queueJobId, userId, projectId, jobId, workspacePath } = opts;

  const flyReady = await ensureFlyctl(jobId);
  await logToJob(jobId, "INFO", `[DEPLOY] ensureFlyctl: available=${flyReady}`);

  if (!flyReady) {
    const error = "FAILED: flyctl is not available after all install attempts. Cannot deploy to Fly without flyctl.";
    await logToJob(jobId, "ERROR", `[DEPLOY] ${error}`);

    const appName = generateAppName(projectId);
    const flyDeployment = await prisma.flyDeployment.create({
      data: {
        userId,
        projectId,
        ...(queueJobId ? { queueJobId } : {}),
        ...(jobId ? { jobId } : {}),
        status: "FAILED",
        appName,
        error,
      },
    });
    return { flyDeploymentId: flyDeployment.id, status: "FAILED", error };
  }

  const appName = generateAppName(projectId);
  const region = getFlyRegion();
  const org = getFlyOrg();

  let existing = queueJobId
    ? await prisma.flyDeployment.findUnique({ where: { queueJobId } })
    : null;

  const flyDeployment = existing || await prisma.flyDeployment.create({
    data: {
      userId,
      projectId,
      ...(queueJobId ? { queueJobId } : {}),
      ...(jobId ? { jobId } : {}),
      status: "PENDING",
      appName,
    },
  });

  if (!existing) {
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { appName },
    });
  }

  const flyToken = process.env.FLY_API_TOKEN;
  if (!flyToken) {
    const reason = "Fly deploy skipped: FLY_API_TOKEN not set.";
    await logToJob(jobId, "WARN", `[DEPLOY] ${reason}`);
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { status: "FAILED", error: reason },
    });
    return { flyDeploymentId: flyDeployment.id, status: "FAILED", error: reason };
  }

  await logToJob(jobId, "INFO", `[DEPLOY] Starting Fly.io deployment for NEW app '${appName}' in region '${region}'`);

  let dockerContextPath: string;
  try {
    dockerContextPath = await createDockerContext(workspacePath, jobId);
  } catch {
    const error = "Failed to create Docker context";
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { status: "FAILED", error },
    });
    return { flyDeploymentId: flyDeployment.id, status: "FAILED", error };
  }

  if (jobId) {
    await prisma.buildArtifact.upsert({
      where: { jobId },
      update: { type: "docker_context", pathOrRef: dockerContextPath, projectId, userId },
      create: { jobId, projectId, userId, type: "docker_context", workspacePath, pathOrRef: dockerContextPath },
    });
  }

  const appCreated = await ensureFlyApp(appName, flyToken, org, jobId);
  if (!appCreated) {
    const error = `Failed to create/verify Fly app '${appName}'`;
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { status: "FAILED", error },
    });
    return { flyDeploymentId: flyDeployment.id, status: "FAILED", error };
  }

  const deployResult = await deployWithFlyctl(appName, workspacePath, region, jobId);

  if (deployResult.success) {
    const flyUrl = `https://${appName}.fly.dev`;
    await logToJob(jobId, "SUCCESS", `[DEPLOY] Fly deployment succeeded!`);
    await logToJob(jobId, "INFO", `[DEPLOY] Fly URL (pending acceptance): ${flyUrl}`);
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { status: "SUCCESS", url: flyUrl },
    });
    return { flyDeploymentId: flyDeployment.id, status: "SUCCESS", url: flyUrl };
  }

  const error = deployResult.error || "Unknown deployment failure";
  await logToJob(jobId, "ERROR", `[DEPLOY] FAILED: ${error}`);
  await prisma.flyDeployment.update({
    where: { id: flyDeployment.id },
    data: { status: "FAILED", error },
  });
  return { flyDeploymentId: flyDeployment.id, status: "FAILED", error };
}
