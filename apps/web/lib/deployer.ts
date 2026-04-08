import { prisma } from "./prisma";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";

const BASE_PORT = 7100;
const STARTUP_TIMEOUT = 30_000;
const HEALTH_CHECK_INTERVAL = 1000;
const HEALTH_CHECK_RETRIES = 25;

const runningDeployments = new Map<string, { proc: ChildProcess; port: number }>();

function hashToPort(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return BASE_PORT + (Math.abs(hash) % 900);
}

async function log(jobId: string, level: string, message: string) {
  await prisma.jobLog.create({
    data: { jobId, level, message },
  });
}

function healthCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealthy(port: number, retries: number): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const ok = await healthCheck(port);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL));
  }
  return false;
}

export function getDeploymentPort(deploymentId: string): number | null {
  const entry = runningDeployments.get(deploymentId);
  return entry?.port ?? null;
}

export function isDeploymentRunning(deploymentId: string): boolean {
  return runningDeployments.has(deploymentId);
}

function getSystemPath(): string {
  const isReplit = !!process.env.REPL_ID;
  if (isReplit) {
    return (process.env.PATH || "/usr/local/bin:/usr/bin:/bin")
      .split(":")
      .filter((p) => p.startsWith("/nix/store/") || p === "/usr/local/bin" || p === "/usr/bin" || p === "/bin")
      .join(":");
  }
  return process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
}

function findStandaloneServer(workspacePath: string): string | null {
  const candidates = [
    path.join(workspacePath, ".next", "standalone", "server.js"),
    path.join(workspacePath, ".next", "standalone", path.basename(workspacePath), "server.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function spawnNextStart(workspacePath: string, port: number, logFn?: (msg: string) => void): ChildProcess {
  const systemPath = getSystemPath();
  const _log = (msg: string) => { if (logFn) logFn(msg); console.log(msg); };

  const workspaceEnv: Record<string, string> = {};
  const envFilePath = path.join(workspacePath, ".env");
  if (fs.existsSync(envFilePath)) {
    try {
      const envContent = fs.readFileSync(envFilePath, "utf-8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
        if (match) workspaceEnv[match[1]] = match[2];
      }
    } catch {}
  }

  if (workspaceEnv.DATABASE_URL && workspaceEnv.DATABASE_URL.startsWith("file:./")) {
    const relPath = workspaceEnv.DATABASE_URL.replace("file:./", "");
    const schemaDir = path.join(workspacePath, "prisma");
    const absFromSchema = path.join(schemaDir, relPath);
    const absFromRoot = path.join(workspacePath, relPath);
    if (fs.existsSync(absFromSchema)) {
      workspaceEnv.DATABASE_URL = `file:${absFromSchema}`;
      _log(`[DEPLOY] Resolved DATABASE_URL to ${workspaceEnv.DATABASE_URL}`);
    } else if (fs.existsSync(absFromRoot)) {
      workspaceEnv.DATABASE_URL = `file:${absFromRoot}`;
      _log(`[DEPLOY] Resolved DATABASE_URL to ${workspaceEnv.DATABASE_URL}`);
    }
  }

  const passthrough: Record<string, string> = {};
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY"]) {
    if (process.env[key] && !workspaceEnv[key]) passthrough[key] = process.env[key]!;
  }

  const safeEnv: NodeJS.ProcessEnv = {
    PATH: systemPath || "/usr/local/bin:/usr/bin:/bin",
    HOME: workspacePath,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    XDG_CONFIG_HOME: path.join(workspacePath, ".config"),
    TMPDIR: workspacePath,
    ...passthrough,
    ...workspaceEnv,
  };

  const standaloneDir = path.join(workspacePath, ".next", "standalone");
  _log(`[DEPLOY] .next exists: ${fs.existsSync(path.join(workspacePath, ".next"))}`);
  _log(`[DEPLOY] .next/standalone exists: ${fs.existsSync(standaloneDir)}`);
  if (fs.existsSync(standaloneDir)) {
    try {
      const files = fs.readdirSync(standaloneDir);
      _log(`[DEPLOY] standalone contents: ${files.join(", ")}`);
    } catch {}
  }

  const standaloneServer = findStandaloneServer(workspacePath);
  if (standaloneServer) {
    _log(`[DEPLOY] Starting standalone server: ${standaloneServer}`);
    return spawn(process.execPath, [standaloneServer], {
      cwd: workspacePath,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: false,
    });
  }

  const nextBin = path.join(workspacePath, "node_modules", "next", "dist", "bin", "next");
  _log(`[DEPLOY] Standalone not found, falling back to next start: ${nextBin}`);
  return spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: workspacePath,
    env: safeEnv,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    detached: false,
  });
}

export async function relaunchDeployment(deploymentId: string): Promise<number | null> {
  if (runningDeployments.has(deploymentId)) {
    return runningDeployments.get(deploymentId)!.port;
  }

  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || deployment.status !== "SUCCESS" || !deployment.internalPort || !deployment.workspacePath) {
    return null;
  }

  if (!fs.existsSync(path.join(deployment.workspacePath, ".next"))) {
    return null;
  }

  const port = deployment.internalPort;
  const proc = spawnNextStart(deployment.workspacePath, port);

  const startupTimer = setTimeout(() => {
    try { proc.kill("SIGTERM"); } catch {}
  }, STARTUP_TIMEOUT);

  proc.on("exit", () => {
    runningDeployments.delete(deploymentId);
  });

  runningDeployments.set(deploymentId, { proc, port });

  const healthy = await waitForHealthy(port, HEALTH_CHECK_RETRIES);
  clearTimeout(startupTimer);

  if (!healthy) {
    try { proc.kill("SIGTERM"); } catch {}
    runningDeployments.delete(deploymentId);
    return null;
  }

  return port;
}

export async function deployWorkspace({
  jobId,
  projectId,
  userId,
  workspacePath,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  workspacePath: string;
}): Promise<{ url: string; deploymentId: string }> {
  await log(jobId, "INFO", "[DEPLOY] Starting deployment...");

  const flyTokenPresent = !!process.env.FLY_API_TOKEN;
  await log(jobId, "INFO", `[DEPLOY] flyTokenPresent=${flyTokenPresent}`);

  if (flyTokenPresent) {
    try {
      await log(jobId, "INFO", "[DEPLOY] attempting fly deploy...");
      const { deployToFly } = await import("./fly-deployer");
      const flyResult = await deployToFly({
        userId,
        projectId,
        jobId,
        workspacePath,
      });
      if (flyResult.status === "SUCCESS" && flyResult.url) {
        await log(jobId, "SUCCESS", `[DEPLOY] Fly URL: ${flyResult.url}`);
        await log(jobId, "INFO", `[DEPLOY] Provider: fly`);

        const proxyDeployment = await prisma.deployment.create({
          data: { userId, projectId, jobId, provider: "fly", status: "SUCCESS", url: flyResult.url, workspacePath },
        });

        return { url: flyResult.url, deploymentId: proxyDeployment.id };
      }
      await log(jobId, "WARN", `[DEPLOY] Fly deploy failed (${flyResult.status}): ${flyResult.error || "unknown"}`);
      await log(jobId, "INFO", "[DEPLOY] Falling back to proxy deploy...");
    } catch (flyErr) {
      const msg = flyErr instanceof Error ? flyErr.message : String(flyErr);
      await log(jobId, "WARN", `[DEPLOY] Fly deploy error: ${msg}`);
      await log(jobId, "INFO", "[DEPLOY] Falling back to proxy deploy...");
    }
  }

  const port = hashToPort(jobId);

  const deployment = await prisma.deployment.create({
    data: {
      userId,
      projectId,
      jobId,
      provider: "replit-proxy",
      status: "DEPLOYING",
      internalPort: port,
      workspacePath,
    },
  });

  const deploymentId = deployment.id;

  try {
    if (!fs.existsSync(path.join(workspacePath, ".next"))) {
      throw new Error("No .next build output found in workspace");
    }

    await log(jobId, "INFO", `[DEPLOY] Deployment ${deploymentId} created (provider: replit-proxy)`);
    await log(jobId, "INFO", `[DEPLOY] Assigned internal port: ${port}`);

    const proc = spawnNextStart(workspacePath, port, (msg) => { void log(jobId, "INFO", msg); });

    const startupTimer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
    }, STARTUP_TIMEOUT);

    proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString("utf-8").split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        void log(jobId, "INFO", `[DEPLOY] [next start] ${line.slice(0, 500)}`);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString("utf-8").split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        void log(jobId, "INFO", `[DEPLOY] [next start] ${line.slice(0, 500)}`);
      }
    });

    proc.on("error", (err) => {
      void log(jobId, "ERROR", `[DEPLOY] Process error: ${err.message}`);
    });

    proc.on("exit", (code) => {
      runningDeployments.delete(deploymentId);
      if (code !== null && code !== 0) {
        void log(jobId, "WARN", `[DEPLOY] Process exited with code ${code}`);
      }
    });

    runningDeployments.set(deploymentId, { proc, port });

    await log(jobId, "INFO", "[DEPLOY] Waiting for health check...");
    const healthy = await waitForHealthy(port, HEALTH_CHECK_RETRIES);
    clearTimeout(startupTimer);

    if (!healthy) {
      try { proc.kill("SIGTERM"); } catch {}
      runningDeployments.delete(deploymentId);
      const errMsg = "Health check failed after 25 retries";
      await log(jobId, "ERROR", `[DEPLOY] ${errMsg}`);
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "FAILED", error: errMsg },
      });
      throw new Error(errMsg);
    }

    let baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
    if (!baseUrl) {
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "";
      if (domain) {
        baseUrl = `https://${domain}`;
      } else {
        baseUrl = `http://localhost:5000`;
      }
    }
    baseUrl = baseUrl.replace(/\/+$/, "");
    const liveUrl = `${baseUrl}/api/deployments/${deploymentId}/proxy`;

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "SUCCESS", url: liveUrl },
    });

    await log(jobId, "SUCCESS", `[DEPLOY] Health check passed on port ${port}`);
    await log(jobId, "SUCCESS", `[DEPLOY] Live URL: ${liveUrl}`);
    await log(jobId, "INFO", `[DEPLOY] Provider: replit-proxy`);

    return { url: liveUrl, deploymentId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await log(jobId, "ERROR", `[DEPLOY] Deployment failed: ${errMsg}`);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "FAILED", error: errMsg },
    }).catch(() => {});

    throw error;
  }
}

export async function stopDeployment(deploymentId: string): Promise<void> {
  const entry = runningDeployments.get(deploymentId);
  if (entry) {
    try { entry.proc.kill("SIGTERM"); } catch {}
    runningDeployments.delete(deploymentId);
  }
}
