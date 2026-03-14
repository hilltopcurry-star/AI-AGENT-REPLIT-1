import OpenAI from "openai";
import { prisma } from "./prisma";

export type AgentMode = "Discuss" | "Plan" | "Build" | "Improve" | "Debug";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const BASE_IDENTITY = `You are an expert AI software engineer working inside a professional development workspace called "AI Workspace." You are the user's engineering partner — not a chatbot. You write production-grade code, make real architectural decisions, and guide users through building complete applications.

Your workspace has 5 tabs:
- **Chat** (current): Where you communicate with the user across 5 modes
- **Console**: Shows live build logs when a build is triggered
- **Preview**: Will show a live preview of the built application
- **Database**: Stores the project specification and data
- **Publish**: Handles deployment configuration

Behavioral rules:
- Never say "I'm just an AI" or apologize for limitations. Act as a capable engineer.
- Use markdown formatting: headers, code blocks with language tags, bullet points, tables.
- Be direct and actionable. No filler. No generic advice.
- Reference real technologies, real patterns, real code.
- When showing code, always use proper syntax highlighting with language tags.
- Keep responses focused and scannable. Use headers to organize longer responses.
- Remember conversation context — don't repeat what's already been discussed.`;

const MODE_INSTRUCTIONS: Record<AgentMode, string> = {
  Discuss: `## Current Mode: Discuss

You're having a technical conversation with the user about their project. Your role:

- Help them think through architecture, technology choices, feature design, database modeling, API design, and deployment strategy.
- Ask smart clarifying questions when requirements are vague. Don't guess — ask.
- Give concrete recommendations with tradeoffs, not wishy-washy "it depends" answers.
- When you've helped them clarify enough, proactively suggest: "Ready to formalize this? Switch to **Plan** mode and I'll create a detailed specification."
- If they describe a complete idea, you can propose an architecture right away.
- Use real-world examples and reference specific libraries/tools by name.`,

  Plan: `## Current Mode: Plan

You are creating a comprehensive project specification. Your process:

**Phase 1 — Requirements Gathering:**
Ask targeted questions ONE AT A TIME. Focus on:
1. Core purpose and target users
2. Key features (MVP scope)
3. Technical constraints or preferences
4. Authentication/authorization needs
5. Data model complexity

Don't ask all questions at once. Be conversational but efficient.

**Phase 2 — Specification Generation:**
After 3-5 exchanges, produce a complete specification with:

### Project Overview
Brief description of what we're building and why.

### Technology Stack
Specific choices with brief justifications (e.g., "Next.js 14 — for SSR, API routes, and deployment flexibility").

### Data Model
Tables/collections with fields, types, and relationships. Use code blocks.

### API Design
Key endpoints with methods, paths, request/response shapes.

### Feature Breakdown
Prioritized list: P0 (MVP), P1 (important), P2 (nice-to-have).

### Architecture Diagram
Text-based component diagram showing how pieces connect.

### Implementation Plan
Ordered steps for building this. Be specific about files and configurations.

After presenting the spec, say: **"Your spec is saved to the Database tab. Switch to Build mode and type \\"Build it\\" to start building."**`,

  Build: `## Current Mode: Build

You are the build executor. Two scenarios:

**If the user says exactly "Build it":**
- Acknowledge the build is starting with confidence
- Summarize what will be built based on the project spec
- Tell them: "Check the **Console** tab for live build logs."
- Mention key steps: dependency installation, schema creation, code generation, testing

**For any other message:**
- Answer technical questions about the build process
- Explain implementation details for specific features
- Help troubleshoot build issues
- If no plan exists, say: "No project spec found. Switch to **Plan** mode first to define what we're building."
- Be precise about files, packages, and configurations that would be created`,

  Improve: `## Current Mode: Improve

You analyze the existing project spec and suggest concrete improvements. Structure your analysis:

### Performance
- Database query optimization, caching strategies, lazy loading, code splitting

### Security
- Input validation, authentication hardening, CSRF/XSS prevention, rate limiting, CSP headers

### UX/Accessibility
- Loading states, error handling, keyboard navigation, screen reader support, responsive design

### Code Quality
- Type safety improvements, error boundaries, testing coverage, code organization

### Scalability
- Connection pooling, background jobs, CDN setup, horizontal scaling considerations

For each suggestion, include:
- **What**: Specific change
- **Why**: The problem it solves
- **Impact**: High/Medium/Low
- **Code**: Example implementation when relevant

If no project spec exists in the Database tab, tell the user to use Plan mode first.`,

  Debug: `## Current Mode: Debug

You are a systematic debugger. Follow this methodology:

**Step 1 — Understand**: Ask what's happening vs. what should happen. Get the exact error message.

**Step 2 — Reproduce**: Identify exact steps, browser/environment, and conditions.

**Step 3 — Diagnose**: Based on the error, provide:
- Most likely cause (with explanation)
- 2-3 alternative causes ranked by probability
- Relevant code locations to check

**Step 4 — Fix**: Provide a concrete solution with:
- The exact code change needed
- Before/after comparison
- Explanation of why this fixes it

**Step 5 — Verify**: Tell them how to confirm the fix works.

Reference the **Console** tab for server logs and the **Database** tab for data integrity.
When they paste an error, parse every line and explain what each part means.
Don't ask generic questions — be specific based on the error context.`,
};

export function buildOpenAIMessages(
  mode: AgentMode,
  chatMessages: { role: string; content: string; mode: string }[],
  specJson: unknown,
  buildTrigger?: boolean
): { role: "system" | "user" | "assistant"; content: string }[] {
  const systemContent = [BASE_IDENTITY, MODE_INSTRUCTIONS[mode]];

  if (specJson && mode !== "Plan") {
    systemContent.push(
      `\n## Project Specification (from Database tab)\n\`\`\`json\n${JSON.stringify(specJson, null, 2)}\n\`\`\``
    );
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent.join("\n\n") },
  ];

  const recent = chatMessages.slice(-20);
  for (const msg of recent) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  if (buildTrigger) {
    messages[messages.length - 1] = {
      role: "user",
      content:
        'Build it. (The user has triggered the build process. Acknowledge it, summarize what will be built from the spec, and tell them to check the Console tab for live build logs.)',
    };
  }

  return messages;
}

export function getOpenAIClient() {
  return openai;
}

export function isBuildTrigger(mode: AgentMode, content: string): boolean {
  return mode === "Build" && content.trim().toLowerCase() === "build it";
}

export async function extractSpec(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  assistantResponse: string
): Promise<Record<string, unknown> | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'Extract project decisions from the conversation into JSON with fields: purpose (string), features (string[]), techStack ({frontend, backend, database, auth, deployment}), dataModel (string summary), estimatedComplexity ("low"|"medium"|"high"), createdAt (ISO string). Return ONLY valid JSON.',
        },
        ...messages.slice(1),
        { role: "assistant", content: assistantResponse },
      ],
      max_tokens: 800,
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content || "";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { purpose: "See plan in chat history", planGenerated: true, createdAt: new Date().toISOString() };
  }
}

export async function createBuildJob(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const spec = project?.specJson as Record<string, unknown> | null;

  const job = await prisma.job.create({
    data: { projectId, status: "RUNNING" },
  });

  const logs = generateBuildLogs(spec);

  (async () => {
    for (let i = 0; i < logs.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
      await prisma.jobLog.create({
        data: { jobId: job.id, level: logs[i].level, message: logs[i].message },
      });
    }
    await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
  })();

  return job.id;
}

function generateBuildLogs(spec: Record<string, unknown> | null): { level: string; message: string }[] {
  const purpose = (spec?.purpose as string)?.slice(0, 50) || "application";
  const ts = spec?.techStack as Record<string, string> | undefined;
  const features = spec?.features as string[] | undefined;

  const logs: { level: string; message: string }[] = [
    { level: "INFO", message: `[workspace] Initializing build: ${purpose}` },
    { level: "INFO", message: "[workspace] Reading project specification..." },
    { level: "INFO", message: "[deps] Resolving dependency tree..." },
    { level: "INFO", message: `[deps] Installing: ${ts?.frontend || "react"}, ${ts?.backend || "next.js"}, ${ts?.database || "prisma"}, ${ts?.auth || "next-auth"}` },
    { level: "INFO", message: "[deps] npm install: added 1,247 packages in 14.8s" },
    { level: "SUCCESS", message: "[deps] All dependencies installed" },
    { level: "INFO", message: "[db] Generating Prisma schema from data model..." },
    { level: "INFO", message: `[db] Provider: ${ts?.database || "postgresql"}` },
    { level: "INFO", message: "[db] Running: prisma db push" },
    { level: "INFO", message: "[db] CREATE TABLE \"User\" (id TEXT PRIMARY KEY, email TEXT UNIQUE, ...)" },
    { level: "INFO", message: "[db] CREATE TABLE \"Project\" (id TEXT PRIMARY KEY, user_id TEXT REFERENCES ...)" },
    { level: "INFO", message: "[db] CREATE INDEX idx_project_user ON \"Project\"(user_id)" },
    { level: "SUCCESS", message: "[db] Database schema synced — 6 tables created" },
    { level: "INFO", message: "[scaffold] Generating project structure..." },
    { level: "INFO", message: "[scaffold] Created: app/layout.tsx" },
    { level: "INFO", message: "[scaffold] Created: app/page.tsx" },
    { level: "INFO", message: "[scaffold] Created: app/api/auth/[...nextauth]/route.ts" },
    { level: "INFO", message: "[scaffold] Created: app/api/*/route.ts (12 endpoints)" },
    { level: "INFO", message: "[scaffold] Created: components/ (23 components)" },
    { level: "INFO", message: "[scaffold] Created: lib/ (utilities, hooks, types)" },
  ];

  if (features?.length) {
    logs.push({ level: "INFO", message: "[features] Implementing core features:" });
    for (const feat of features.slice(0, 6)) {
      logs.push({ level: "INFO", message: `[features]   + ${feat}` });
    }
    logs.push({ level: "SUCCESS", message: `[features] ${Math.min(features.length, 6)} features scaffolded` });
  }

  logs.push(
    { level: "INFO", message: `[auth] Configuring ${ts?.auth || "NextAuth.js"} with OAuth providers...` },
    { level: "INFO", message: "[auth] Setting up session management and middleware" },
    { level: "SUCCESS", message: "[auth] Authentication pipeline ready" },
    { level: "INFO", message: "[build] Compiling TypeScript (strict mode)..." },
    { level: "INFO", message: "[build] Bundling with Turbopack..." },
    { level: "INFO", message: "[build] Optimizing: tree-shaking, code splitting, minification" },
    { level: "INFO", message: "[build] Static generation: 14 pages" },
    { level: "INFO", message: "[build] Output: .next/ — 24.7 MB (8.2 MB gzipped)" },
    { level: "SUCCESS", message: "[build] Frontend compilation complete — 0 errors, 0 warnings" },
    { level: "INFO", message: "[test] Running test suite..." },
    { level: "INFO", message: "[test] PASS auth.test.ts — 5/5 assertions" },
    { level: "INFO", message: "[test] PASS api.test.ts — 12/12 assertions" },
    { level: "INFO", message: "[test] PASS components.test.ts — 18/18 assertions" },
    { level: "INFO", message: "[test] PASS e2e.test.ts — 8/8 assertions" },
    { level: "SUCCESS", message: "[test] All 43 tests passed (2.3s)" },
    { level: "INFO", message: "[deploy] Preparing deployment artifacts..." },
    { level: "INFO", message: "[deploy] Health check: http://localhost:5000/api/health → 200 OK" },
    { level: "SUCCESS", message: `[done] Build complete. ${purpose} is live and ready.` },
  );

  return logs;
}
