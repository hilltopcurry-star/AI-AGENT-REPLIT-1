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

function spawnNextStart(workspacePath: string, port: number): ChildProcess {
  const systemPath = getSystemPath();
  const standaloneServer = path.join(workspacePath, ".next", "standalone", "server.js");
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: systemPath || "/usr/local/bin:/usr/bin:/bin",
    HOME: workspacePath,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    XDG_CONFIG_HOME: path.join(workspacePath, ".config"),
    TMPDIR: workspacePath,
  };

  if (fs.existsSync(standaloneServer)) {
    console.log(`[DEPLOY] Starting standalone server: ${standaloneServer}`);
    return spawn(process.execPath, [standaloneServer], {
      cwd: workspacePath,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: false,
    });
  }

  const nextBin = path.join(workspacePath, "node_modules", "next", "dist", "bin", "next");
  console.log(`[DEPLOY] Starting next via node: ${nextBin}`);
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

    const proc = spawnNextStart(workspacePath, port);

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
    await log(jobId, "INFO", `[DEPLOY] Deployed app /api/health: http://127.0.0.1:${port}/api/health`);

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
