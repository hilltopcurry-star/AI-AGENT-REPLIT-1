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
  id        String    @id @default(cuid())
  email     String    @unique
  name      String?
  password  String
  createdAt DateTime  @default(now())
  projects  Project[]
  tasks     Task[]
  comments  Comment[]
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  status      String   @default("active")
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  tasks       Task[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Task {
  id          String    @id @default(cuid())
  title       String
  description String?
  status      String    @default("todo")
  priority    String    @default("medium")
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  assigneeId  String?
  assignee    User?     @relation(fields: [assigneeId], references: [id])
  comments    Comment[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Comment {
  id        String   @id @default(cuid())
  content   String
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}`,
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};
module.exports = nextConfig;
`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
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
        },
        null,
        2
      ),
    },
    {
      path: "app/globals.css",
      content: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8f9fa; color: #1a1a2e; line-height: 1.6;
}
.container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
.card {
  background: #ffffff; border: 1px solid #e0e0e0;
  border-radius: 12px; padding: 1.5rem;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 1rem; border-radius: 8px; border: none;
  font-weight: 600; cursor: pointer; font-size: 0.875rem;
  transition: all 0.2s;
}
.btn-primary { background: #4f46e5; color: white; }
.btn-primary:hover { background: #4338ca; }
.btn-secondary { background: #e5e7eb; color: #374151; }
.btn-secondary:hover { background: #d1d5db; }
.badge {
  display: inline-block; padding: 0.125rem 0.5rem;
  border-radius: 9999px; font-size: 0.75rem; font-weight: 600;
}
.badge-green { background: #dcfce7; color: #166534; }
.badge-yellow { background: #fef9c3; color: #854d0e; }
.badge-blue { background: #dbeafe; color: #1e40af; }
.badge-red { background: #fee2e2; color: #991b1b; }
nav {
  background: #ffffff; border-bottom: 1px solid #e0e0e0;
  padding: 1rem 0; margin-bottom: 2rem;
}
nav .container { display: flex; justify-content: space-between; align-items: center; }
nav a { color: #4f46e5; text-decoration: none; font-weight: 600; }
nav a:hover { text-decoration: underline; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
th { font-weight: 600; font-size: 0.875rem; color: #6b7280; }
input, textarea, select {
  width: 100%; padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 0.875rem;
}
label { display: block; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; }
.form-group { margin-bottom: 1rem; }
@media (prefers-color-scheme: dark) {
  body { background: #1a1a2e; color: #e8e8f0; }
  .card { background: #2a2a3e; border-color: #3a3a4e; box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
  nav { background: #2a2a3e; border-bottom-color: #3a3a4e; }
  input, textarea, select { background: #2a2a3e; border-color: #3a3a4e; color: #e8e8f0; }
  th { color: #9ca3af; }
  td { border-bottom-color: #3a3a4e; }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import './globals.css';

export const metadata = {
  title: 'Project Management SaaS',
  description: 'Manage your projects, tasks, and team collaboration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="ai-workspace-template" content="project-management-saas" />
      </head>
      <body>
        <nav>
          <div className="container">
            <a href="/" style={{ fontSize: '1.25rem' }}>ProjectHub</a>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <a href="/projects">Projects</a>
              <a href="/tasks">Tasks</a>
            </div>
          </div>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `export default function Home() {
  return (
    <main style={{ padding: '2rem 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>ProjectHub</h1>
        <p style={{ fontSize: '1.125rem', opacity: 0.7 }}>Manage projects, track tasks, collaborate with your team</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Projects</h3>
          <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.875rem' }}>Create and manage your projects with descriptions, status tracking, and team assignments.</p>
          <a href="/projects" className="btn btn-primary">View Projects</a>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Tasks</h3>
          <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.875rem' }}>Break down work into tasks with priorities, statuses, and assignees.</p>
          <a href="/tasks" className="btn btn-primary">View Tasks</a>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Collaboration</h3>
          <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.875rem' }}>Leave comments on tasks to keep your team aligned and informed.</p>
          <a href="/projects" className="btn btn-secondary">Get Started</a>
        </div>
      </div>
    </main>
  );
}
`,
    },
    {
      path: "app/projects/page.tsx",
      content: `import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  let projects: any[] = [];
  try {
    projects = await prisma.project.findMany({
      include: { user: true, _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'desc' },
    });
  } catch {}

  return (
    <main style={{ padding: '2rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Projects</h1>
        <a href="/projects/new" className="btn btn-primary">+ New Project</a>
      </div>
      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ opacity: 0.6 }}>No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {projects.map((p: any) => (
            <a href={\`/projects/\${p.id}\`} key={p.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ marginBottom: '0.25rem' }}>{p.name}</h3>
                  <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{p.description || 'No description'}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span className={\`badge \${p.status === 'active' ? 'badge-green' : 'badge-yellow'}\`}>{p.status}</span>
                  <span style={{ fontSize: '0.875rem', opacity: 0.6 }}>{p._count.tasks} tasks</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
`,
    },
    {
      path: "app/projects/new/page.tsx",
      content: `'use client';

import { useState } from 'react';

export default function NewProject() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      window.location.href = '/projects';
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: '2rem 0', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>New Project</h1>
      <form onSubmit={handleSubmit} className="card">
        {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
        <div className="form-group">
          <label htmlFor="name">Project Name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="My Project" />
        </div>
        <div className="form-group">
          <label htmlFor="desc">Description</label>
          <textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe your project..." />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </main>
  );
}
`,
    },
    {
      path: "app/tasks/page.tsx",
      content: `import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  let tasks: any[] = [];
  try {
    tasks = await prisma.task.findMany({
      include: { project: true, assignee: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: 'desc' },
    });
  } catch {}

  const statusColors: Record<string, string> = {
    todo: 'badge-blue',
    'in-progress': 'badge-yellow',
    done: 'badge-green',
    blocked: 'badge-red',
  };

  return (
    <main style={{ padding: '2rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>All Tasks</h1>
      </div>
      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ opacity: 0.6 }}>No tasks yet. Create a project and add tasks to it.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => (
                <tr key={t.id}>
                  <td><strong>{t.title}</strong></td>
                  <td style={{ opacity: 0.7 }}>{t.project?.name || '—'}</td>
                  <td><span className={\`badge \${statusColors[t.status] || 'badge-blue'}\`}>{t.status}</span></td>
                  <td style={{ opacity: 0.7 }}>{t.priority}</td>
                  <td style={{ opacity: 0.7 }}>{t._count.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
`,
    },
    {
      path: "app/api/health/route.ts",
      content: `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
`,
    },
    {
      path: "app/api/db-check/route.ts",
      content: `import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/projects/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: "demo@example.com", name: "Demo User", password: "demo" },
      });
    }

    const project = await prisma.project.create({
      data: { name, description: description || null, userId: user.id },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/projects/[projectId]/tasks/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveProjectId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.projectId;
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const projectId = await resolveProjectId(ctx);
    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: { comments: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tasks);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const projectId = await resolveProjectId(ctx);
    const body = await req.json();
    const { title, description, priority, status } = body;
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || "medium",
        status: status || "todo",
        projectId,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (e: any) {
    console.error("[TASKS POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/tasks/[taskId]/comments/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveTaskId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.taskId;
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const taskId = await resolveTaskId(ctx);
    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(comments);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const taskId = await resolveTaskId(ctx);
    const body = await req.json();
    const { content } = body;
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: "demo@example.com", name: "Demo User", password: "demo" },
      });
    }

    const comment = await prisma.comment.create({
      data: { content, taskId, userId: user.id },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (e: any) {
    console.error("[COMMENTS POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "lib/seed.ts",
      content: `import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: { email: "demo@example.com", name: "Demo User", password: "demo" },
  });

  const project = await prisma.project.create({
    data: {
      name: "Website Redesign",
      description: "Complete redesign of the company website with modern UI/UX",
      status: "active",
      userId: user.id,
    },
  });

  const tasks = await Promise.all([
    prisma.task.create({
      data: { title: "Design homepage mockup", status: "done", priority: "high", projectId: project.id },
    }),
    prisma.task.create({
      data: { title: "Implement responsive navbar", status: "in-progress", priority: "high", projectId: project.id },
    }),
    prisma.task.create({
      data: { title: "Set up CI/CD pipeline", status: "todo", priority: "medium", projectId: project.id },
    }),
    prisma.task.create({
      data: { title: "Write API documentation", status: "todo", priority: "low", projectId: project.id },
    }),
  ]);

  await prisma.comment.create({
    data: { content: "Looking great! Let's finalize the color palette.", taskId: tasks[0].id, userId: user.id },
  });

  await prisma.comment.create({
    data: { content: "Should we use a hamburger menu for mobile?", taskId: tasks[1].id, userId: user.id },
  });

  console.log("Seed data created successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
`,
    },
    {
      path: ".env",
      content: `DATABASE_URL="file:./prisma/dev.db"
`,
    },
  ];
}

function getPackageJson(): Record<string, unknown> {
  return {
    name: "project-management-saas",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && prisma db push --accept-data-loss && next build",
      start: "next start",
      seed: "tsx lib/seed.ts",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
      "@prisma/client": "^5.14.0",
    },
    devDependencies: {
      typescript: "^5.4.0",
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      prisma: "^5.14.0",
      tsx: "^4.0.0",
    },
  };
}

export const projectManagementSaasTemplate: TemplateDefinition = {
  key: "project-management-saas",
  name: "Project Management SaaS",
  description:
    "A full-featured project management app with projects, tasks, comments, and team collaboration",
  keywords: [
    "project management",
    "task",
    "tasks",
    "team",
    "collaboration",
    "kanban",
    "project tracker",
    "todo",
    "to-do",
    "sprint",
    "agile",
    "scrum",
    "board",
    "backlog",
    "milestone",
    "assign",
    "workflow",
  ],
  requiredModules: ["next", "react", "@prisma/client", "prisma"],
  requiredRoutes: [
    "/api/health",
    "/api/db-check",
    "/api/projects",
    "/api/projects/[projectId]/tasks",
    "/api/tasks/[taskId]/comments",
  ],
  requiredEntities: ["User", "Project", "Task", "Comment"],
  getFiles,
  getPackageJson,
};
