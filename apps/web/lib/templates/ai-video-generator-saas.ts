import type { TemplateFile, TemplateDefinition } from "./index";

function getFiles(): TemplateFile[] {
  return [
    {
      path: "prisma/schema.prisma",
      content: `generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  projects  Project[]
}

model Project {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  title       String
  script      String
  status      String   @default("draft")
  outputUrl   String?
  totalScenes Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  scenes      Scene[]
  pipelineJobs PipelineJob[]
  characterRefs CharacterRef[]
}

model Scene {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  index         Int
  description   String
  environment   String
  characters    String
  actions       String
  cameraCue     String
  mood          String
  duration      Float    @default(5.0)
  timelineJson  String   @default("[]")
  clipUrl       String?
  status        String   @default("pending")
  error         String?
  createdAt     DateTime @default(now())
  audioTracks   AudioTrack[]
}

model AudioTrack {
  id        String   @id @default(cuid())
  sceneId   String
  scene     Scene    @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  type      String
  label     String
  url       String?
  startTime Float    @default(0)
  duration  Float    @default(0)
  status    String   @default("pending")
  createdAt DateTime @default(now())
}

model CharacterRef {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  imageData String
  createdAt DateTime @default(now())
}

model PipelineJob {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  stage       String
  status      String    @default("pending")
  progress    Float     @default(0)
  error       String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  logs        PipelineLog[]
}

model PipelineLog {
  id        String   @id @default(cuid())
  jobId     String
  job       PipelineJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  level     String   @default("INFO")
  message   String
  createdAt DateTime @default(now())
}
`,
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};
module.exports = nextConfig;
`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "es2017",
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
            baseUrl: ".",
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      ),
    },
    {
      path: ".env",
      content: `DATABASE_URL="file:./prisma/dev.db"
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
REPLICATE_API_TOKEN=""
VIDEO_MODEL="minimax/video-01-live"
VIDEO_STYLE="photorealistic cinematic"
DEMO_MODE=""
`,
    },
    {
      path: ".nvmrc",
      content: "20\n",
    },
    {
      path: "system-deps.json",
      content: JSON.stringify({ apk: ["ffmpeg", "x264", "x264-dev", "x264-libs", "lame", "lame-libs", "fontconfig", "ttf-dejavu"] }, null, 2) + "\n",
    },
    {
      path: "tailwind.config.js",
      content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
`,
    },
    {
      path: "postcss.config.js",
      content: `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
`,
    },
    {
      path: "app/globals.css",
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #09090b;
  --surface: #18181b;
  --surface2: #27272a;
  --border: #3f3f46;
  --text: #fafafa;
  --text2: #a1a1aa;
  --accent: #6366f1;
  --accent2: #818cf8;
  --accent-glow: rgba(99, 102, 241, 0.15);
  --success: #22c55e;
  --error: #ef4444;
  --warn: #f59e0b;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  line-height: 1.6;
}

::selection { background: var(--accent); color: white; }

.glass-card {
  background: rgba(24, 24, 27, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 16px;
  transition: all 0.2s ease;
}

.glass-card:hover { border-color: var(--accent); box-shadow: 0 0 20px var(--accent-glow); }

.btn-primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.btn-secondary {
  background: var(--surface2);
  color: var(--text);
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-secondary:hover { border-color: var(--accent); background: rgba(99, 102, 241, 0.1); }

.btn-success {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-success:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4); }
.btn-success:disabled { opacity: 0.5; cursor: not-allowed; }

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--surface2);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.5s ease;
}

input, textarea {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  padding: 12px 16px;
  font-size: 14px;
  width: 100%;
  font-family: inherit;
  transition: border-color 0.2s;
  outline: none;
}

input:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }

textarea { resize: vertical; line-height: 1.6; }

.fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`,
    },
    {
      path: "app/layout.tsx",
      content: `import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI Video Generator | Script to Cinematic Video",
  description: "Transform scripts into cinematic videos with AI-powered scene generation, audio mixing, and professional editing.",
  other: { "template-key": "ai-video-generator-saas" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="template-key" content="ai-video-generator-saas" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">
        <nav style={{ borderBottom: "1px solid var(--border)", background: "rgba(9,9,11,0.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>&#9654;</div>
              <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>VideoGen</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "var(--accent-glow)", color: "var(--accent2)", padding: "2px 8px", borderRadius: 12, border: "1px solid rgba(99,102,241,0.3)" }}>AI</span>
            </a>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <a href="/setup" style={{ color: "var(--text2)", textDecoration: "none", fontSize: 13, fontWeight: 500 }} data-testid="link-setup">&#9881; Setup</a>
              <a href="/new" className="btn-primary" data-testid="link-new-project" style={{ fontSize: 13, padding: "8px 18px" }}>
                + New Project
              </a>
            </div>
          </div>
        </nav>
        <main style={{ minHeight: "calc(100vh - 60px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

async function getProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { scenes: { select: { id: true, status: true } } },
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    complete: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", dot: "#22c55e" },
    failed: { bg: "rgba(239,68,68,0.12)", text: "#f87171", dot: "#ef4444" },
    generating: { bg: "rgba(99,102,241,0.12)", text: "#818cf8", dot: "#6366f1" },
    stitching: { bg: "rgba(99,102,241,0.12)", text: "#818cf8", dot: "#6366f1" },
  };
  const c = colors[status] || { bg: "rgba(161,161,170,0.12)", text: "#a1a1aa", dot: "#71717a" };
  return (
    <span className="status-badge" style={{ background: c.bg, color: c.text }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

export default async function Home() {
  const projects = await getProjects();
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
      <div style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }} data-testid="text-page-title">
          Your Projects
        </h1>
        <p style={{ color: "var(--text2)", fontSize: 15 }}>Create and manage AI-generated video projects</p>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, border: "1px solid rgba(99,102,241,0.2)" }}>&#127916;</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }} data-testid="text-empty-state">No projects yet</h2>
          <p style={{ color: "var(--text2)", marginBottom: 24, fontSize: 15 }}>Start by creating a new video project from a script</p>
          <a href="/new" className="btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>+ Create Your First Project</a>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {projects.map((p) => {
            const done = p.scenes.filter(s => s.status === "complete").length;
            const total = p.scenes.length;
            return (
              <Link key={p.id} href={"/project/" + p.id} data-testid={"card-project-" + p.id} className="glass-card"
                style={{ display: "block", padding: "20px 24px", textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                    <div style={{ display: "flex", gap: 16, color: "var(--text2)", fontSize: 13, alignItems: "center" }}>
                      <span>&#127916; {total} scene{total !== 1 ? "s" : ""}</span>
                      {total > 0 && <span>&#9679; {done}/{total} complete</span>}
                      <span style={{ color: "var(--text2)", fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {total > 0 && (p.status === "generating" || p.status === "stitching") && (
                  <div className="progress-bar" style={{ marginTop: 12 }}>
                    <div className="progress-bar-fill" style={{ width: Math.round((done / total) * 100) + "%" }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
`,
    },
    {
      path: "app/new/page.tsx",
      content: `"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export const dynamic = "force-dynamic";

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !script.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), script: script.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      router.push("/project/" + data.id);
    } catch (err: any) {
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
      <div style={{ marginBottom: 32 }}>
        <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          &#8592; Back to projects
        </a>
      </div>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>Create New Project</h1>
        <p style={{ color: "var(--text2)", fontSize: 15 }}>Write or paste your script and we'll generate a cinematic video from it</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="glass-card" style={{ padding: 28, marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Project Title</label>
          <input data-testid="input-title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sunset Chase Sequence" />
          <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 6 }}>Give your video project a descriptive name</p>
        </div>
        <div className="glass-card" style={{ padding: 28, marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Script</label>
          <textarea data-testid="input-script" value={script} onChange={(e) => setScript(e.target.value)}
            rows={14}
            placeholder={"Scene 1: A golden sunrise illuminates mountain peaks.\\nThe camera slowly pans across the misty valley below.\\nNarration: \\"The world wakes in silence.\\"\\n\\nScene 2: Waves crash against coastal cliffs.\\nSeagulls soar through the salt spray.\\nSFX: Ocean waves, wind."} />
          <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 6 }}>
            Include scene descriptions, dialogue, camera directions, sound effects, and narration cues.
            Separate scenes with blank lines or "Scene N:" markers.
          </p>
        </div>
        {error && (
          <div className="glass-card" style={{ padding: 16, marginBottom: 20, borderColor: "var(--error)", background: "rgba(239,68,68,0.08)" }}>
            <p style={{ color: "var(--error)", fontSize: 14 }}>{error}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button data-testid="button-create" type="submit" disabled={loading} className="btn-primary"
            style={{ fontSize: 15, padding: "12px 32px" }}>
            {loading ? "Creating..." : "Create Project"}
          </button>
          <a href="/" className="btn-secondary" style={{ fontSize: 15, padding: "12px 24px" }}>Cancel</a>
        </div>
      </form>
    </div>
  );
}
`,
    },
    {
      path: "app/setup/page.tsx",
      content: `"use client";
import { useState, useEffect } from "react";
export const dynamic = "force-dynamic";

interface ServiceInfo {
  name: string;
  key: string;
  status: string;
  provider: string;
  envVar: string;
  helpUrl: string;
  description: string;
}
interface AIStatus {
  ready: boolean;
  demoMode: boolean;
  videoModel: string;
  videoStyle: string;
  services: ServiceInfo[];
  missing: { name: string; envVar: string; helpUrl: string }[];
  setupInstructions: string;
  deployTarget: string;
}

export default function SetupPage() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  async function checkConfig() {
    setChecking(true);
    try {
      const res = await fetch("/api/ai-status");
      if (res.ok) setStatus(await res.json());
    } catch {}
    setChecking(false);
    setLoading(false);
  }

  useEffect(() => { checkConfig(); }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
      <div style={{ marginBottom: 32 }}>
        <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: 13 }}>&#8592; Back to projects</a>
      </div>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>Configuration</h1>
        <p style={{ color: "var(--text2)", fontSize: 15 }}>Check and configure the AI services needed for video generation</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{"@keyframes spin { to { transform: rotate(360deg) } }"}</style>
          <p style={{ color: "var(--text2)" }}>Checking configuration...</p>
        </div>
      ) : status ? (
        <>
          <div className="glass-card" style={{ padding: 20, marginBottom: 24, borderColor: status.ready ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: status.ready ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)" }}>
                {status.ready ? "\\u2713" : "\\u2717"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {status.ready ? "All Services Configured" : status.missing.length + " Service" + (status.missing.length > 1 ? "s" : "") + " Need Configuration"}
                </div>
                <div style={{ color: "var(--text2)", fontSize: 13 }}>
                  {status.ready ? "Ready for production video generation" : "Set the required API keys to enable full functionality"}
                </div>
              </div>
            </div>
            {status.demoMode && !status.ready && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(245,158,11,0.1)", borderRadius: 8, fontSize: 13, color: "#fbbf24" }}>
                &#9888; Running in DEMO mode — videos will show placeholder content instead of AI-generated clips
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
            {status.services.map((svc) => (
              <div key={svc.key} className="glass-card" style={{ padding: 20, borderColor: svc.status === "configured" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{svc.name}</span>
                    {svc.provider !== "none" && (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "var(--accent-glow)", color: "var(--accent2)", fontWeight: 600 }}>{svc.provider}</span>
                    )}
                  </div>
                  <span className="status-badge" style={{ background: svc.status === "configured" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: svc.status === "configured" ? "#4ade80" : "#f87171" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: svc.status === "configured" ? "#22c55e" : "#ef4444", display: "inline-block" }} />
                    {svc.status}
                  </span>
                </div>
                <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 8 }}>{svc.description}</p>
                {svc.status === "missing" && (
                  <div style={{ padding: "12px 14px", background: "var(--surface2)", borderRadius: 8, fontSize: 13 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>Required:</span>
                      <code style={{ marginLeft: 8, padding: "2px 8px", background: "var(--surface)", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: "var(--accent2)" }}>{svc.envVar}</code>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>Set via Fly:</span>
                      <code style={{ display: "block", marginTop: 4, padding: "8px 12px", background: "var(--surface)", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: "var(--text2)", wordBreak: "break-all" }}>
                        flyctl secrets set {svc.envVar}=&lt;your-key&gt; -a &lt;app-name&gt;
                      </code>
                    </div>
                    <a href={svc.helpUrl} target="_blank" rel="noopener" style={{ color: "var(--accent2)", fontSize: 13, textDecoration: "none" }}>
                      &#8594; Get API key
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Video Configuration</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
              <div><span style={{ color: "var(--text2)" }}>Model:</span> <span style={{ fontWeight: 500 }}>{status.videoModel}</span></div>
              <div><span style={{ color: "var(--text2)" }}>Style:</span> <span style={{ fontWeight: 500 }}>{status.videoStyle}</span></div>
              <div><span style={{ color: "var(--text2)" }}>Deploy target:</span> <span style={{ fontWeight: 500 }}>{status.deployTarget}</span></div>
              <div><span style={{ color: "var(--text2)" }}>Demo mode:</span> <span style={{ fontWeight: 500 }}>{status.demoMode ? "ON" : "OFF"}</span></div>
            </div>
          </div>

          <button onClick={checkConfig} disabled={checking} className="btn-primary" data-testid="button-check-config">
            {checking ? "Checking..." : "\\u21BB Check Configuration"}
          </button>
        </>
      ) : (
        <div className="glass-card" style={{ padding: 20 }}>
          <p style={{ color: "var(--error)" }}>Failed to load configuration status.</p>
          <button onClick={checkConfig} className="btn-secondary" style={{ marginTop: 12 }}>Retry</button>
        </div>
      )}
    </div>
  );
}
`,
    },
    {
      path: "app/project/[id]/page.tsx",
      content: `"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface TimelineEventUI {
  type: string; startTime: number; duration: number; content: string;
  speaker?: string; voice?: string; volume?: number;
}
interface Scene {
  id: string; index: number; description: string; environment: string;
  characters: string; actions: string; cameraCue: string; mood: string;
  duration: number; timelineJson: string; clipUrl: string | null; status: string; error: string | null;
}
interface ProjectData {
  id: string; title: string; script: string; status: string;
  outputUrl: string | null; totalScenes: number;
  scenes: Scene[];
  pipelineJobs: { id: string; stage: string; status: string; progress: number; error: string | null }[];
}

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  complete: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", dot: "#22c55e" },
  failed: { bg: "rgba(239,68,68,0.12)", text: "#f87171", dot: "#ef4444" },
  generating: { bg: "rgba(99,102,241,0.12)", text: "#818cf8", dot: "#6366f1" },
  stitching: { bg: "rgba(99,102,241,0.12)", text: "#818cf8", dot: "#6366f1" },
  parsed: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", dot: "#22c55e" },
  draft: { bg: "rgba(161,161,170,0.12)", text: "#a1a1aa", dot: "#71717a" },
  pending: { bg: "rgba(161,161,170,0.12)", text: "#a1a1aa", dot: "#71717a" },
  running: { bg: "rgba(99,102,241,0.12)", text: "#818cf8", dot: "#6366f1" },
};

const eventColors: Record<string, string> = {
  dialogue: "#818cf8", narration: "#4ade80", sfx: "#fbbf24", music: "#f472b6", camera_move: "#38bdf8"
};

function Badge({ status }: { status: string }) {
  const c = statusColors[status] || statusColors.draft;
  return (
    <span className="status-badge" style={{ background: c.bg, color: c.text }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [setupError, setSetupError] = useState("");
  const [showScript, setShowScript] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects/" + id);
    if (res.ok) setProject(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [load]);

  async function doAction(action: string) {
    setActionLoading(action);
    setSetupError("");
    try {
      const res = await fetch("/api/projects/" + id + "/" + action, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        if (data.setupRequired) {
          setSetupError(data.error + "\\n\\nMissing: " + (data.missing || []).join(", "));
        } else {
          setSetupError(data.error || "Action failed");
        }
        return;
      }
      await load();
    } finally { setActionLoading(""); }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text2)" }}>Loading project...</p>
        <style>{"@keyframes spin { to { transform: rotate(360deg) } }"}</style>
      </div>
    </div>
  );
  if (!project) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#128533;</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--error)" }}>Project not found</h2>
      <a href="/" className="btn-secondary" style={{ marginTop: 16 }}>Back to projects</a>
    </div>
  );

  const done = project.scenes.filter(s => s.status === "complete").length;
  const total = project.scenes.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const isActive = project.status === "generating" || project.status === "stitching";
  const totalDuration = project.scenes.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }} className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>&#8592; All projects</a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 10 }} data-testid="text-project-title">{project.title}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Badge status={project.status} />
            <span data-testid="text-project-status" style={{ display: "none" }}>{project.status}</span>
            {total > 0 && <span style={{ color: "var(--text2)", fontSize: 13 }}>&#127916; {total} scenes &middot; {totalDuration.toFixed(1)}s total</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {project.status === "draft" && (
            <button data-testid="button-parse" onClick={() => doAction("parse")} disabled={!!actionLoading} className="btn-primary">
              {actionLoading === "parse" ? "Parsing..." : "&#9998; Parse Script"}
            </button>
          )}
          {project.status === "parsed" && (
            <button data-testid="button-generate" onClick={() => doAction("generate")} disabled={!!actionLoading} className="btn-success">
              {actionLoading === "generate" ? "Starting..." : "&#9654; Generate Video"}
            </button>
          )}
          {project.status === "complete" && project.outputUrl && (
            <a data-testid="link-download" href={"/api/projects/" + id + "/download"} className="btn-primary">
              &#11015; Download MP4
            </a>
          )}
        </div>
      </div>

      {setupError && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 24, borderColor: "var(--error)", background: "rgba(239,68,68,0.06)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>&#9888;</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontWeight: 700, color: "var(--error)", marginBottom: 6, fontSize: 15 }}>Configuration Required</h3>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{setupError}</pre>
              <a href="/setup" className="btn-secondary" style={{ marginTop: 12, fontSize: 13, padding: "8px 16px" }}>
                &#9881; Open Configuration
              </a>
            </div>
          </div>
        </div>
      )}

      {project.status === "complete" && project.outputUrl && (
        <div className="glass-card" style={{ padding: 0, marginBottom: 28, overflow: "hidden" }}>
          <div style={{ background: "#000", borderRadius: "16px 16px 0 0" }}>
            <video data-testid="video-output" controls playsInline
              style={{ width: "100%", display: "block", maxHeight: 480, borderRadius: "16px 16px 0 0" }}
              src={"/api/projects/" + project.id + "/download"} />
          </div>
          <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Final Output</div>
              <div style={{ color: "var(--text2)", fontSize: 13 }}>{total} scenes &middot; {totalDuration.toFixed(1)}s</div>
            </div>
            <a href={"/api/projects/" + id + "/download"} className="btn-primary" style={{ fontSize: 13, padding: "8px 18px" }}>
              &#11015; Download
            </a>
          </div>
        </div>
      )}

      {isActive && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Pipeline Progress</span>
            <span data-testid="text-progress" style={{ fontWeight: 700, color: "var(--accent2)", fontSize: 14 }}>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: progress + "%" }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            {project.pipelineJobs.map((job) => (
              <div key={job.id} data-testid={"row-job-" + job.stage}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}>
                <Badge status={job.status} />
                <span style={{ fontWeight: 500 }}>{job.stage.replace(/_/g, " ")}</span>
                <span>{Math.round(job.progress)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isActive && project.pipelineJobs.length > 0 && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text2)" }}>Pipeline Jobs</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {project.pipelineJobs.map((job) => (
              <div key={job.id} data-testid={"row-job-" + job.stage}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 12px", background: "var(--surface2)", borderRadius: 8 }}>
                <Badge status={job.status} />
                <span>{job.stage.replace(/_/g, " ")}</span>
                {job.error && <span title={job.error} style={{ color: "var(--error)", cursor: "help" }}>&#9888;</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <button onClick={() => setShowScript(!showScript)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: 0 }}>
          <span style={{ transform: showScript ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>&#9654;</span>
          Script
        </button>
        {showScript && (
          <pre data-testid="text-script" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 240, overflow: "auto", color: "var(--text2)", marginTop: 10, lineHeight: 1.6 }}>
            {project.script}
          </pre>
        )}
      </div>

      {total > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            &#127916; Scenes
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text2)", background: "var(--surface2)", padding: "2px 10px", borderRadius: 12 }}>{total}</span>
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {project.scenes.sort((a, b) => a.index - b.index).map((scene) => {
              let events: TimelineEventUI[] = [];
              try { events = JSON.parse(scene.timelineJson || "[]"); } catch {}
              return (
                <div key={scene.id} className="glass-card" data-testid={"card-scene-" + scene.index}
                  style={{ padding: 20, borderColor: scene.status === "complete" ? "rgba(34,197,94,0.3)" : scene.status === "failed" ? "rgba(239,68,68,0.3)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "var(--accent2)", border: "1px solid rgba(99,102,241,0.2)" }}>
                        {scene.index + 1}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{scene.description.slice(0, 60)}{scene.description.length > 60 ? "..." : ""}</span>
                    </div>
                    <Badge status={scene.status} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 13, color: "var(--text2)", marginBottom: events.length > 0 ? 12 : 0 }}>
                    <div><span style={{ color: "var(--text)", fontWeight: 500 }}>Env:</span> {scene.environment}</div>
                    <div><span style={{ color: "var(--text)", fontWeight: 500 }}>Camera:</span> {scene.cameraCue}</div>
                    <div><span style={{ color: "var(--text)", fontWeight: 500 }}>Mood:</span> {scene.mood}</div>
                    <div><span style={{ color: "var(--text)", fontWeight: 500 }}>Duration:</span> {scene.duration}s</div>
                  </div>
                  {events.length > 0 && (
                    <div data-testid={"timeline-scene-" + scene.index}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Timeline Events ({events.length})</div>
                      <div style={{ position: "relative", background: "var(--surface2)", borderRadius: 8, height: 40, overflow: "hidden" }}>
                        {events.map((ev, j) => {
                          const maxDur = scene.duration || 5;
                          const left = (ev.startTime / maxDur) * 100;
                          const width = Math.max(((ev.duration / maxDur) * 100), 2);
                          return (
                            <div key={j} title={ev.type + ": " + ev.content.slice(0, 50)}
                              style={{ position: "absolute", left: left + "%", width: width + "%", top: j % 2 === 0 ? 2 : 20, height: 16,
                                background: eventColors[ev.type] || "#71717a", opacity: 0.7, borderRadius: 4, fontSize: 9, color: "#fff",
                                padding: "1px 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", lineHeight: "16px" }}>
                              {ev.type === "dialogue" && ev.speaker ? ev.speaker : ev.type}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {scene.error && (
                    <div style={{ color: "var(--error)", fontSize: 13, marginTop: 8, padding: "8px 12px", background: "rgba(239,68,68,0.06)", borderRadius: 8 }}>&#9888; {scene.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
`,
    },
    {
      path: "lib/prisma.ts",
      content: `import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`,
    },
    {
      path: "lib/scene-contract.ts",
      content: `export interface TimelineEvent {
  type: "dialogue" | "narration" | "sfx" | "music" | "camera_move";
  startTime: number;
  duration: number;
  content: string;
  speaker?: string;
  voice?: string;
  volume?: number;
  transition?: string;
}

export interface SceneSpec {
  index: number;
  description: string;
  environment: string;
  characters: string[];
  duration: number;
  events: TimelineEvent[];
  cameraCue: string;
  mood: string;
}

export interface ProjectSpec {
  title: string;
  totalDuration: number;
  scenes: SceneSpec[];
}

export function validateTimelineEvents(events: any[]): TimelineEvent[] {
  const validTypes = ["dialogue", "narration", "sfx", "music", "camera_move"];
  return (events || []).filter((e: any) => {
    if (!e || typeof e !== "object") return false;
    if (!validTypes.includes(e.type)) return false;
    if (typeof e.startTime !== "number" || typeof e.duration !== "number") return false;
    if (!e.content || typeof e.content !== "string") return false;
    return true;
  }).map((e: any) => ({
    type: e.type,
    startTime: Math.max(0, Number(e.startTime) || 0),
    duration: Math.max(0.1, Number(e.duration) || 1),
    content: String(e.content),
    speaker: e.speaker ? String(e.speaker) : undefined,
    voice: e.voice ? String(e.voice) : undefined,
    volume: typeof e.volume === "number" ? Math.max(0, Math.min(1, e.volume)) : undefined,
    transition: e.transition ? String(e.transition) : undefined,
  }));
}

export function sceneSpecToLegacy(spec: SceneSpec): {
  description: string; environment: string; characters: string;
  actions: string; cameraCue: string; mood: string; duration: number;
} {
  const dialogueActions = spec.events
    .filter(e => e.type === "dialogue" || e.type === "narration")
    .map(e => (e.speaker ? e.speaker + ": " : "") + e.content)
    .join("; ");
  return {
    description: spec.description,
    environment: spec.environment,
    characters: spec.characters.join(", "),
    actions: dialogueActions || spec.description,
    cameraCue: spec.cameraCue,
    mood: spec.mood,
    duration: spec.duration,
  };
}

export function computeSceneDuration(events: TimelineEvent[]): number {
  if (events.length === 0) return 5;
  return Math.max(
    5,
    ...events.map(e => e.startTime + e.duration)
  );
}
`,
    },
    {
      path: "app/api/health/route.ts",
      content: `import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: true });
}
`,
    },
    {
      path: "app/api/debug/route.ts",
      content: `import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    deployedAt: process.env.DEPLOY_TIMESTAMP || "unknown",
    commitSha: process.env.DEPLOY_COMMIT_SHA || "unknown",
    nodeEnv: process.env.NODE_ENV,
    hasReplicateToken: !!process.env.REPLICATE_API_TOKEN,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    demoMode: process.env.DEMO_MODE === "true",
    routes: ["/", "/new", "/setup", "/project/[id]", "/api/health", "/api/ai-status", "/api/debug"],
  });
}
`,
    },
    {
      path: "app/api/db-check/route.ts",
      content: `import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const userCount = await prisma.user.count();
    const projectCount = await prisma.project.count();
    return NextResponse.json({ ok: true, users: userCount, projects: projectCount });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/ai-status/route.ts",
      content: `import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const videoModel = process.env.VIDEO_MODEL || "minimax/video-01-live";
  const videoStyle = process.env.VIDEO_STYLE || "photorealistic cinematic";
  const isDemoMode = process.env.DEMO_MODE === "true";

  const services = [
    {
      name: "Script Parser",
      key: "scriptParser",
      status: anthropicKey ? "configured" : (openaiKey ? "configured" : "missing"),
      provider: anthropicKey ? "anthropic" : (openaiKey ? "openai" : "none"),
      envVar: "ANTHROPIC_API_KEY or OPENAI_API_KEY",
      helpUrl: "https://console.anthropic.com/settings/keys",
      description: "Parses scripts into structured scenes with timeline events",
    },
    {
      name: "Video Generator",
      key: "videoProvider",
      status: replicateToken ? "configured" : "missing",
      provider: replicateToken ? "replicate" : "none",
      envVar: "REPLICATE_API_TOKEN",
      helpUrl: "https://replicate.com/account/api-tokens",
      description: "Generates video clips from scene descriptions using " + videoModel,
    },
    {
      name: "Text-to-Speech",
      key: "tts",
      status: openaiKey ? "configured" : "missing",
      provider: openaiKey ? "openai" : "none",
      envVar: "OPENAI_API_KEY",
      helpUrl: "https://platform.openai.com/api-keys",
      description: "Generates voiceover narration and dialogue audio",
    },
  ];

  const allConfigured = services.every(s => s.status === "configured");
  const missingServices = services.filter(s => s.status === "missing");

  return NextResponse.json({
    scriptParser: services[0].status,
    scriptParserProvider: services[0].provider,
    videoProvider: services[1].status,
    videoProviderName: services[1].provider,
    videoModel,
    videoStyle,
    tts: services[2].status,
    realisticMode: true,
    demoMode: isDemoMode,
    ready: allConfigured,
    services,
    missing: missingServices.map(s => ({
      name: s.name,
      envVar: s.envVar,
      helpUrl: s.helpUrl,
    })),
    deployTarget: "fly",
    setupInstructions: missingServices.length > 0
      ? "Set the following secrets on your Fly app:\\n" +
        missingServices.map(s => "  flyctl secrets set " + s.envVar + "=<your-key> -a <your-app-name>").join("\\n") +
        "\\n\\nGet API keys from:\\n" +
        missingServices.map(s => "  " + s.name + ": " + s.helpUrl).join("\\n")
      : "All services configured. Ready for production video generation.",
  });
}
`,
    },
    {
      path: "app/api/projects/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      scenes: { select: { id: true, status: true } },
      pipelineJobs: { select: { id: true, stage: true, status: true, progress: true } },
    },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, script, userId } = body;
    if (!title || !script) {
      return NextResponse.json({ error: "title and script are required" }, { status: 400 });
    }
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({ data: { email: "default@videogen.app", name: "Default User" } });
    }
    const project = await prisma.project.create({
      data: { title, script, userId: userId || user.id },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/projects/[id]/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      scenes: { orderBy: { index: "asc" }, include: { audioTracks: true } },
      pipelineJobs: { orderBy: { createdAt: "desc" } },
      characterRefs: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}
`,
    },
    {
      path: "app/api/projects/[id]/parse/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseScript } from "@/lib/script-parser";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.status !== "draft") {
    return NextResponse.json({ error: "Script already parsed. Status: " + project.status }, { status: 400 });
  }
  try {
    await prisma.project.update({ where: { id }, data: { status: "parsing" } });
    const scenes = await parseScript(project.script);
    await prisma.scene.deleteMany({ where: { projectId: id } });
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      await prisma.scene.create({
        data: {
          projectId: id, index: i, description: s.description,
          environment: s.environment, characters: s.characters,
          actions: s.actions, cameraCue: s.cameraCue, mood: s.mood,
          duration: s.duration || 5.0,
          timelineJson: JSON.stringify(s.events || []),
        },
      });
    }
    await prisma.project.update({ where: { id }, data: { status: "parsed", totalScenes: scenes.length } });
    return NextResponse.json({ ok: true, scenes: scenes.length });
  } catch (err: any) {
    await prisma.project.update({ where: { id }, data: { status: "failed" } });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/projects/[id]/generate/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/pipeline";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, include: { scenes: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.status !== "parsed") {
    return NextResponse.json({ error: "Project must be parsed first. Status: " + project.status }, { status: 400 });
  }
  if (project.scenes.length === 0) {
    return NextResponse.json({ error: "No scenes to generate" }, { status: 400 });
  }

  const hasVideoKey = !!process.env.REPLICATE_API_TOKEN;
  const hasAiKey = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  const isDemoMode = process.env.DEMO_MODE === "true";

  if (!hasVideoKey && !isDemoMode) {
    return NextResponse.json({
      error: "PRODUCTION SETUP REQUIRED: REPLICATE_API_TOKEN is not configured. Video generation requires this key.",
      setupRequired: true,
      missing: [
        !hasVideoKey && { name: "REPLICATE_API_TOKEN", helpUrl: "https://replicate.com/account/api-tokens", instruction: "flyctl secrets set REPLICATE_API_TOKEN=<token> -a <app>" },
        !hasAiKey && { name: "OPENAI_API_KEY or ANTHROPIC_API_KEY", helpUrl: "https://platform.openai.com/api-keys", instruction: "flyctl secrets set OPENAI_API_KEY=<key> -a <app>" },
      ].filter(Boolean),
      configCheckUrl: "/api/ai-status",
    }, { status: 422 });
  }

  if (!hasVideoKey && isDemoMode) {
    console.log("[GENERATE] Running in DEMO_MODE — placeholder clips will be generated");
  }

  await prisma.project.update({ where: { id }, data: { status: "generating" } });
  runPipeline(id).catch(async (err) => {
    console.error("[PIPELINE] Fatal error:", err);
    await prisma.project.update({ where: { id }, data: { status: "failed" } }).catch(() => {});
  });
  return NextResponse.json({ ok: true, message: "Pipeline started", mode: isDemoMode && !hasVideoKey ? "demo" : "production" });
}
`,
    },
    {
      path: "app/api/projects/[id]/status/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, status: true, outputUrl: true, totalScenes: true,
      scenes: { select: { id: true, index: true, status: true, clipUrl: true, error: true } },
      pipelineJobs: { select: { id: true, stage: true, status: true, progress: true, error: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const completedScenes = project.scenes.filter(s => s.status === "complete").length;
  const progress = project.scenes.length > 0 ? Math.round((completedScenes / project.scenes.length) * 100) : 0;
  return NextResponse.json({ ...project, progress, completedScenes });
}
`,
    },
    {
      path: "app/api/projects/[id]/download/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { outputUrl: true, title: true, status: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.status !== "complete" || !project.outputUrl) {
    return NextResponse.json({ error: "Video not ready. Status: " + project.status }, { status: 400 });
  }
  const filePath = project.outputUrl;
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Output file not found on disk" }, { status: 404 });
  }
  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: any) => controller.enqueue(new Uint8Array(Buffer.from(chunk))));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });
  const safeName = (project.title || "output").replace(/[^a-zA-Z0-9_-]/g, "_") + ".mp4";
  return new NextResponse(readableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": "attachment; filename=\\"" + safeName + "\\"",
    },
  });
}
`,
    },
    {
      path: "lib/script-parser.ts",
      content: `import type { SceneSpec, TimelineEvent } from "./scene-contract";
import { validateTimelineEvents, computeSceneDuration } from "./scene-contract";

export interface ParsedScene {
  description: string;
  environment: string;
  characters: string;
  actions: string;
  cameraCue: string;
  mood: string;
  duration: number;
  events: TimelineEvent[];
}

const STRUCTURED_SYSTEM_PROMPT = \`You are a professional film script analyst. Parse the given script into individual scenes with structured timeline events.

For each scene, produce a JSON object with:
- description: 1-2 sentence summary
- environment: location, weather, time of day
- characters: array of character names present
- cameraCue: camera movement/angle (e.g. "wide establishing shot", "close-up tracking")
- mood: lighting and emotional tone
- events: array of timeline events, each with:
  - type: one of "dialogue", "narration", "sfx", "music", "camera_move"
  - startTime: seconds from scene start
  - duration: seconds this event lasts
  - content: the text (for dialogue/narration), sound name (for sfx), track description (for music), or movement description (for camera_move)
  - speaker: (dialogue only) character name
  - voice: (dialogue/narration) voice style hint e.g. "deep", "whisper"
  - volume: 0.0-1.0, default 0.7

Return ONLY a valid JSON array. No markdown, no explanation.\`;

export async function parseScript(script: string): Promise<ParsedScene[]> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const isDemoMode = process.env.DEMO_MODE === "true";

  if (!anthropicKey && !openaiKey) {
    if (isDemoMode) {
      return fallbackParse(script);
    }
    throw new Error(
      "SETUP REQUIRED: No AI provider configured for script parsing.\\n" +
      "Set one of the following environment variables:\\n" +
      "  - ANTHROPIC_API_KEY (recommended, uses Claude)\\n" +
      "  - OPENAI_API_KEY (uses GPT-4o-mini)\\n" +
      "Or set DEMO_MODE=true for development placeholder mode."
    );
  }

  const userPrompt = "Parse this script into scenes with timeline events:\\n\\n" + script;
  let responseText = "";

  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: STRUCTURED_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error("Anthropic API error: " + res.status + " " + (await res.text()).slice(0, 200));
    const data = await res.json();
    responseText = data.content?.[0]?.text || "";
  } else if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + openaiKey },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: STRUCTURED_SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
        max_tokens: 8192,
      }),
    });
    if (!res.ok) throw new Error("OpenAI API error: " + res.status);
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || "";
  }

  const jsonMatch = responseText.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON scene array. Response: " + responseText.slice(0, 300));

  const raw: any[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Parsed 0 scenes from script");

  return raw.map((s: any, i: number) => {
    const events = validateTimelineEvents(s.events || []);
    const duration = events.length > 0 ? computeSceneDuration(events) : (Number(s.duration) || 5);
    return {
      description: String(s.description || ""),
      environment: String(s.environment || ""),
      characters: Array.isArray(s.characters) ? s.characters.join(", ") : String(s.characters || ""),
      actions: String(s.actions || s.description || ""),
      cameraCue: String(s.cameraCue || s.camera_cue || "static"),
      mood: String(s.mood || "neutral"),
      duration,
      events,
    };
  });
}

function fallbackParse(script: string): ParsedScene[] {
  const blocks = script.split(/\\n\\s*\\n|(?=Scene\\s+\\d)/i).filter(b => b.trim().length > 10);
  if (blocks.length === 0) blocks.push(script);

  return blocks.map((block, i) => {
    const text = block.trim();
    const events: TimelineEvent[] = [
      { type: "narration", startTime: 0, duration: Math.min(text.length / 20, 8), content: text.slice(0, 200), volume: 0.7 },
    ];
    if (text.toLowerCase().includes("rain") || text.toLowerCase().includes("storm")) {
      events.push({ type: "sfx", startTime: 0, duration: 5, content: "rain", volume: 0.4 });
    }
    return {
      description: text.slice(0, 120),
      environment: "unspecified",
      characters: "",
      actions: text.slice(0, 200),
      cameraCue: "static",
      mood: "neutral",
      duration: computeSceneDuration(events),
      events,
    };
  });
}
`,
    },
    {
      path: "lib/video-provider.ts",
      content: `const STYLE = process.env.VIDEO_STYLE || "photorealistic cinematic";
const MODEL = process.env.VIDEO_MODEL || "minimax/video-01-live";

export interface VideoGenResult {
  url: string;
  durationSec: number;
}

export function isVideoProviderConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

async function replicateRun(model: string, input: Record<string, any>, token: string): Promise<any> {
  const [owner, name] = model.split("/");
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ version: model, input }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error("Replicate API error " + createRes.status + ": " + body.slice(0, 300));
  }
  let prediction = await createRes.json();
  const maxWait = 300;
  for (let i = 0; i < maxWait; i++) {
    if (prediction.status === "succeeded") return prediction.output;
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error("Replicate prediction " + prediction.status + ": " + (prediction.error || "unknown"));
    }
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch("https://api.replicate.com/v1/predictions/" + prediction.id, {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!pollRes.ok) throw new Error("Replicate poll error " + pollRes.status);
    prediction = await pollRes.json();
  }
  throw new Error("Replicate prediction timed out after " + maxWait + " polls");
}

export async function generateVideoClip(
  sceneDescription: string,
  environment: string,
  mood: string,
  cameraCue: string,
  durationHint: number
): Promise<VideoGenResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not configured");

  const prompt = [
    STYLE + " footage.",
    "Scene: " + sceneDescription,
    "Environment: " + environment,
    "Mood/Lighting: " + mood,
    "Camera: " + cameraCue,
    "Style: realistic, cinematic, NOT cartoon, NOT anime, NOT stylized.",
  ].join(" ");

  console.log("[VIDEO] Generating clip with model=" + MODEL + " prompt=" + prompt.slice(0, 120) + "...");

  const output = await replicateRun(MODEL, {
    prompt,
    num_frames: Math.min(Math.max(Math.round(durationHint * 8), 32), 80),
  }, token);

  let url = "";
  if (typeof output === "string") {
    url = output;
  } else if (Array.isArray(output) && output.length > 0) {
    url = typeof output[0] === "string" ? output[0] : (output[0] as any)?.url || String(output[0]);
  } else if (output && typeof output === "object" && "url" in (output as any)) {
    url = (output as any).url;
  } else {
    url = String(output);
  }

  if (!url || (!url.startsWith("http") && !url.startsWith("data:"))) {
    throw new Error("Video generation returned invalid URL: " + String(url).slice(0, 200));
  }

  return { url, durationSec: durationHint };
}

export function getProviderLimits(): { maxClipSeconds: number; maxTotalMinutes: number; note: string } {
  return {
    maxClipSeconds: 10,
    maxTotalMinutes: 30,
    note: "Each scene generates a 4-10s clip. For >10s scenes, multiple clips are chained. Total output limited to ~30 min via scene chunking + stitching.",
  };
}
`,
    },
    {
      path: "lib/audio-provider.ts",
      content: `import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { TimelineEvent } from "./scene-contract";

export interface AudioResult {
  filePath: string;
  durationSec: number;
  startTime: number;
  eventType: string;
}

export async function generateNarration(text: string, outputDir: string, label: string, voice?: string): Promise<Omit<AudioResult, "startTime" | "eventType">> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured for TTS");

  const ttsVoice = voice === "whisper" ? "shimmer" : voice === "deep" ? "onyx" : "alloy";
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: ttsVoice,
      response_format: "mp3",
    }),
  });

  if (!res.ok) throw new Error("OpenAI TTS error: " + res.status);

  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(outputDir, label + ".mp3");
  fs.writeFileSync(filePath, buffer);

  let duration = 3;
  try {
    const probe = execSync(
      "ffprobe -v error -show_entries format=duration -of csv=p=0 " + JSON.stringify(filePath),
      { encoding: "utf-8", timeout: 10000 }
    ).trim();
    duration = parseFloat(probe) || 3;
  } catch {}

  return { filePath, durationSec: duration };
}

export async function generateSFX(type: string, durationSec: number, outputDir: string, label: string): Promise<Omit<AudioResult, "startTime" | "eventType">> {
  const filePath = path.join(outputDir, label + ".wav");
  let cmd = "";

  switch (type.toLowerCase()) {
    case "rain":
      cmd = "ffmpeg -y -f lavfi -i anoisesrc=d=" + durationSec + ":c=pink:r=44100:a=0.3 -af lowpass=f=3000 " + JSON.stringify(filePath);
      break;
    case "thunder":
      cmd = "ffmpeg -y -f lavfi -i sine=frequency=40:duration=" + Math.min(durationSec, 3) + " -af 'afade=t=in:st=0:d=0.3,afade=t=out:st=" + Math.max(durationSec - 1, 0.5) + ":d=1,lowpass=f=200' " + JSON.stringify(filePath);
      break;
    case "footsteps":
      cmd = "ffmpeg -y -f lavfi -i sine=frequency=200:duration=" + durationSec + " -af 'tremolo=f=4:d=0.9,lowpass=f=800' " + JSON.stringify(filePath);
      break;
    case "wind":
      cmd = "ffmpeg -y -f lavfi -i anoisesrc=d=" + durationSec + ":c=brown:r=44100:a=0.2 -af 'lowpass=f=1500,highpass=f=200' " + JSON.stringify(filePath);
      break;
    case "ocean":
    case "waves":
      cmd = "ffmpeg -y -f lavfi -i anoisesrc=d=" + durationSec + ":c=pink:r=44100:a=0.25 -af 'lowpass=f=2000,tremolo=f=0.15:d=0.6' " + JSON.stringify(filePath);
      break;
    default:
      cmd = "ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t " + durationSec + " " + JSON.stringify(filePath);
      break;
  }

  try {
    execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: "pipe" });
  } catch (err: any) {
    execSync("ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t " + durationSec + " " + JSON.stringify(filePath),
      { encoding: "utf-8", timeout: 10000, stdio: "pipe" });
  }

  return { filePath, durationSec };
}

export async function processTimelineEvents(
  events: TimelineEvent[],
  sceneIndex: number,
  outputDir: string,
  cumulativeOffset: number
): Promise<AudioResult[]> {
  const results: AudioResult[] = [];
  const isDemoMode = process.env.DEMO_MODE === "true";
  let eventIdx = 0;

  for (const event of events) {
    const label = "scene" + sceneIndex + "_ev" + eventIdx + "_" + event.type;
    try {
      switch (event.type) {
        case "dialogue":
        case "narration": {
          if (!process.env.OPENAI_API_KEY) {
            if (!isDemoMode) {
              console.log("[AUDIO] Skipping " + event.type + " — OPENAI_API_KEY not set");
              break;
            }
            const silentPath = path.join(outputDir, label + ".wav");
            execSync("ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t " + event.duration + " " + JSON.stringify(silentPath),
              { encoding: "utf-8", timeout: 10000, stdio: "pipe" });
            results.push({ filePath: silentPath, durationSec: event.duration, startTime: cumulativeOffset + event.startTime, eventType: event.type });
            break;
          }
          const narr = await generateNarration(event.content, outputDir, label, event.voice);
          results.push({ filePath: narr.filePath, durationSec: narr.durationSec, startTime: cumulativeOffset + event.startTime, eventType: event.type });
          break;
        }
        case "sfx": {
          const sfx = await generateSFX(event.content, event.duration, outputDir, label);
          results.push({ filePath: sfx.filePath, durationSec: sfx.durationSec, startTime: cumulativeOffset + event.startTime, eventType: event.type });
          break;
        }
        case "music": {
          const musicPath = path.join(outputDir, label + ".wav");
          const freq = event.content.toLowerCase().includes("tense") ? 220 : event.content.toLowerCase().includes("upbeat") ? 440 : 330;
          try {
            execSync(
              "ffmpeg -y -f lavfi -i sine=frequency=" + freq + ":duration=" + event.duration + " -af 'volume=0.15,lowpass=f=2000' " + JSON.stringify(musicPath),
              { encoding: "utf-8", timeout: 30000, stdio: "pipe" }
            );
          } catch {
            execSync("ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t " + event.duration + " " + JSON.stringify(musicPath),
              { encoding: "utf-8", timeout: 10000, stdio: "pipe" });
          }
          results.push({ filePath: musicPath, durationSec: event.duration, startTime: cumulativeOffset + event.startTime, eventType: "music" });
          break;
        }
        case "camera_move":
          break;
      }
    } catch (err: any) {
      console.log("[AUDIO] Event " + label + " failed: " + err.message?.slice(0, 200));
    }
    eventIdx++;
  }

  return results;
}

export function detectSFXTypes(environment: string, actions: string): string[] {
  const text = (environment + " " + actions).toLowerCase();
  const sfx: string[] = [];
  if (text.includes("rain")) sfx.push("rain");
  if (text.includes("thunder") || text.includes("lightning") || text.includes("storm")) sfx.push("thunder");
  if (text.includes("wind") || text.includes("breeze")) sfx.push("wind");
  if (text.includes("ocean") || text.includes("waves") || text.includes("sea")) sfx.push("ocean");
  if (text.includes("footstep") || text.includes("running") || text.includes("walking") || text.includes("run") || text.includes("walk")) sfx.push("footsteps");
  return sfx;
}
`,
    },
    {
      path: "lib/stitcher.ts",
      content: `import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { AudioResult } from "./audio-provider";

export interface StitchInput {
  clipPath: string;
  audioTracks: { path: string; startTime: number; volume?: number }[];
  duration: number;
}

export async function stitchVideo(
  scenes: StitchInput[],
  outputDir: string,
  projectTitle: string
): Promise<string> {
  if (scenes.length === 0) throw new Error("No scenes to stitch");

  const outputPath = path.join(outputDir, "final_output.mp4");
  const concatListPath = path.join(outputDir, "concat_list.txt");

  const entries = scenes.map((s) => "file '" + s.clipPath.replace(/'/g, "'\\\\''") + "'").join("\\n");
  fs.writeFileSync(concatListPath, entries, "utf-8");

  console.log("[STITCH] Concatenating " + scenes.length + " clips with H.264 re-encode...");

  const H264_OPTS = "-c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart";

  try {
    execSync(
      "ffmpeg -y -f concat -safe 0 -i " + JSON.stringify(concatListPath) + " " + H264_OPTS + " " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
      { encoding: "utf-8", timeout: 300000, stdio: "pipe" }
    );
  } catch (err: any) {
    console.log("[STITCH] H.264 concat failed, trying simpler encode:", err.stderr?.slice(0, 300) || err.message?.slice(0, 300));
    try {
      execSync(
        "ffmpeg -y -f concat -safe 0 -i " + JSON.stringify(concatListPath) + " -c:v libx264 -pix_fmt yuv420p -movflags +faststart " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
        { encoding: "utf-8", timeout: 300000, stdio: "pipe" }
      );
    } catch (err2: any) {
      execSync(
        "ffmpeg -y -f concat -safe 0 -i " + JSON.stringify(concatListPath) + " -pix_fmt yuv420p " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
        { encoding: "utf-8", timeout: 300000, stdio: "pipe" }
      );
    }
  }

  try {
    const probeResult = execSync(
      "ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt,duration -of json " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
      { encoding: "utf-8", timeout: 10000, stdio: "pipe" }
    );
    console.log("[STITCH] Video probe:", probeResult.trim().slice(0, 500));
  } catch {}

  const allAudio = scenes.flatMap(s => s.audioTracks);
  if (allAudio.length > 0) {
    let filterComplex = "";
    const audioInputs: string[] = [];
    for (let i = 0; i < allAudio.length; i++) {
      const vol = allAudio[i].volume ?? 0.5;
      audioInputs.push("-i " + JSON.stringify(allAudio[i].path));
      filterComplex += "[" + (i + 1) + ":a]adelay=" + Math.round(allAudio[i].startTime * 1000) + "|" + Math.round(allAudio[i].startTime * 1000) + ",volume=" + vol.toFixed(2) + "[a" + i + "];";
    }
    const mixInputs = allAudio.map((_, i) => "[a" + i + "]").join("");
    filterComplex += mixInputs + "amix=inputs=" + allAudio.length + ":duration=longest[aout]";

    const cmd = "ffmpeg -y -i " + JSON.stringify(path.join(outputDir, "video_only.mp4")) + " " +
      audioInputs.join(" ") + " -filter_complex " + JSON.stringify(filterComplex) +
      " -map 0:v -map [aout] " + H264_OPTS + " -c:a aac -b:a 128k -shortest " + JSON.stringify(outputPath);

    try {
      execSync(cmd, { encoding: "utf-8", timeout: 300000, stdio: "pipe" });
    } catch (err: any) {
      console.log("[STITCH] Audio mix failed, using video-only output:", err.message?.slice(0, 200));
      fs.copyFileSync(path.join(outputDir, "video_only.mp4"), outputPath);
    }
  } else {
    fs.copyFileSync(path.join(outputDir, "video_only.mp4"), outputPath);
  }

  try {
    const finalProbe = execSync(
      "ffprobe -v error -show_format -show_streams " + JSON.stringify(outputPath),
      { encoding: "utf-8", timeout: 10000, stdio: "pipe" }
    );
    console.log("[STITCH] Final output probe:", finalProbe.trim().slice(0, 800));
  } catch {}

  console.log("[STITCH] Final output: " + outputPath);
  return outputPath;
}

export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed: " + res.status);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
`,
    },
    {
      path: "lib/pipeline.ts",
      content: `import { prisma } from "./prisma";
import { generateVideoClip, isVideoProviderConfigured } from "./video-provider";
import { processTimelineEvents, generateSFX, detectSFXTypes } from "./audio-provider";
import type { AudioResult } from "./audio-provider";
import { validateTimelineEvents } from "./scene-contract";
import type { TimelineEvent } from "./scene-contract";
import { stitchVideo, downloadFile } from "./stitcher";
import type { StitchInput } from "./stitcher";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const OUTPUT_ROOT = process.env.OUTPUT_DIR || "/tmp/videogen";
const MAX_CONCURRENT = 2;

function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

function checkProductionRequirements(): void {
  const missing: string[] = [];
  if (!process.env.REPLICATE_API_TOKEN) missing.push("REPLICATE_API_TOKEN (video generation via Replicate)");
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    missing.push("OPENAI_API_KEY or ANTHROPIC_API_KEY (script parsing)");
  }

  if (missing.length > 0 && !isDemoMode()) {
    throw new Error(
      "PRODUCTION SETUP REQUIRED\\n" +
      "The following API keys are missing:\\n" +
      missing.map(m => "  - " + m).join("\\n") + "\\n\\n" +
      "To configure production mode, set these environment variables in your deployment.\\n" +
      "For development/testing only, set DEMO_MODE=true to enable placeholder mode.\\n\\n" +
      "Documentation: https://docs.videogen.app/setup"
    );
  }
}

async function pipeLog(projectId: string, jobId: string, stage: string, msg: string, level?: string) {
  console.log("[PIPELINE][" + stage + "] " + msg);
  await prisma.pipelineLog.create({ data: { jobId, level: level || "INFO", message: "[" + stage + "] " + msg } }).catch(() => {});
}

export async function runPipeline(projectId: string): Promise<void> {
  checkProductionRequirements();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { index: "asc" } } },
  });
  if (!project) throw new Error("Project not found: " + projectId);

  const workDir = path.join(OUTPUT_ROOT, projectId);
  fs.mkdirSync(workDir, { recursive: true });
  const clipsDir = path.join(workDir, "clips");
  const audioDir = path.join(workDir, "audio");
  fs.mkdirSync(clipsDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const genJob = await prisma.pipelineJob.create({
    data: { projectId, stage: "generate_clips", status: "running", startedAt: new Date() },
  });

  try {
    const mode = isDemoMode() ? "DEMO" : "PRODUCTION";
    await pipeLog(projectId, genJob.id, "generate_clips", "Pipeline mode: " + mode + " | Video provider: " + (isVideoProviderConfigured() ? "Replicate" : "FFmpeg placeholder"));

    const scenes = project.scenes;
    for (let i = 0; i < scenes.length; i += MAX_CONCURRENT) {
      const batch = scenes.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map(async (scene) => {
        try {
          await prisma.scene.update({ where: { id: scene.id }, data: { status: "generating" } });
          let clipPath: string;

          const events: TimelineEvent[] = validateTimelineEvents(
            JSON.parse(scene.timelineJson || "[]")
          );
          const cameraEvents = events.filter(e => e.type === "camera_move");
          const cameraHint = cameraEvents.length > 0
            ? cameraEvents.map(e => e.content).join(", ")
            : scene.cameraCue;

          if (isVideoProviderConfigured()) {
            const result = await generateVideoClip(
              scene.description, scene.environment, scene.mood, cameraHint, scene.duration
            );
            clipPath = path.join(clipsDir, "scene_" + scene.index + ".mp4");
            await downloadFile(result.url, clipPath);
            await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " clip generated from Replicate (events: " + events.length + ")");
          } else {
            clipPath = path.join(clipsDir, "scene_" + scene.index + ".mp4");
            const demoColors = ["0x1e40af", "0x0e7490", "0x7e22ce", "0xb45309", "0x15803d", "0xbe185d", "0x0369a1", "0x4338ca"];
            const bgColor = demoColors[scene.index % demoColors.length];
            const safeDesc = scene.description.slice(0, 40).replace(/[^a-zA-Z0-9 .,!?-]/g, "").replace(/'/g, "");
            const fontPath = "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf";
            const vfFilter = "drawtext=fontfile=" + fontPath +
              ":text='Scene " + (scene.index + 1) + "':fontsize=56:fontcolor=white:x=(w-text_w)/2:y=h/4-30" +
              ",drawtext=fontfile=" + fontPath +
              ":text='" + safeDesc + "':fontsize=28:fontcolor=white@0.85:x=(w-text_w)/2:y=h/2" +
              ",drawtext=fontfile=" + fontPath.replace("-Bold", "") +
              ":text='DEMO MODE':fontsize=22:fontcolor=white@0.35:x=(w-text_w)/2:y=3*h/4+20";
            try {
              execSync(
                "ffmpeg -y -f lavfi -i color=c=" + bgColor + ":s=1280x720:d=" + scene.duration +
                " -vf " + JSON.stringify(vfFilter) +
                " -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart -t " + scene.duration +
                " " + JSON.stringify(clipPath),
                { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
              );
            } catch (ffErr: any) {
              console.log("[CLIP] drawtext failed, trying plain color:", ffErr.stderr?.slice(0, 300) || "");
              try {
                execSync(
                  "ffmpeg -y -f lavfi -i color=c=" + bgColor + ":s=1280x720:d=" + scene.duration +
                  " -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart -t " + scene.duration +
                  " " + JSON.stringify(clipPath),
                  { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
                );
              } catch (ffErr2: any) {
                execSync(
                  "ffmpeg -y -f lavfi -i color=c=" + bgColor + ":s=1280x720:d=" + scene.duration +
                  " -pix_fmt yuv420p -t " + scene.duration +
                  " " + JSON.stringify(clipPath),
                  { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
                );
              }
            }
            try {
              const probe = execSync(
                "ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt -of csv=p=0 " + JSON.stringify(clipPath),
                { encoding: "utf-8", timeout: 10000, stdio: "pipe" }
              ).trim();
              await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " clip validated: " + probe);
            } catch {}
            await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " demo clip generated (color=" + bgColor + ", events: " + events.length + ")");
          }

          await prisma.scene.update({
            where: { id: scene.id },
            data: { status: "complete", clipUrl: clipPath },
          });

          const progress = Math.round(((i + batch.indexOf(scene) + 1) / scenes.length) * 100);
          await prisma.pipelineJob.update({ where: { id: genJob.id }, data: { progress } });
        } catch (err: any) {
          await prisma.scene.update({ where: { id: scene.id }, data: { status: "failed", error: err.message?.slice(0, 500) } });
          await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " FAILED: " + err.message?.slice(0, 200), "ERROR");
        }
      }));
    }

    await prisma.pipelineJob.update({
      where: { id: genJob.id },
      data: { status: "complete", progress: 100, completedAt: new Date() },
    });
  } catch (err: any) {
    await prisma.pipelineJob.update({
      where: { id: genJob.id },
      data: { status: "failed", error: err.message?.slice(0, 500), completedAt: new Date() },
    });
    throw err;
  }

  const audioJob = await prisma.pipelineJob.create({
    data: { projectId, stage: "generate_audio", status: "running", startedAt: new Date() },
  });
  try {
    const updatedScenes = await prisma.scene.findMany({
      where: { projectId, status: "complete" },
      orderBy: { index: "asc" },
    });
    let cumulativeTime = 0;
    let totalAudioTracks = 0;

    for (const scene of updatedScenes) {
      const events: TimelineEvent[] = validateTimelineEvents(
        JSON.parse(scene.timelineJson || "[]")
      );

      if (events.length > 0) {
        const audioResults = await processTimelineEvents(events, scene.index, audioDir, cumulativeTime);
        for (const ar of audioResults) {
          await prisma.audioTrack.create({
            data: {
              sceneId: scene.id, type: ar.eventType, label: ar.eventType + "_" + scene.index,
              url: ar.filePath, startTime: ar.startTime, duration: ar.durationSec, status: "complete",
            },
          });
          totalAudioTracks++;
        }
        await pipeLog(projectId, audioJob.id, "audio", "Scene " + scene.index + ": " + audioResults.length + " audio tracks from " + events.length + " timeline events");
      } else {
        const sfxTypes = detectSFXTypes(scene.environment, scene.actions);
        for (const sfxType of sfxTypes) {
          try {
            const result = await generateSFX(sfxType, Math.min(scene.duration, 5), audioDir, "sfx_" + scene.index + "_" + sfxType);
            await prisma.audioTrack.create({
              data: {
                sceneId: scene.id, type: "sfx", label: sfxType,
                url: result.filePath, startTime: cumulativeTime, duration: result.durationSec, status: "complete",
              },
            });
            totalAudioTracks++;
          } catch (err: any) {
            await pipeLog(projectId, audioJob.id, "audio", "SFX " + sfxType + " for scene " + scene.index + " failed: " + err.message?.slice(0, 100), "WARN");
          }
        }
      }
      cumulativeTime += scene.duration;
    }

    await pipeLog(projectId, audioJob.id, "audio", "Total audio tracks generated: " + totalAudioTracks);
    await prisma.pipelineJob.update({
      where: { id: audioJob.id },
      data: { status: "complete", progress: 100, completedAt: new Date() },
    });
  } catch (err: any) {
    await prisma.pipelineJob.update({
      where: { id: audioJob.id },
      data: { status: "failed", error: err.message?.slice(0, 500), completedAt: new Date() },
    });
  }

  const stitchJob = await prisma.pipelineJob.create({
    data: { projectId, stage: "stitch", status: "running", startedAt: new Date() },
  });
  try {
    await prisma.project.update({ where: { id: projectId }, data: { status: "stitching" } });
    const completedScenes = await prisma.scene.findMany({
      where: { projectId, status: "complete" },
      orderBy: { index: "asc" },
      include: { audioTracks: { where: { status: "complete" } } },
    });

    if (completedScenes.length === 0) {
      throw new Error("No completed scene clips to stitch");
    }

    let cumulativeTime = 0;
    const stitchInputs: StitchInput[] = completedScenes.map((scene) => {
      const input: StitchInput = {
        clipPath: scene.clipUrl!,
        audioTracks: scene.audioTracks.map(at => ({
          path: at.url!,
          startTime: at.startTime,
          volume: 0.5,
        })),
        duration: scene.duration,
      };
      cumulativeTime += scene.duration;
      return input;
    });

    await pipeLog(projectId, stitchJob.id, "stitch", "Stitching " + completedScenes.length + " scenes (" + stitchInputs.reduce((n, s) => n + s.audioTracks.length, 0) + " audio tracks)...");
    const outputPath = await stitchVideo(stitchInputs, workDir, project.title);

    await prisma.project.update({ where: { id: projectId }, data: { status: "complete", outputUrl: outputPath } });
    await prisma.pipelineJob.update({
      where: { id: stitchJob.id },
      data: { status: "complete", progress: 100, completedAt: new Date() },
    });
    await pipeLog(projectId, stitchJob.id, "stitch", "Pipeline complete. Output: " + outputPath);
  } catch (err: any) {
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await prisma.pipelineJob.update({
      where: { id: stitchJob.id },
      data: { status: "failed", error: err.message?.slice(0, 500), completedAt: new Date() },
    });
    throw err;
  }
}
`,
    },
  ];
}

function getPackageJson(): Record<string, unknown> {
  return {
    name: "ai-video-generator-saas",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && prisma db push --accept-data-loss && next build",
      start: "next start",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
      "@prisma/client": "^5.22.0",
    },
    devDependencies: {
      prisma: "^5.22.0",
      typescript: "^5.4.0",
      tailwindcss: "^3.4.0",
      postcss: "^8.4.0",
      autoprefixer: "^10.4.0",
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
    },
  };
}

export const aiVideoGeneratorSaasTemplate: TemplateDefinition = {
  key: "ai-video-generator-saas",
  name: "AI Video Generator",
  description:
    "A script-to-video generator with realistic cinematic output, scene breakdown, audio mixing, and FFmpeg stitching",
  keywords: [
    "video",
    "video generator",
    "video generation",
    "script to video",
    "text to video",
    "cinematic",
    "movie maker",
    "film",
    "clip",
    "render",
    "ffmpeg",
    "video editing",
    "mp4",
    "scene",
    "animation",
    "video creator",
    "video app",
    "video saas",
    "video pipeline",
    "stitch",
    "voiceover",
    "tts",
  ],
  requiredModules: ["next", "react", "@prisma/client", "prisma"],
  requiredRoutes: [
    "/api/health",
    "/api/db-check",
    "/api/ai-status",
    "/api/projects",
    "/api/projects/[id]",
    "/api/projects/[id]/parse",
    "/api/projects/[id]/generate",
    "/api/projects/[id]/status",
    "/api/projects/[id]/download",
  ],
  requiredEntities: ["User", "Project", "Scene", "AudioTrack", "CharacterRef", "PipelineJob", "PipelineLog"],
  getFiles,
  getPackageJson,
};
