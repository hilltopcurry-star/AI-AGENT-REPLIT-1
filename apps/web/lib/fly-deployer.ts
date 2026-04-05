import { prisma } from "./prisma";
import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";

const FLY_API_BASE = "https://api.machines.dev/v1";

async function logToJob(jobId: string | null, level: string, message: string) {
  if (!jobId) return;
  await prisma.jobLog.create({ data: { jobId, level, message } });
}

function getAppName(projectId: string): string {
  const short = projectId.replace(/[^a-z0-9]/gi, "").slice(0, 20).toLowerCase();
  return `aiapp-${short}`;
}

function getFlyOrg(): string {
  return process.env.FLY_ORG || "personal";
}

function getFlyRegion(): string {
  return process.env.FLY_REGION || "iad";
}

const FLYCTL_VERSION = "0.4.29";

function ensureFlyctl(): boolean {
  console.log(`[DEPLOY] ensureFlyctl: v7-build-time-preferred (${FLYCTL_VERSION})`);
  const home = process.env.HOME || "/root";
  const flyBin = path.join(home, ".fly", "bin");
  process.env.PATH = `/usr/local/bin:${flyBin}:/usr/bin:${process.env.PATH}`;

  const checkPaths = [
    "/usr/local/bin/flyctl",
    path.join(flyBin, "flyctl"),
  ];
  for (const p of checkPaths) {
    if (fs.existsSync(p)) {
      try {
        const r = spawnSync(p, ["version"], { timeout: 5000, encoding: "utf-8" });
        if (r.status === 0) {
          console.log(`[DEPLOY] ensureFlyctl: found at ${p} — ${(r.stdout || "").trim().split("\n")[0]}`);
          return true;
        }
      } catch {}
    }
  }

  try {
    const r = spawnSync("flyctl", ["version"], { timeout: 5000, encoding: "utf-8" });
    if (r.status === 0) {
      console.log(`[DEPLOY] ensureFlyctl: already on PATH — ${(r.stdout || "").trim().split("\n")[0]}`);
      return true;
    }
  } catch {}

  console.log(`[DEPLOY] ensureFlyctl: not found, installing to ${flyBin}...`);
  try { fs.mkdirSync(flyBin, { recursive: true }); } catch {}

  const tarUrl = `https://github.com/superfly/flyctl/releases/download/v${FLYCTL_VERSION}/flyctl_${FLYCTL_VERSION}_Linux_x86_64.tar.gz`;
  console.log(`[DEPLOY] ensureFlyctl: downloading ${tarUrl}`);

  try {
    execSync("rm -f /tmp/flyctl.tar.gz /tmp/flyctl", { timeout: 5000 });
    execSync(`curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 15 -o /tmp/flyctl.tar.gz "${tarUrl}"`, { timeout: 120000, encoding: "utf-8" });

    const stat = fs.statSync("/tmp/flyctl.tar.gz");
    if (stat.size < 1000) {
      console.error(`[DEPLOY] ensureFlyctl: download too small (${stat.size} bytes)`);
    } else {
      console.log(`[DEPLOY] ensureFlyctl: downloaded ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
      execSync("tar -xzf /tmp/flyctl.tar.gz -C /tmp", { timeout: 30000, encoding: "utf-8" });

      if (fs.existsSync("/tmp/flyctl")) {
        const dest = path.join(flyBin, "flyctl");
        fs.copyFileSync("/tmp/flyctl", dest);
        fs.chmodSync(dest, 0o755);
        const r = spawnSync(dest, ["version"], { timeout: 5000, encoding: "utf-8" });
        if (r.status === 0) {
          console.log(`[DEPLOY] ensureFlyctl: OK — ${(r.stdout || "").trim().split("\n")[0]}`);
          return true;
        }
        console.error("[DEPLOY] ensureFlyctl: version check failed after copy");
      } else {
        console.error("[DEPLOY] ensureFlyctl: flyctl binary not in tar");
      }
    }
  } catch (e: unknown) {
    console.error(`[DEPLOY] ensureFlyctl: tar download failed: ${(e as Error).message || e}`);
  }

  console.log("[DEPLOY] ensureFlyctl: trying install.sh fallback...");
  try {
    execSync(`curl -fsSL "https://fly.io/install.sh" | sh`, {
      timeout: 120000,
      encoding: "utf-8",
      env: { ...process.env, FLYCTL_INSTALL: path.join(home, ".fly") },
    });
  } catch {}
  const homeFlyctl = path.join(flyBin, "flyctl");
  if (fs.existsSync(homeFlyctl)) {
    const r = spawnSync(homeFlyctl, ["version"], { timeout: 5000, encoding: "utf-8" });
    if (r.status === 0) {
      console.log(`[DEPLOY] ensureFlyctl: install.sh OK — ${(r.stdout || "").trim().split("\n")[0]}`);
      return true;
    }
  }

  execSync("rm -f /tmp/flyctl.tar.gz /tmp/flyctl", { timeout: 5000 });
  console.error("[DEPLOY] ensureFlyctl: all attempts failed");
  return false;
}

function hasFlyctl(): boolean {
  try {
    const result = spawnSync("flyctl", ["version"], { timeout: 5000, encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
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

async function ensureFlyApp(
  appName: string,
  token: string,
  org: string,
  jobId: string | null
): Promise<boolean> {
  await logToJob(jobId, "INFO", `[DEPLOY] Checking if Fly app '${appName}' exists...`);

  const check = await flyApiRequest("GET", `/apps/${appName}`, token);
  if (check.status === 200) {
    await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' already exists`);
    return true;
  }

  await logToJob(jobId, "INFO", `[DEPLOY] Creating Fly app '${appName}' in org '${org}'...`);
  const create = await flyApiRequest("POST", "/apps", token, {
    app_name: appName,
    org_slug: org,
  });

  if (create.status === 201 || create.status === 200) {
    await logToJob(jobId, "SUCCESS", `[DEPLOY] Fly app '${appName}' created`);
    return true;
  }

  const errMsg = typeof create.data === "object" ? JSON.stringify(create.data) : String(create.data);
  if (errMsg.includes("already exists")) {
    await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' already exists (confirmed)`);
    return true;
  }

  await logToJob(jobId, "ERROR", `[DEPLOY] Failed to create Fly app: ${errMsg}`);
  return false;
}

async function destroyFlyApp(appName: string, token: string, jobId: string | null): Promise<boolean> {
  await logToJob(jobId, "INFO", `[DEPLOY] Destroying Fly app '${appName}' to clear corrupted registry...`);
  try {
    const result = spawnSync(
      "flyctl",
      ["apps", "destroy", appName, "--yes"],
      {
        timeout: 60000,
        encoding: "utf-8",
        env: { ...process.env, FLYCTL_API_TOKEN: token, FLY_API_TOKEN: token },
      }
    );
    if (result.status === 0) {
      await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' destroyed successfully`);
      return true;
    }
    const apiResult = await flyApiRequest("DELETE", `/apps/${appName}`, token);
    if (apiResult.status === 200 || apiResult.status === 202) {
      await logToJob(jobId, "INFO", `[DEPLOY] Fly app '${appName}' destroyed via API`);
      return true;
    }
    await logToJob(jobId, "WARN", `[DEPLOY] Could not destroy Fly app '${appName}': ${(result.stderr || "").slice(0, 200)}`);
    return false;
  } catch (err) {
    await logToJob(jobId, "WARN", `[DEPLOY] Error destroying app: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function deployWithFlyctl(
  appName: string,
  workspacePath: string,
  region: string,
  jobId: string | null
): Promise<{ success: boolean; error?: string }> {
  await logToJob(jobId, "INFO", `[DEPLOY] Deploying '${appName}' via flyctl from ${workspacePath}...`);

  try {
    const writeFlyToml = () => {
      const flyToml = `app = "${appName}"
primary_region = "${region}"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

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

      const depotFlag = attempt > 1 ? "--depot=false" : "--depot=false";
      const result = spawnSync(
        "flyctl",
        ["deploy", "--now", "--remote-only", depotFlag, "--no-cache"],
        {
          cwd: workspacePath,
          timeout: 600000,
          encoding: "utf-8",
          env: { ...process.env, FLYCTL_API_TOKEN: process.env.FLY_API_TOKEN },
        }
      );

      const output = (result.stdout || "") + "\n" + (result.stderr || "");
      const lines = output.split("\n").filter((l: string) => l.trim());
      for (const line of lines.slice(-20)) {
        await logToJob(jobId, "INFO", `[DEPLOY] [flyctl] ${line.substring(0, 300)}`);
      }

      if (result.status === 0) {
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
      } else {
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
            "flyctl",
            ["deploy", "--now", "--remote-only", "--depot=false", "--no-cache"],
            {
              cwd: workspacePath,
              timeout: 600000,
              encoding: "utf-8",
              env: { ...process.env, FLYCTL_API_TOKEN: process.env.FLY_API_TOKEN },
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

async function deployWithMachinesApi(
  appName: string,
  workspacePath: string,
  token: string,
  region: string,
  jobId: string | null
): Promise<{ success: boolean; error?: string }> {
  await logToJob(jobId, "INFO", "[DEPLOY] flyctl not available, using Fly Machines API...");

  await logToJob(jobId, "INFO", "[DEPLOY] Building Docker image requires flyctl or Fly remote builder.");
  await logToJob(
    jobId,
    "WARN",
    "[DEPLOY] Fly Machines API requires a pre-built Docker image. " +
      "Install flyctl for automatic deployment, or push an image to a registry and use the API. " +
      "See: https://fly.io/docs/machines/flyctl/fly-machine-run/"
  );

  const instructions = [
    "To deploy manually:",
    `1. Install flyctl: curl -L https://fly.io/install.sh | sh`,
    `2. cd ${workspacePath}`,
    `3. flyctl auth login`,
    `4. flyctl launch --name ${appName} --region ${region} --now`,
    `Or push to a registry and use: flyctl machine run <image> --app ${appName}`,
  ];

  for (const line of instructions) {
    await logToJob(jobId, "INFO", `[DEPLOY] ${line}`);
  }

  const existingMachines = await flyApiRequest("GET", `/apps/${appName}/machines`, token);
  if (existingMachines.status === 200 && Array.isArray(existingMachines.data)) {
    const machines = existingMachines.data as Array<{ id: string; state: string }>;
    if (machines.length > 0) {
      await logToJob(
        jobId,
        "INFO",
        `[DEPLOY] App '${appName}' has ${machines.length} existing machine(s): ${machines.map((m) => `${m.id}(${m.state})`).join(", ")}`
      );
    }
  }

  return {
    success: false,
    error: `flyctl not available. Install flyctl for automatic Docker deployment. App '${appName}' has been created on Fly.io — deploy manually or install flyctl.`,
  };
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

  if (process.env.FLY_API_TOKEN) {
    await logToJob(jobId, "INFO", "[DEPLOY] ensureFlyctl: checking...");
    const flyReady = ensureFlyctl();
    await logToJob(jobId, "INFO", `[DEPLOY] ensureFlyctl: available=${flyReady}`);
  }

  const appName = getAppName(projectId);
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
    const reason = "Fly deploy skipped: FLY_API_TOKEN not set. Set FLY_API_TOKEN to enable Fly.io deployments.";
    await logToJob(jobId, "WARN", `[DEPLOY] ${reason}`);
    await prisma.flyDeployment.update({
      where: { id: flyDeployment.id },
      data: { status: "FAILED", error: reason },
    });
    return { flyDeploymentId: flyDeployment.id, status: "FAILED", error: reason };
  }

  await logToJob(jobId, "INFO", `[DEPLOY] Starting Fly.io deployment for app '${appName}' in region '${region}'`);

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

  let deployResult: { success: boolean; error?: string };

  if (hasFlyctl()) {
    deployResult = await deployWithFlyctl(appName, workspacePath, region, jobId);
  } else {
    deployResult = await deployWithMachinesApi(appName, workspacePath, flyToken, region, jobId);
  }

  const flyUrl = `https://${appName}.fly.dev`;

  if (deployResult.success) {
    await logToJob(jobId, "SUCCESS", `[DEPLOY] Fly deployment succeeded!`);
    await logToJob(jobId, "INFO", `[DEPLOY] Fly URL: ${flyUrl}`);
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
    data: { status: "FAILED", error, url: flyUrl },
  });
  return { flyDeploymentId: flyDeployment.id, status: "FAILED", url: flyUrl, error };
}
