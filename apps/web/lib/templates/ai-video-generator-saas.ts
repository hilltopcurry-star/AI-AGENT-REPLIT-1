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
`,
    },
    {
      path: ".nvmrc",
      content: "20\n",
    },
    {
      path: "system-deps.json",
      content: JSON.stringify({ apk: ["ffmpeg"] }, null, 2) + "\n",
    },
    {
      path: "tailwind.config.ts",
      content: `import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
export default config;
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
  --bg: #0a0a0f;
  --surface: #13131a;
  --surface2: #1c1c27;
  --border: #2a2a3a;
  --text: #e4e4ef;
  --text2: #9999aa;
  --accent: #6366f1;
  --accent2: #818cf8;
  --success: #22c55e;
  --error: #ef4444;
  --warn: #f59e0b;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI Video Generator",
  description: "Script-to-video generator with realistic cinematic output",
  other: { "template-key": "ai-video-generator-saas" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><meta name="template-key" content="ai-video-generator-saas" /></head>
      <body className="min-h-screen" style={{ background: "#0a0a0f", color: "#e4e4ef" }}>
        {children}
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

export default async function Home() {
  const projects = await getProjects();
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }} data-testid="text-page-title">AI Video Generator</h1>
        <a href="/new" data-testid="link-new-project" style={{ background: "#6366f1", color: "#fff", padding: "10px 20px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
          + New Project
        </a>
      </div>
      {projects.length === 0 ? (
        <p style={{ color: "#9999aa" }} data-testid="text-empty-state">No projects yet. Create one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((p) => (
            <Link key={p.id} href={"/" + "project/" + p.id} data-testid={"card-project-" + p.id}
              style={{ display: "block", background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 10, padding: 20, textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{p.title}</div>
                  <div style={{ color: "#9999aa", fontSize: 13, marginTop: 4 }}>
                    {p.scenes.length} scenes &middot; {p.status}
                  </div>
                </div>
                <span style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: p.status === "complete" ? "#22c55e22" : p.status === "failed" ? "#ef444422" : "#f59e0b22",
                  color: p.status === "complete" ? "#22c55e" : p.status === "failed" ? "#ef4444" : "#f59e0b",
                }} data-testid={"status-project-" + p.id}>
                  {p.status}
                </span>
              </div>
            </Link>
          ))}
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
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>New Video Project</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Project Title</label>
          <input data-testid="input-title" value={title} onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: 10, background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 8, color: "#e4e4ef", fontSize: 14 }}
            placeholder="e.g. Rain Chase Scene" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Script</label>
          <textarea data-testid="input-script" value={script} onChange={(e) => setScript(e.target.value)}
            rows={12} style={{ width: "100%", padding: 10, background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 8, color: "#e4e4ef", fontSize: 14, resize: "vertical" }}
            placeholder="Write your detailed script here. Include environment descriptions, character actions, camera cues, sound effects..." />
        </div>
        {error && <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>}
        <button data-testid="button-create" type="submit" disabled={loading}
          style={{ background: "#6366f1", color: "#fff", padding: "12px 28px", borderRadius: 8, fontWeight: 600, border: "none", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Creating..." : "Create Project"}
        </button>
      </form>
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

interface Scene {
  id: string; index: number; description: string; environment: string;
  characters: string; actions: string; cameraCue: string; mood: string;
  duration: number; clipUrl: string | null; status: string; error: string | null;
}
interface ProjectData {
  id: string; title: string; script: string; status: string;
  outputUrl: string | null; totalScenes: number;
  scenes: Scene[];
  pipelineJobs: { id: string; stage: string; status: string; progress: number; error: string | null }[];
}

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/projects/" + id);
    if (res.ok) setProject(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [load]);

  async function doAction(action: string) {
    setActionLoading(action);
    try {
      const res = await fetch("/api/projects/" + id + "/" + action, { method: "POST" });
      if (!res.ok) { const t = await res.text(); alert("Error: " + t); }
      await load();
    } finally { setActionLoading(""); }
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;
  if (!project) return <div style={{ padding: 32, textAlign: "center", color: "#ef4444" }}>Project not found</div>;

  const progress = project.scenes.length > 0
    ? Math.round((project.scenes.filter(s => s.status === "complete").length / project.scenes.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ color: "#6366f1", textDecoration: "none", fontSize: 14 }}>&larr; All Projects</a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }} data-testid="text-project-title">{project.title}</h1>
          <span data-testid="text-project-status" style={{
            display: "inline-block", marginTop: 8, padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: project.status === "complete" ? "#22c55e22" : project.status === "failed" ? "#ef444422" : "#f59e0b22",
            color: project.status === "complete" ? "#22c55e" : project.status === "failed" ? "#ef4444" : "#f59e0b",
          }}>{project.status}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {project.status === "draft" && (
            <button data-testid="button-parse" onClick={() => doAction("parse")} disabled={!!actionLoading}
              style={{ background: "#6366f1", color: "#fff", padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer" }}>
              {actionLoading === "parse" ? "Parsing..." : "Parse Script"}
            </button>
          )}
          {project.status === "parsed" && (
            <button data-testid="button-generate" onClick={() => doAction("generate")} disabled={!!actionLoading}
              style={{ background: "#22c55e", color: "#fff", padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer" }}>
              {actionLoading === "generate" ? "Starting..." : "Generate Video"}
            </button>
          )}
          {project.status === "complete" && project.outputUrl && (
            <a data-testid="link-download" href={"/api/projects/" + id + "/download"}
              style={{ background: "#6366f1", color: "#fff", padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
              Download MP4
            </a>
          )}
        </div>
      </div>

      {(project.status === "generating" || project.status === "stitching") && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Pipeline Progress</span>
            <span data-testid="text-progress">{progress}%</span>
          </div>
          <div style={{ background: "#1c1c27", borderRadius: 8, height: 8, overflow: "hidden" }}>
            <div style={{ background: "#6366f1", height: "100%", width: progress + "%", transition: "width 0.5s", borderRadius: 8 }} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Script</h2>
        <pre data-testid="text-script" style={{ background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 10, padding: 16, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 200, overflow: "auto", color: "#9999aa" }}>
          {project.script}
        </pre>
      </div>

      {project.scenes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Scenes ({project.scenes.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {project.scenes.sort((a, b) => a.index - b.index).map((scene) => (
              <div key={scene.id} data-testid={"card-scene-" + scene.index}
                style={{ background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Scene {scene.index + 1}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: scene.status === "complete" ? "#22c55e22" : scene.status === "failed" ? "#ef444422" : "#1c1c27",
                    color: scene.status === "complete" ? "#22c55e" : scene.status === "failed" ? "#ef4444" : "#9999aa",
                  }}>{scene.status}</span>
                </div>
                <div style={{ fontSize: 13, color: "#9999aa", lineHeight: 1.5 }}>
                  <div><strong>Environment:</strong> {scene.environment}</div>
                  <div><strong>Characters:</strong> {scene.characters}</div>
                  <div><strong>Actions:</strong> {scene.actions}</div>
                  <div><strong>Camera:</strong> {scene.cameraCue}</div>
                  <div><strong>Mood:</strong> {scene.mood}</div>
                  <div><strong>Duration:</strong> {scene.duration}s</div>
                  {scene.error && <div style={{ color: "#ef4444", marginTop: 4 }}>{scene.error}</div>}
                  {scene.clipUrl && (
                    <video controls style={{ width: "100%", marginTop: 8, borderRadius: 8 }} src={scene.clipUrl} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.pipelineJobs.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Pipeline Jobs</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {project.pipelineJobs.map((job) => (
              <div key={job.id} data-testid={"row-job-" + job.stage}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{job.stage}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: "#9999aa" }}>{Math.round(job.progress)}%</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: job.status === "complete" ? "#22c55e22" : job.status === "failed" ? "#ef444422" : "#f59e0b22",
                    color: job.status === "complete" ? "#22c55e" : job.status === "failed" ? "#ef4444" : "#f59e0b",
                  }}>{job.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.status === "complete" && project.outputUrl && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Final Output</h2>
          <video data-testid="video-output" controls style={{ width: "100%", borderRadius: 10, background: "#000" }}
            src={"/api/projects/" + project.id + "/download"} />
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
      path: "app/api/health/route.ts",
      content: `import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: true });
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
  return NextResponse.json({
    scriptParser: anthropicKey ? "configured" : (openaiKey ? "configured" : "missing"),
    scriptParserProvider: anthropicKey ? "anthropic" : (openaiKey ? "openai" : "none"),
    videoProvider: replicateToken ? "configured" : "missing",
    videoModel,
    videoStyle,
    tts: openaiKey ? "configured" : "missing",
    realisticMode: true,
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
  await prisma.project.update({ where: { id }, data: { status: "generating" } });
  runPipeline(id).catch(async (err) => {
    console.error("[PIPELINE] Fatal error:", err);
    await prisma.project.update({ where: { id }, data: { status: "failed" } }).catch(() => {});
  });
  return NextResponse.json({ ok: true, message: "Pipeline started" });
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
      stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
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
      content: `export interface ParsedScene {
  description: string;
  environment: string;
  characters: string;
  actions: string;
  cameraCue: string;
  mood: string;
  duration: number;
}

export async function parseScript(script: string): Promise<ParsedScene[]> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = "You are a professional film script analyst. Parse the given script into individual scenes. For each scene, extract: description (1-2 sentence summary), environment (weather, location, time of day), characters (who appears), actions (what happens), cameraCue (camera movement/angle), mood (lighting and emotional tone), duration (estimated seconds, 4-10s per scene). Return ONLY a valid JSON array of scene objects with exactly these keys: description, environment, characters, actions, cameraCue, mood, duration. No markdown, no explanation, just the JSON array.";

  const userPrompt = "Parse this script into scenes:\\n\\n" + script;

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
        max_tokens: 4096,
        system: systemPrompt,
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
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        max_tokens: 4096,
      }),
    });
    if (!res.ok) throw new Error("OpenAI API error: " + res.status);
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || "";
  } else {
    throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
  }

  const jsonMatch = responseText.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON scene array. Response: " + responseText.slice(0, 300));

  const scenes: ParsedScene[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("Parsed 0 scenes from script");

  return scenes.map((s: any) => ({
    description: String(s.description || ""),
    environment: String(s.environment || ""),
    characters: String(s.characters || ""),
    actions: String(s.actions || ""),
    cameraCue: String(s.cameraCue || s.camera_cue || "static"),
    mood: String(s.mood || "neutral"),
    duration: Number(s.duration) || 5,
  }));
}
`,
    },
    {
      path: "lib/video-provider.ts",
      content: `import Replicate from "replicate";

const STYLE = process.env.VIDEO_STYLE || "photorealistic cinematic";
const MODEL = process.env.VIDEO_MODEL || "minimax/video-01-live";

export interface VideoGenResult {
  url: string;
  durationSec: number;
}

export function isVideoProviderConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
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

  const replicate = new Replicate({ auth: token });

  const prompt = [
    STYLE + " footage.",
    "Scene: " + sceneDescription,
    "Environment: " + environment,
    "Mood/Lighting: " + mood,
    "Camera: " + cameraCue,
    "Style: realistic, cinematic, NOT cartoon, NOT anime, NOT stylized.",
  ].join(" ");

  console.log("[VIDEO] Generating clip with model=" + MODEL + " prompt=" + prompt.slice(0, 120) + "...");

  const output = await replicate.run(MODEL as any, {
    input: {
      prompt,
      num_frames: Math.min(Math.max(Math.round(durationHint * 8), 32), 80),
    },
  });

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

export interface AudioResult {
  filePath: string;
  durationSec: number;
}

export async function generateNarration(text: string, outputDir: string, label: string): Promise<AudioResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured for TTS");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: "onyx",
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

export async function generateSFX(type: string, durationSec: number, outputDir: string, label: string): Promise<AudioResult> {
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

export function detectSFXTypes(environment: string, actions: string): string[] {
  const text = (environment + " " + actions).toLowerCase();
  const sfx: string[] = [];
  if (text.includes("rain")) sfx.push("rain");
  if (text.includes("thunder") || text.includes("lightning") || text.includes("storm")) sfx.push("thunder");
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

export interface StitchInput {
  clipPath: string;
  audioTracks: { path: string; startTime: number }[];
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

  const entries = scenes.map((s) => "file " + JSON.stringify(s.clipPath)).join("\\n");
  fs.writeFileSync(concatListPath, entries, "utf-8");

  console.log("[STITCH] Concatenating " + scenes.length + " clips...");

  try {
    execSync(
      "ffmpeg -y -f concat -safe 0 -i " + JSON.stringify(concatListPath) + " -c copy " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
      { encoding: "utf-8", timeout: 300000, stdio: "pipe" }
    );
  } catch (err: any) {
    execSync(
      "ffmpeg -y -f concat -safe 0 -i " + JSON.stringify(concatListPath) + " -c:v libx264 -preset fast -crf 23 " + JSON.stringify(path.join(outputDir, "video_only.mp4")),
      { encoding: "utf-8", timeout: 300000, stdio: "pipe" }
    );
  }

  const allAudio = scenes.flatMap(s => s.audioTracks);
  if (allAudio.length > 0) {
    let filterComplex = "";
    const audioInputs: string[] = [];
    for (let i = 0; i < allAudio.length; i++) {
      audioInputs.push("-i " + JSON.stringify(allAudio[i].path));
      filterComplex += "[" + (i + 1) + ":a]adelay=" + Math.round(allAudio[i].startTime * 1000) + "|" + Math.round(allAudio[i].startTime * 1000) + ",volume=0.5[a" + i + "];";
    }
    const mixInputs = allAudio.map((_, i) => "[a" + i + "]").join("");
    filterComplex += mixInputs + "amix=inputs=" + allAudio.length + ":duration=longest[aout]";

    const cmd = "ffmpeg -y -i " + JSON.stringify(path.join(outputDir, "video_only.mp4")) + " " +
      audioInputs.join(" ") + " -filter_complex " + JSON.stringify(filterComplex) +
      " -map 0:v -map [aout] -c:v copy -c:a aac -shortest " + JSON.stringify(outputPath);

    try {
      execSync(cmd, { encoding: "utf-8", timeout: 300000, stdio: "pipe" });
    } catch (err: any) {
      console.log("[STITCH] Audio mix failed, using video-only output:", err.message?.slice(0, 200));
      fs.copyFileSync(path.join(outputDir, "video_only.mp4"), outputPath);
    }
  } else {
    fs.copyFileSync(path.join(outputDir, "video_only.mp4"), outputPath);
  }

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
import { generateNarration, generateSFX, detectSFXTypes } from "./audio-provider";
import { stitchVideo, downloadFile } from "./stitcher";
import type { StitchInput } from "./stitcher";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_ROOT = process.env.OUTPUT_DIR || "/tmp/videogen";
const MAX_CONCURRENT = 2;

async function pipeLog(projectId: string, jobId: string, stage: string, msg: string) {
  console.log("[PIPELINE][" + stage + "] " + msg);
  await prisma.pipelineLog.create({ data: { jobId, level: "INFO", message: "[" + stage + "] " + msg } }).catch(() => {});
}

export async function runPipeline(projectId: string): Promise<void> {
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
    if (!isVideoProviderConfigured()) {
      await pipeLog(projectId, genJob.id, "generate_clips", "REPLICATE_API_TOKEN not set — generating placeholder clips with FFmpeg");
    }

    const scenes = project.scenes;
    for (let i = 0; i < scenes.length; i += MAX_CONCURRENT) {
      const batch = scenes.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map(async (scene) => {
        try {
          await prisma.scene.update({ where: { id: scene.id }, data: { status: "generating" } });
          let clipPath: string;

          if (isVideoProviderConfigured()) {
            const result = await generateVideoClip(
              scene.description, scene.environment, scene.mood, scene.cameraCue, scene.duration
            );
            clipPath = path.join(clipsDir, "scene_" + scene.index + ".mp4");
            await downloadFile(result.url, clipPath);
            await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " clip generated from Replicate");
          } else {
            clipPath = path.join(clipsDir, "scene_" + scene.index + ".mp4");
            const { execSync } = require("child_process");
            const label = "Scene " + (scene.index + 1) + ": " + scene.description.slice(0, 60).replace(/'/g, "");
            execSync(
              "ffmpeg -y -f lavfi -i color=c=0x1a1a2e:s=1280x720:d=" + scene.duration +
              " -f lavfi -i anullsrc=r=44100:cl=mono -t " + scene.duration +
              " -vf \\"drawtext=text='" + label + "':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2\\"" +
              " -c:v libx264 -preset ultrafast -c:a aac -shortest " + JSON.stringify(clipPath),
              { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
            );
            await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " placeholder clip generated (no REPLICATE_API_TOKEN)");
          }

          await prisma.scene.update({
            where: { id: scene.id },
            data: { status: "complete", clipUrl: clipPath },
          });

          const progress = Math.round(((i + batch.indexOf(scene) + 1) / scenes.length) * 100);
          await prisma.pipelineJob.update({ where: { id: genJob.id }, data: { progress } });
        } catch (err: any) {
          await prisma.scene.update({ where: { id: scene.id }, data: { status: "failed", error: err.message?.slice(0, 500) } });
          await pipeLog(projectId, genJob.id, "generate_clips", "Scene " + scene.index + " FAILED: " + err.message?.slice(0, 200));
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
    for (const scene of updatedScenes) {
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
        } catch (err: any) {
          await pipeLog(projectId, audioJob.id, "audio", "SFX " + sfxType + " for scene " + scene.index + " failed: " + err.message?.slice(0, 100));
        }
      }
      cumulativeTime += scene.duration;
    }
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
        audioTracks: scene.audioTracks.map(at => ({ path: at.url!, startTime: cumulativeTime + at.startTime })),
        duration: scene.duration,
      };
      cumulativeTime += scene.duration;
      return input;
    });

    await pipeLog(projectId, stitchJob.id, "stitch", "Stitching " + completedScenes.length + " scenes...");
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
      replicate: "^1.0.0",
      openai: "^4.0.0",
    },
    devDependencies: {
      prisma: "^5.22.0",
      typescript: "^5.4.0",
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
  requiredModules: ["next", "react", "@prisma/client", "prisma", "replicate", "openai"],
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
