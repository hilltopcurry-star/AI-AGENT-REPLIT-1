import { prisma } from "./prisma";

export type AgentMode = "Discuss" | "Plan" | "Build" | "Improve" | "Debug";

interface AgentContext {
  mode: AgentMode;
  content: string;
  projectId: string;
  chatMessages: { role: string; content: string; mode: string }[];
}

const PLAN_QUESTIONS = [
  "What is the primary purpose of this application? (e.g., e-commerce, social media, dashboard)",
  "What are the key features you need in the MVP? Please list 3-5 core features.",
  "Do you have any technology preferences or constraints? (e.g., specific database, hosting requirements)",
];

const MOCK_PLAN = `## Project Plan

### Architecture
- **Frontend**: Next.js (App Router) + TypeScript + TailwindCSS
- **Backend**: Next.js route handlers (\`app/api/...\`)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with Google OAuth
- **Billing**: Stripe (test mode)

### Milestones

#### Phase 1: Foundation (Week 1-2)
- Project scaffolding with Next.js App Router
- Prisma schema design and \`prisma db push\`
- NextAuth.js + Google OAuth setup
- Core API route handlers (\`app/api/\`)

#### Phase 2: Core Features (Week 3-4)
- Page components and layouts (App Router)
- CRUD operations via Next.js route handlers
- Form validation with Zod
- React Query integration for data fetching

#### Phase 3: Polish (Week 5-6)
- Responsive design with TailwindCSS
- Stripe test-mode integration
- Error boundaries and loading states
- Deployment configuration

### Estimated Timeline: 6 weeks

Your plan is ready! Switch to **Build** mode and type exactly **"Build it"** to start the mock build simulation.`;

const BUILD_NEAR_MISS_PHRASES = [
  "build", "start building", "go ahead", "let's build", "begin build",
  "run build", "do it", "start it", "make it", "create it", "begin",
  "go", "execute", "run it", "launch", "deploy", "compile",
];

function generateBuildLogs(projectId: string, spec: Record<string, unknown> | null): { level: string; message: string }[] {
  const purpose = (spec?.purpose as string) || "application";
  const features = (spec?.features as string) || "not specified";
  const techPrefs = (spec?.techPreferences as string) || "default";
  const shortId = projectId.slice(0, 8);
  const idLabel = `${shortId} (${projectId})`;

  return [
    { level: "INFO", message: `[MOCK] Build simulation started for project ${idLabel}` },
    { level: "INFO", message: `[MOCK] Project purpose: ${purpose}` },
    { level: "INFO", message: `[MOCK] Features: ${features}` },
    { level: "INFO", message: `[MOCK] Tech preferences: ${techPrefs}` },
    { level: "INFO", message: "[MOCK] Step 1/5: Would validate environment variables (DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID)" },
    { level: "SUCCESS", message: "[MOCK] Step 1/5: Environment validation simulated" },
    { level: "INFO", message: "[MOCK] Step 2/5: Would run `npm install` to resolve dependencies" },
    { level: "INFO", message: "[MOCK] Step 2/5: Would install: next, react, prisma, next-auth, tailwindcss, stripe" },
    { level: "SUCCESS", message: "[MOCK] Step 2/5: Dependency installation simulated" },
    { level: "INFO", message: "[MOCK] Step 3/5: Would generate Prisma schema from specJson" },
    { level: "INFO", message: "[MOCK] Step 3/5: Would run `prisma db push` to sync schema to PostgreSQL" },
    { level: "SUCCESS", message: "[MOCK] Step 3/5: Database schema generation simulated" },
    { level: "INFO", message: "[MOCK] Step 4/5: Would scaffold Next.js App Router pages and API route handlers" },
    { level: "INFO", message: "[MOCK] Step 4/5: Would generate UI components with TailwindCSS" },
    { level: "INFO", message: "[MOCK] Step 4/5: Would configure NextAuth.js Google OAuth provider" },
    { level: "SUCCESS", message: "[MOCK] Step 4/5: Code scaffolding simulated" },
    { level: "INFO", message: "[MOCK] Step 5/5: Would run `next build` to compile TypeScript and bundle assets" },
    { level: "SUCCESS", message: "[MOCK] Step 5/5: Build compilation simulated" },
    { level: "SUCCESS", message: `[MOCK] Build simulation complete for project ${idLabel}` },
    { level: "INFO", message: "[MOCK] Note: This is a Phase-1 simulation. No files were created or modified." },
  ];
}

function getDiscussResponse(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm your AI workspace assistant. I can help you discuss ideas, plan your project, build it, improve existing code, or debug issues. Select a mode from the dropdown to get started!\n\nCurrently in **Discuss** mode — feel free to ask me anything about your project.";
  }
  if (lower.includes("what can you do") || lower.includes("help")) {
    return `Here's what I can do in each mode:\n\n- **Discuss**: General conversation about your project ideas and requirements\n- **Plan**: I'll ask you targeted questions and create a detailed project plan\n- **Build**: Run a mock build simulation with real DB-backed logs (say "Build it" to trigger)\n- **Improve**: Analyze your project spec and suggest enhancements\n- **Debug**: Help troubleshoot issues with guided debugging steps\n\nSwitch modes using the selector above the chat input.`;
  }
  if (lower.includes("database") || lower.includes("sql") || lower.includes("schema")) {
    return "Great question about databases! For most web applications, I'd recommend:\n\n1. **PostgreSQL** for relational data with complex queries\n2. **Prisma ORM** for type-safe database operations in TypeScript\n3. A well-normalized schema with proper relations\n\nSwitch to **Plan** mode and I'll help you design the perfect schema for your needs.";
  }
  return `That's an interesting point! Here are my thoughts:\n\nBased on what you've described, I'd recommend breaking this down into smaller, manageable components. Each component should have a single responsibility and clear interfaces.\n\nWould you like me to:\n1. **Plan** this out in detail? (Switch to Plan mode)\n2. **Build** a prototype? (Switch to Build mode after planning)\n3. Continue **discussing** the approach?\n\nI'm here to help however you need!`;
}

function getImproveResponse(specJson: unknown): string {
  if (!specJson) {
    return "I don't see a project spec yet. Here's what I'd recommend:\n\n1. Switch to **Plan** mode to create a detailed project specification\n2. The spec will be saved to your project's Database tab\n3. Then come back to **Improve** mode and I'll analyze it for enhancements";
  }
  return `I've analyzed your project spec and here are my recommendations:\n\n### Performance Improvements\n- Add database connection pooling\n- Implement response caching for frequently accessed data\n- Use lazy loading for frontend components\n\n### Security Enhancements\n- Add rate limiting to API endpoints\n- Implement CSRF protection\n- Set up Content Security Policy headers\n\n### UX Improvements\n- Add loading skeletons instead of spinners\n- Implement optimistic updates for better perceived performance\n- Add keyboard shortcuts for power users\n\nWould you like me to elaborate on any of these suggestions?`;
}

function getDebugResponse(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("error") || lower.includes("bug") || lower.includes("crash")) {
    return `Let me help you debug that. Here's my systematic approach:\n\n### Step 1: Reproduce\n- Can you reproduce the error consistently?\n- What are the exact steps to trigger it?\n\n### Step 2: Isolate\n- Check the **Console** tab for error logs\n- Look at the **Database** tab to verify data integrity\n\n### Step 3: Diagnose\nCommon causes:\n1. **State management bug** — Component state not syncing properly\n2. **API error** — Backend returning unexpected response format\n3. **Race condition** — Async operations completing out of order\n\nCan you share more details about the error message you're seeing?`;
  }
  return `I'm in debug mode and ready to help! To get started, tell me:\n\n1. **What's happening?** — Describe the unexpected behavior\n2. **What should happen?** — Describe the expected behavior\n3. **When does it happen?** — Steps to reproduce\n4. **Error messages?** — Any console errors or stack traces\n\nYou can also check the **Console tab** for live logs and the **Database tab** to verify data.`;
}

function isBuildNearMiss(content: string): boolean {
  const lower = content.toLowerCase().trim();
  return BUILD_NEAR_MISS_PHRASES.some((phrase) => lower.includes(phrase));
}

export async function processMessage(ctx: AgentContext): Promise<{
  response: string;
  shouldCreateJob: boolean;
  specUpdate?: Record<string, unknown>;
}> {
  const { mode, content, projectId, chatMessages } = ctx;

  switch (mode) {
    case "Discuss":
      return { response: getDiscussResponse(content), shouldCreateJob: false };

    case "Plan": {
      const planUserMessages = chatMessages.filter((m) => m.role === "user" && m.mode === "Plan");
      if (planUserMessages.length <= 1) {
        return {
          response: `Great, let's plan your project! I need to understand your requirements first.\n\n**Question 1 of 3:**\n${PLAN_QUESTIONS[0]}`,
          shouldCreateJob: false,
        };
      }
      if (planUserMessages.length === 2) {
        return {
          response: `Thanks for that context!\n\n**Question 2 of 3:**\n${PLAN_QUESTIONS[1]}`,
          shouldCreateJob: false,
        };
      }
      if (planUserMessages.length === 3) {
        return {
          response: `Excellent, one more question!\n\n**Question 3 of 3:**\n${PLAN_QUESTIONS[2]}`,
          shouldCreateJob: false,
        };
      }
      const specJson = {
        purpose: planUserMessages[1]?.content || "Not specified",
        features: planUserMessages[2]?.content || "Not specified",
        techPreferences: planUserMessages[3]?.content || "Not specified",
        createdAt: new Date().toISOString(),
      };
      return {
        response: `Perfect! Based on your answers, here's the project plan:\n\n${MOCK_PLAN}`,
        shouldCreateJob: false,
        specUpdate: specJson,
      };
    }

    case "Build": {
      const raw = content;
      const exactMatch = raw.toLowerCase() === "build it";
      if (exactMatch) {
        return {
          response: "**Mock build simulation started.** Switch to the **Console** tab to watch the simulated build logs.\n\nThis is a Phase-1 mock build — no files will be created or modified. Each log line is a real `JobLog` row in the database, streamed to the Console via SSE.",
          shouldCreateJob: true,
        };
      }
      if (isBuildNearMiss(raw)) {
        return {
          response: 'To start the build simulation, please type exactly: **Build it**\n\n(The exact phrase is required to trigger the build.)',
          shouldCreateJob: false,
        };
      }
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const hasSpec = !!project?.specJson;
      if (hasSpec) {
        return {
          response: 'Your project plan is ready! If you want me to start the build simulation, type exactly: **Build it**',
          shouldCreateJob: false,
        };
      }
      return {
        response: 'I\'m ready to build! To start the mock build simulation:\n\n1. First, switch to **Plan** mode and create a project plan\n2. Then come back to **Build** mode\n3. Type exactly **"Build it"** to kick off the simulation\n\nThe build will create a real `Job` row and insert `JobLog` rows into the database, which the Console tab streams via SSE.',
        shouldCreateJob: false,
      };
    }

    case "Improve": {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      return {
        response: getImproveResponse(project?.specJson),
        shouldCreateJob: false,
      };
    }

    case "Debug":
      return { response: getDebugResponse(content), shouldCreateJob: false };

    default:
      return {
        response: "Please select a valid mode: Discuss, Plan, Build, Improve, or Debug.",
        shouldCreateJob: false,
      };
  }
}

export async function createBuildJob(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const spec = project?.specJson as Record<string, unknown> | null;

  const job = await prisma.job.create({
    data: { projectId, status: "RUNNING" },
  });

  const logs = generateBuildLogs(projectId, spec);

  (async () => {
    for (let i = 0; i < logs.length; i++) {
      const baseDelay = parseInt(process.env.MOCK_LOG_DELAY_MS || "400", 10);
      const jitter = Math.random() * (baseDelay / 2);
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: logs[i].level,
          message: logs[i].message,
        },
      });
    }
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED" },
    });
  })();

  return job.id;
}
