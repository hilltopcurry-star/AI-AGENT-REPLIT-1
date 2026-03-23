import { prisma } from "./prisma";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { deployWorkspace } from "./deployer";
import { requireAndDeductCredits, getCostDeploy, InsufficientCreditsError } from "./credits";
import { runAcceptanceWithRetry, formatAcceptanceReport } from "./acceptance-checks";

const WORKSPACES_ROOT = "/tmp/workspaces";
const INSTALL_TIMEOUT = 5 * 60 * 1000;
const BUILD_TIMEOUT = 5 * 60 * 1000;
const TOTAL_TIMEOUT = 10 * 60 * 1000;

const activeProcesses = new Map<string, ChildProcess>();

const ALLOWED_COMMANDS: Record<string, { cmd: string; args: string[]; timeout: number }> = {
  install: { cmd: "npm", args: ["install", "--no-audit", "--no-fund"], timeout: INSTALL_TIMEOUT },
  build: { cmd: "npm", args: ["run", "build"], timeout: BUILD_TIMEOUT },
};

async function log(jobId: string, level: string, message: string) {
  await prisma.jobLog.create({
    data: { jobId, level, message },
  });
}

function sanitizePath(base: string, relative: string): string {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal detected: ${relative}`);
  }
  return resolved;
}

function writeFile(base: string, relativePath: string, content: string) {
  const fullPath = sanitizePath(base, relativePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

function escapeForJsx(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

function sanitizeSpecString(value: unknown, fallback: string, maxLength = 200): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : fallback;
}

function generateScaffold(workspaceDir: string, spec: Record<string, unknown> | null) {
  const templateKey = spec?.templateKey as string | undefined;
  if (templateKey) {
    try {
      const { getTemplate } = require("./templates");
      const template = getTemplate(templateKey);
      if (template) {
        const pkgJson = template.getPackageJson();
        writeFile(workspaceDir, "package.json", JSON.stringify(pkgJson, null, 2));
        const files = template.getFiles();
        for (const f of files) {
          writeFile(workspaceDir, f.path, f.content);
        }
        return;
      }
    } catch {}
  }

  const rawPurpose = sanitizeSpecString(spec?.purpose, "web application");
  const rawFeatures = sanitizeSpecString(spec?.features, "basic features");
  const purpose = escapeForJsx(rawPurpose);
  const features = escapeForJsx(rawFeatures);

  writeFile(workspaceDir, "package.json", JSON.stringify({
    name: "generated-app",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
    },
    devDependencies: {
      typescript: "^5.4.0",
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
    },
  }, null, 2));

  writeFile(workspaceDir, "next.config.js", `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};
module.exports = nextConfig;
`);

  writeFile(workspaceDir, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "es5",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  }, null, 2));

  writeFile(workspaceDir, "app/globals.css", `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8f9fa; color: #1a1a2e; line-height: 1.6;
}
.card {
  background: #ffffff; border: 1px solid #e0e0e0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
.divider { border-top: 1px solid #e0e0e0; }
@media (prefers-color-scheme: dark) {
  body { background: #1a1a2e; color: #e8e8f0; }
  .card { background: #2a2a3e; border-color: #3a3a4e; box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
  .divider { border-top-color: #3a3a4e; }
}
`);

  writeFile(workspaceDir, "app/layout.tsx", `import './globals.css';

export const metadata = {
  title: '${purpose}',
  description: 'Generated by AI Workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);

  writeFile(workspaceDir, "app/page.tsx", `export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{
        maxWidth: '640px', width: '100%', padding: '2.5rem',
        borderRadius: '12px',
      }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: 'inherit' }}>
          ${purpose}
        </h1>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', opacity: 0.6, color: 'inherit' }}>Features</h2>
          <p style={{ fontSize: '1rem', color: 'inherit', opacity: 0.85 }}>
            ${features}
          </p>
        </div>
        <div className="divider" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1rem' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></span>
          <span style={{ fontSize: '0.8rem', opacity: 0.5, color: 'inherit' }}>Generated by AI Agent</span>
        </div>
      </div>
    </main>
  );
}
`);

  writeFile(workspaceDir, "app/api/health/route.ts", `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
`);
}

function runCommand(
  jobId: string,
  cmd: string,
  args: string[],
  cwd: string,
  timeout: number,
  onLine: (line: string) => void
): Promise<{ exitCode: number; killed: boolean }> {
  return new Promise((resolve) => {
    const isReplit = !!process.env.REPL_ID;
    const systemPath = isReplit
      ? (process.env.PATH || "/usr/local/bin:/usr/bin:/bin")
          .split(":")
          .filter((p) => p.startsWith("/nix/store/") || p === "/usr/local/bin" || p === "/usr/bin" || p === "/bin")
          .join(":")
      : process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

    onLine(`[RUNNER] env=${isReplit ? "replit" : "production"} PATH=${systemPath}`);

    const safeEnv: NodeJS.ProcessEnv = {
      PATH: systemPath || "/usr/local/bin:/usr/bin:/bin",
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
      shell: false,
    });

    activeProcesses.set(jobId, proc);

    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 5000);
    }, timeout);

    const handleData = (data: Buffer) => {
      const lines = data.toString("utf-8").split("\n").filter((l) => l.trim());
      for (const line of lines) {
        onLine(line);
      }
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);

    proc.on("close", (code) => {
      clearTimeout(timer);
      activeProcesses.delete(jobId);
      resolve({ exitCode: code ?? 1, killed });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      activeProcesses.delete(jobId);
      onLine(`Process error: ${err.message}`);
      resolve({ exitCode: 1, killed: false });
    });
  });
}

export async function runJob(jobId: string, projectId: string, userId?: string): Promise<void> {
  let totalTimedOut = false;
  const totalTimer = setTimeout(async () => {
    totalTimedOut = true;
    await log(jobId, "ERROR", "[RUNNER] Total timeout (10 min) exceeded. Killing job.");
    const activeProc = activeProcesses.get(jobId);
    if (activeProc) {
      try { activeProc.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        try { activeProc.kill("SIGKILL"); } catch {}
      }, 5000);
    }
    await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
  }, TOTAL_TIMEOUT);

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const spec = project?.specJson as Record<string, unknown> | null;

    await fs.promises.mkdir(WORKSPACES_ROOT, { recursive: true });
    await log(jobId, "INFO", `[RUNNER] Ensured workspace root: ${WORKSPACES_ROOT}`);

    const workspaceDir = path.join(WORKSPACES_ROOT, jobId);
    await log(jobId, "INFO", `[RUNNER] Creating workspace: ${workspaceDir}`);

    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await log(jobId, "INFO", "[RUNNER] Generating project scaffold from specJson...");
    generateScaffold(workspaceDir, spec);

    const files = listFilesRecursive(workspaceDir, workspaceDir);
    await log(jobId, "SUCCESS", `[RUNNER] Scaffold generated: ${files.length} files`);
    for (const f of files) {
      await log(jobId, "INFO", `[RUNNER]   ${f}`);
    }

    await log(jobId, "INFO", "[RUNNER] Step 1/2: Running npm install...");
    const installCmd = ALLOWED_COMMANDS.install;
    const installResult = await runCommand(
      jobId, installCmd.cmd, installCmd.args, workspaceDir, installCmd.timeout,
      async (line) => {
        const truncated = line.length > 500 ? line.slice(0, 500) + "..." : line;
        await log(jobId, "INFO", `[RUNNER] [npm install] ${truncated}`);
      }
    );

    if (totalTimedOut) return;

    if (installResult.killed) {
      await log(jobId, "ERROR", "[RUNNER] npm install timed out (5 min limit)");
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    if (installResult.exitCode !== 0) {
      await log(jobId, "ERROR", `[RUNNER] npm install failed with exit code ${installResult.exitCode}`);
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    await log(jobId, "SUCCESS", "[RUNNER] Step 1/2: npm install completed");

    if (totalTimedOut) return;

    await log(jobId, "INFO", "[RUNNER] Step 2/2: Running npm run build...");
    const buildCmd = ALLOWED_COMMANDS.build;
    const buildResult = await runCommand(
      jobId, buildCmd.cmd, buildCmd.args, workspaceDir, buildCmd.timeout,
      async (line) => {
        const truncated = line.length > 500 ? line.slice(0, 500) + "..." : line;
        await log(jobId, "INFO", `[RUNNER] [npm build] ${truncated}`);
      }
    );

    if (buildResult.killed) {
      await log(jobId, "ERROR", "[RUNNER] npm run build timed out (5 min limit)");
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    if (buildResult.exitCode !== 0) {
      await log(jobId, "ERROR", `[RUNNER] npm run build failed with exit code ${buildResult.exitCode}`);
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    await log(jobId, "SUCCESS", "[RUNNER] Step 2/2: npm run build completed");
    await log(jobId, "SUCCESS", `[RUNNER] Build complete for job ${jobId}`);
    await log(jobId, "INFO", `[RUNNER] Workspace: ${workspaceDir}`);

    await prisma.buildArtifact.create({
      data: { jobId, workspacePath: workspaceDir },
    });
    await log(jobId, "INFO", "[RUNNER] BuildArtifact record saved.");

    const resolvedUserId = userId || project?.userId;
    if (!resolvedUserId) {
      await log(jobId, "ERROR", "[DEPLOY] Cannot deploy: no userId found");
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    let deploySuccess = false;
    let liveUrl = "";
    const hasTemplate = !!(spec?.templateKey);
    try {
      if (resolvedUserId) {
        await requireAndDeductCredits(resolvedUserId, getCostDeploy(), "deploy", jobId, projectId);
      }
      const { url, deploymentId } = await deployWorkspace({
        jobId,
        projectId,
        userId: resolvedUserId,
        workspacePath: workspaceDir,
      });
      await log(jobId, "SUCCESS", `[DEPLOY] Deployment ${deploymentId} succeeded`);
      liveUrl = url;

      const isProxyUrl = url.includes("/api/deployments/") && url.includes("/proxy");
      if (isProxyUrl) {
        await log(jobId, "INFO", "[ACCEPTANCE] Skipping acceptance checks for proxy deployment (requires auth)");
        await log(jobId, "SUCCESS", `[DEPLOY] Live URL (Production): ${url}`);
        deploySuccess = true;
      } else {
        await log(jobId, "INFO", "[ACCEPTANCE] Starting acceptance checks...");
        const acceptanceResult = await runAcceptanceWithRetry(url, jobId, hasTemplate);
        const report = formatAcceptanceReport(acceptanceResult);
        await log(jobId, "INFO", report);

        if (acceptanceResult.passed) {
          await log(jobId, "SUCCESS", `[DEPLOY] Live URL (Production): ${url}`);
          deploySuccess = true;
        } else {
          await log(jobId, "ERROR", `[DEPLOY] Deployment live but acceptance checks FAILED. URL: ${url}`);
          await prisma.deployment.updateMany({
            where: { jobId },
            data: { status: "FAILED", error: "Acceptance checks failed" },
          });
          deploySuccess = false;
        }
      }
    } catch (deployError) {
      if (deployError instanceof InsufficientCreditsError) {
        const reason = deployError.reserved
          ? `[DEPLOY] Blocked: credits reserved (${deployError.balance} remaining, reserve threshold active). Go to /billing to add credits.`
          : `[DEPLOY] Blocked by credits: need ${deployError.required}, have ${deployError.balance}. Go to /billing to add credits.`;
        await log(jobId, "ERROR", reason);
      } else {
        const msg = deployError instanceof Error ? deployError.message : String(deployError);
        await log(jobId, "ERROR", `[DEPLOY] Deployment failed: ${msg}`);
      }
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: deploySuccess ? "COMPLETED" : "FAILED" },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await log(jobId, "ERROR", `[RUNNER] Unexpected error: ${errMsg}`);
    await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
  } finally {
    clearTimeout(totalTimer);
  }
}

function listFilesRecursive(dir: string, base: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        results.push(...listFilesRecursive(fullPath, base));
      } else {
        results.push(path.relative(base, fullPath));
      }
    }
  } catch {}
  return results;
}

export function getBuildRunnerMode(): "mock" | "real" {
  const env = process.env.BUILD_RUNNER_MODE?.toLowerCase();
  if (env === "real") return "real";
  return "mock";
}
