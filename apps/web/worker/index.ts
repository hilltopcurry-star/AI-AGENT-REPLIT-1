import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { spawn, spawnSync, ChildProcess, execSync } from "child_process";
import { getTemplate } from "../lib/templates";

const prisma = new PrismaClient();
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

function ensureFlyctl(): boolean {
  console.log(`[${WORKER_ID}] ensureFlyctl: v3-direct-download`);
  process.env.PATH = `/usr/local/bin:/usr/bin:${process.env.PATH}`;

  try {
    const r = spawnSync("flyctl", ["version"], { timeout: 5000, encoding: "utf-8" });
    if (r.status === 0) {
      console.log(`[${WORKER_ID}] ensureFlyctl: already installed — ${(r.stdout || "").trim().split("\n")[0]}`);
      return true;
    }
  } catch {}

  console.log(`[${WORKER_ID}] ensureFlyctl: not found, installing prerequisites...`);
  try {
    execSync("apt-get update -qq 2>&1 && apt-get install -y -qq curl ca-certificates 2>&1", { timeout: 120000, encoding: "utf-8" });
    console.log(`[${WORKER_ID}] ensureFlyctl: curl installed`);
  } catch (e: unknown) {
    console.error(`[${WORKER_ID}] ensureFlyctl: apt failed: ${(e as Error).message || e}`);
  }

  const dlUrl = "https://github.com/superfly/flyctl/releases/latest/download/flyctl_Linux_x86_64.tar.gz";
  console.log(`[${WORKER_ID}] ensureFlyctl: downloading ${dlUrl}`);
  try {
    execSync(`curl -sL "${dlUrl}" -o /tmp/flyctl.tar.gz && ls -la /tmp/flyctl.tar.gz`, { timeout: 60000, encoding: "utf-8" });
    console.log(`[${WORKER_ID}] ensureFlyctl: extracting to /tmp...`);
    execSync("tar -xzf /tmp/flyctl.tar.gz -C /tmp", { timeout: 30000, encoding: "utf-8" });

    const extracted = fs.existsSync("/tmp/flyctl");
    console.log(`[${WORKER_ID}] ensureFlyctl: exists(/tmp/flyctl)=${extracted}`);

    if (extracted) {
      execSync("mv /tmp/flyctl /usr/local/bin/flyctl && chmod +x /usr/local/bin/flyctl", { timeout: 5000 });
      const exists = fs.existsSync("/usr/local/bin/flyctl");
      console.log(`[${WORKER_ID}] ensureFlyctl: exists(/usr/local/bin/flyctl)=${exists}`);

      const r = spawnSync("/usr/local/bin/flyctl", ["version"], { timeout: 5000, encoding: "utf-8" });
      if (r.status === 0) {
        console.log(`[${WORKER_ID}] ensureFlyctl: flyctl version: ${(r.stdout || "").trim().split("\n")[0]}`);
        return true;
      }
      console.error(`[${WORKER_ID}] ensureFlyctl: version check failed exit=${r.status} stderr=${(r.stderr || "").slice(0, 200)}`);
    }
  } catch (e: unknown) {
    console.error(`[${WORKER_ID}] ensureFlyctl: download/extract failed: ${(e as Error).message || e}`);
  }

  execSync("rm -f /tmp/flyctl.tar.gz /tmp/flyctl", { timeout: 5000 }).toString();
  console.error(`[${WORKER_ID}] ensureFlyctl: all attempts failed`);
  return false;
}
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_MS || "3000", 10);
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_BUILDS_PER_WORKER || "2", 10);
const WORKSPACES_ROOT = "/tmp/workspaces";
const INSTALL_TIMEOUT = 5 * 60 * 1000;
const BUILD_TIMEOUT = 5 * 60 * 1000;

let runningCount = 0;
let shuttingDown = false;

async function log(jobId: string, level: string, message: string) {
  await prisma.jobLog.create({ data: { jobId, level, message } });
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeout: number,
  onLine: (line: string) => void
): Promise<{ exitCode: number; killed: boolean; proc: ChildProcess }> {
  return new Promise((resolve) => {
    const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

    const safeEnv: NodeJS.ProcessEnv = {
      PATH: systemPath,
      HOME: cwd,
      NODE_ENV: "production",
      npm_config_cache: path.join(cwd, ".npm-cache"),
      TMPDIR: cwd,
      XDG_CONFIG_HOME: path.join(cwd, ".config"),
    };

    const proc = spawn(cmd, args, {
      cwd,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5000);
    }, timeout);

    const handleData = (data: Buffer) => {
      const lines = data.toString("utf-8").split("\n").filter((l) => l.trim());
      for (const line of lines) onLine(line);
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, killed, proc });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      onLine(`Process error: ${err.message}`);
      resolve({ exitCode: 1, killed: false, proc });
    });
  });
}

function generateScaffold(workspaceDir: string, spec: Record<string, unknown> | null) {
  const writeFile = (rel: string, content: string) => {
    const full = path.join(workspaceDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  };

  const templateKey = spec?.templateKey as string | undefined;
  console.log(`[SCAFFOLD] templateKey=${templateKey || "none"}`);

  if (templateKey) {
    const template = getTemplate(templateKey);
    if (!template) {
      throw new Error(`[SCAFFOLD] FATAL: templateKey="${templateKey}" set but template not found in registry. Failing build.`);
    }
    console.log(`[SCAFFOLD] Using template: ${templateKey}`);
    const pkgJson = template.getPackageJson();
    writeFile("package.json", JSON.stringify(pkgJson, null, 2));
    const files = template.getFiles();
    for (const f of files) {
      writeFile(f.path, f.content);
    }
    console.log(`[SCAFFOLD] Wrote template files: ${files.length + 1}`);
    return;
  }

  console.log("[SCAFFOLD] Using default scaffold");
  const purpose = String(spec?.purpose || "web application").slice(0, 200);
  const features = String(spec?.features || "basic features").slice(0, 200);

  writeFile("package.json", JSON.stringify({
    name: "generated-app", version: "1.0.0", private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "^14.2.0", react: "^18.3.0", "react-dom": "^18.3.0" },
    devDependencies: { typescript: "^5.4.0", "@types/node": "^20.0.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0" },
  }, null, 2));

  writeFile("next.config.js", 'module.exports = { output: "standalone" };\n');

  writeFile("tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "es5", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true,
      strict: true, noEmit: true, esModuleInterop: true, module: "esnext",
      moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "preserve",
      incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  }, null, 2));

  writeFile("app/layout.tsx", `import './globals.css';\nexport const metadata = { title: '${purpose}' };\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`);
  writeFile("app/globals.css", "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: system-ui, sans-serif; }\n");
  writeFile("app/page.tsx", `export default function Home() {\n  return <main style={{ padding: '2rem' }}>\n    <h1>${purpose}</h1>\n    <p>${features}</p>\n  </main>;\n}\n`);
  writeFile("app/api/health/route.ts", `import { NextResponse } from "next/server";\nexport async function GET() { return NextResponse.json({ ok: true }); }\n`);
}

async function processQueueJob(queueJob: {
  id: string;
  userId: string;
  projectId: string;
  jobId: string | null;
  attempts: number;
}) {
  runningCount++;
  const { id: queueJobId, userId, projectId, attempts } = queueJob;

  let jobId = queueJob.jobId;

  try {
    if (!jobId) {
      const job = await prisma.job.create({
        data: { projectId, status: "RUNNING" },
      });
      jobId = job.id;
      await prisma.buildQueueJob.update({
        where: { id: queueJobId },
        data: { jobId },
      });
    } else {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "RUNNING" },
      });
    }

    await log(jobId, "INFO", `[WORKER] Build started by ${WORKER_ID} (attempt ${attempts})`);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const spec = project?.specJson as Record<string, unknown> | null;

    await fs.promises.mkdir(WORKSPACES_ROOT, { recursive: true });
    const workspaceDir = path.join(WORKSPACES_ROOT, queueJobId);
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await log(jobId, "INFO", "[WORKER] Generating scaffold...");
    generateScaffold(workspaceDir, spec);
    await log(jobId, "SUCCESS", "[WORKER] Scaffold generated");

    await log(jobId, "INFO", "[WORKER] Step 1/2: npm install...");
    const installResult = await runCommand(
      "npm", ["install", "--no-audit", "--no-fund"], workspaceDir, INSTALL_TIMEOUT,
      async (line) => {
        const truncated = line.length > 500 ? line.slice(0, 500) + "..." : line;
        await log(jobId!, "INFO", `[WORKER] [npm install] ${truncated}`);
      }
    );

    if (installResult.killed) {
      throw new Error("npm install timed out");
    }
    if (installResult.exitCode !== 0) {
      throw new Error(`npm install failed (exit ${installResult.exitCode})`);
    }
    await log(jobId, "SUCCESS", "[WORKER] Step 1/2: npm install completed");

    await log(jobId, "INFO", "[WORKER] Step 2/2: npm run build...");
    const buildResult = await runCommand(
      "npm", ["run", "build"], workspaceDir, BUILD_TIMEOUT,
      async (line) => {
        const truncated = line.length > 500 ? line.slice(0, 500) + "..." : line;
        await log(jobId!, "INFO", `[WORKER] [npm build] ${truncated}`);
      }
    );

    if (buildResult.killed) {
      throw new Error("npm run build timed out");
    }
    if (buildResult.exitCode !== 0) {
      throw new Error(`npm run build failed (exit ${buildResult.exitCode})`);
    }
    await log(jobId, "SUCCESS", "[WORKER] Step 2/2: npm run build completed");

    await prisma.buildArtifact.upsert({
      where: { jobId },
      update: { workspacePath: workspaceDir, projectId, userId },
      create: { jobId, projectId, userId, workspacePath: workspaceDir },
    });
    await log(jobId, "INFO", "[WORKER] BuildArtifact saved");

    const flyTokenPresent = !!(process.env.FLY_API_TOKEN);
    await log(jobId, "INFO", `[DEPLOY] flyTokenPresent=${flyTokenPresent}`);
    await log(jobId, "INFO", "[DEPLOY] attempting fly deploy...");
    const { deployToFly } = await import("../lib/fly-deployer");
    const flyResult = await deployToFly({
      queueJobId,
      userId,
      projectId,
      jobId,
      workspacePath: workspaceDir,
    });

    let deployUrl = "";
    let deploySuccess = false;
    if (flyResult.status === "SUCCESS" && flyResult.url) {
      await log(jobId, "SUCCESS", `[DEPLOY] Fly URL: ${flyResult.url}`);
      await log(jobId, "INFO", `[DEPLOY] Provider: fly`);
      deployUrl = flyResult.url;
      deploySuccess = true;
    } else {
      const msg = flyResult.error || flyResult.status || "unknown";
      await log(jobId, "ERROR", `[DEPLOY] Deployment failed: ${msg}`);
    }

    const hasTemplate = !!(spec?.templateKey);
    let acceptancePassed = false;
    if (deploySuccess && deployUrl) {
      try {
        const { runAcceptanceWithRetry, formatAcceptanceReport } = await import("../lib/acceptance-checks");
        await log(jobId, "INFO", "[ACCEPTANCE] Starting acceptance checks...");
        const acceptanceResult = await runAcceptanceWithRetry(deployUrl, jobId, hasTemplate);
        const report = formatAcceptanceReport(acceptanceResult);
        await log(jobId, "INFO", report);

        if (acceptanceResult.passed) {
          await log(jobId, "SUCCESS", `[DEPLOY] Live URL (Production): ${deployUrl}`);
          acceptancePassed = true;
        } else {
          await log(jobId, "ERROR", `[DEPLOY] Deployment live but acceptance checks FAILED. URL: ${deployUrl}`);
          await prisma.flyDeployment.updateMany({
            where: { projectId },
            data: { status: "ACCEPTANCE_FAILED" },
          }).catch(() => {});
        }
      } catch (accErr) {
        const msg = accErr instanceof Error ? accErr.message : String(accErr);
        await log(jobId, "WARN", `[ACCEPTANCE] Error running checks: ${msg}`);
      }
    }

    const jobStatus = acceptancePassed ? "COMPLETED" : "FAILED";
    await log(jobId, acceptancePassed ? "SUCCESS" : "ERROR", `[WORKER] Build ${acceptancePassed ? "complete" : "failed"} for queue job ${queueJobId}`);
    await prisma.job.update({ where: { id: jobId }, data: { status: jobStatus } });
    await prisma.buildQueueJob.update({
      where: { id: queueJobId },
      data: { status: acceptancePassed ? "SUCCESS" : "FAILED", lockedAt: null },
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (jobId) {
      await log(jobId, "ERROR", `[WORKER] Build failed: ${errMsg}`);
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } }).catch(() => {});
    }

    const job = await prisma.buildQueueJob.findUnique({ where: { id: queueJobId } });
    if (job && job.attempts < job.maxAttempts) {
      const retryDelay = Math.min(30000, 5000 * Math.pow(2, job.attempts));
      await prisma.buildQueueJob.update({
        where: { id: queueJobId },
        data: {
          status: "QUEUED",
          lockedAt: null,
          lockedBy: null,
          error: errMsg,
          availableAt: new Date(Date.now() + retryDelay),
        },
      });
      console.log(`[${WORKER_ID}] Job ${queueJobId} requeued (attempt ${job.attempts}/${job.maxAttempts})`);
    } else {
      await prisma.buildQueueJob.update({
        where: { id: queueJobId },
        data: { status: "FAILED", error: errMsg, lockedAt: null },
      });
    }
  } finally {
    runningCount--;
  }
}

async function poll() {
  if (shuttingDown) return;
  if (runningCount >= MAX_CONCURRENT) return;

  const now = new Date();
  const jobs = await prisma.buildQueueJob.findMany({
    where: {
      status: "QUEUED",
      availableAt: { lte: now },
      lockedAt: null,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: MAX_CONCURRENT - runningCount,
  });

  for (const job of jobs) {
    if (runningCount >= MAX_CONCURRENT) break;

    const updated = await prisma.buildQueueJob.updateMany({
      where: { id: job.id, status: "QUEUED", lockedAt: null },
      data: { status: "RUNNING", lockedAt: now, lockedBy: WORKER_ID, attempts: { increment: 1 } },
    });

    if (updated.count > 0) {
      processQueueJob({
        id: job.id,
        userId: job.userId,
        projectId: job.projectId,
        jobId: job.jobId,
        attempts: job.attempts + 1,
      });
    }
  }
}

async function main() {
  console.log(`[worker] commit=${process.env.RAILWAY_GIT_COMMIT_SHA || "unknown"} node=${process.version} cwd=${process.cwd()}`);
  console.log(`[worker] flyctlInstaller=v3-direct-download`);
  console.log(`[${WORKER_ID}] Build worker started (max concurrent: ${MAX_CONCURRENT}, poll: ${POLL_INTERVAL_MS}ms)`);

  if (process.env.FLY_API_TOKEN) {
    const flyReady = ensureFlyctl();
    console.log(`[${WORKER_ID}] flyctl available: ${flyReady}`);
  } else {
    console.log(`[${WORKER_ID}] FLY_API_TOKEN not set, skipping flyctl install`);
  }

  process.on("SIGTERM", () => {
    console.log(`[${WORKER_ID}] SIGTERM received, shutting down...`);
    shuttingDown = true;
  });
  process.on("SIGINT", () => {
    console.log(`[${WORKER_ID}] SIGINT received, shutting down...`);
    shuttingDown = true;
  });

  while (!shuttingDown) {
    try {
      await poll();
    } catch (err) {
      console.error(`[${WORKER_ID}] Poll error:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log(`[${WORKER_ID}] Waiting for ${runningCount} running jobs to finish...`);
  while (runningCount > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await prisma.$disconnect();
  console.log(`[${WORKER_ID}] Worker stopped.`);
}

main().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
