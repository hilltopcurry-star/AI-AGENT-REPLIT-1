# Phase-2 Architecture: Real AI App Builder

> **Status**: Phase-2.3 implemented (deployment + live URL via reverse-proxy). Phase-2.4 not yet implemented.  
> **Prerequisite**: Phase-1 (mock agent, 3 tabs, Google OAuth, DB-backed SSE) is locked and verified  
> **Principle**: Phase-1 contract paths remain intact; Phase-2 adds on top
>
> ### Phase-2 Environment Variables
> | Variable | Default | Description |
> |----------|---------|-------------|
> | `AI_AGENT_MODE` | `mock` | `mock` = Phase-1 deterministic agent; `llm` = OpenAI-backed agent |
> | `OPENAI_API_KEY` | (none) | Required when `AI_AGENT_MODE=llm`. Without it, LLM mode returns a stub warning. |
> | `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use for chat completions |
> | `BUILD_RUNNER_MODE` | `mock` | `mock` = Phase-1 mock logs; `real` = sandboxed scaffold + npm install + npm build |

---

## 1. Product Vision

Transform the mock AI workspace into a real AI-powered app builder where non-technical users can:

1. Describe what they want in plain language
2. Have the agent ask smart clarifying questions
3. Review a proposed plan
4. Click a button to build
5. See real build logs streaming in the Console
6. Receive a live deployed URL when the build finishes

The user should **never** need to know the phrase "Build it" — the UI presents a clear Build confirmation button. (The phrase is kept as a hidden backward-compatible trigger.)

---

## 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐                 │
│  │ChatPanel│  │ConsolePanel│ │DatabasePanel│                │
│  │  + Build│  │ (SSE logs) │ │(spec/deploy)│                │
│  │  Button │  │            │ │             │                │
│  └────┬────┘  └─────┬──────┘ └──────┬──────┘                │
│       │              │               │                      │
└───────┼──────────────┼───────────────┼──────────────────────┘
        │              │               │
        ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API Routes (server)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Chat         │  │ Jobs SSE     │  │ Projects/Deploy  │   │
│  │ Orchestrator │  │ (existing)   │  │ CRUD             │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Agent Core (lib/agent/)                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐   │   │
│  │  │ LLM Client │ │Conversation│ │  Memory/Context  │   │   │
│  │  │ (OpenAI)   │ │  Manager   │ │   Manager        │   │   │
│  │  └────────────┘ └────────────┘ └─────────────────┘   │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Job Runner (lib/runner/)                     │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌─────────────────┐   │   │
│  │  │ File Gen │ │ Command Exec │ │ Log Streamer     │   │   │
│  │  │ (sandbox)│ │ (sandboxed)  │ │ (→ JobLog → SSE) │   │   │
│  │  └──────────┘ └──────────────┘ └─────────────────┘   │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Deployer (lib/deployer/)                     │   │
│  │  ┌──────────────┐  ┌────────────┐                     │   │
│  │  │ Replit Deploy│  │ Railway +  │                     │   │
│  │  │ (primary)    │  │ Neon (alt) │                     │   │
│  │  └──────────────┘  └────────────┘                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Chat Orchestrator (`lib/agent/orchestrator.ts`)

Replaces `lib/mock-agent.ts` (which stays as fallback behind feature flag).

- **Feature flag**: `AGENT_MODE=mock|llm` env var. Default `mock` preserves Phase-1.
- Manages the 3-step conversation: **Clarify → Plan → Confirm Build**
- Uses structured system prompt with JSON mode for predictable responses
- Determines when the plan is "ready" and surfaces the Build confirmation
- Stores conversation context and spec into existing `Message` + `Project.specJson`

### 2.2 LLM Client (`lib/agent/llm.ts`)

- OpenAI Chat Completions API (GPT-4o / GPT-4o-mini configurable)
- Thin wrapper: system prompt + messages in → structured response out
- Token budget enforcement (context window management)
- Retry with exponential backoff on transient failures
- No streaming to user (agent composes full response, then streams word-by-word as Phase-1 does)

### 2.3 Conversation Manager (`lib/agent/conversation.ts`)

Implements the 3-step flow:

```
CLARIFY ──(has enough info)──▶ PLAN ──(user approves)──▶ BUILD
   │                            │                          │
   │ Asks 2-5 questions         │ Proposes architecture    │ Creates Job
   │ based on what's missing    │ + milestones + stack     │ Runs build pipeline
   │                            │                          │
   ▼                            ▼                          ▼
 specJson.draft updated      specJson.plan set         Job + JobLogs created
```

**Angry/impatient user handling**: If the user expresses frustration or says "just build something", the agent:
1. Acknowledges ("I understand, let me work with what we have")
2. Fills in reasonable defaults for missing spec items
3. Proposes a minimal plan
4. Asks for build confirmation (never auto-builds)

**Honesty policy**: The agent never claims to have done something it hasn't. If it's uncertain about a requirement, it asks. If a build fails, it reports the real error.

### 2.4 Memory / Context Manager (`lib/agent/memory.ts`)

- Reads from `UserPreference` table (see schema below)
- Stores: preferred stack, past feedback, style preferences, common patterns
- Injected into system prompt as context (not fine-tuning, no weight training)
- Scoped per-user; never leaks across users
- Retention: configurable TTL per preference type

### 2.5 Job Runner (`lib/runner/`)

Orchestrates the actual build after the user confirms:

```
Job Runner Pipeline:
  1. Create workspace dir: /tmp/workspaces/{jobId}/
  2. Generate project files (from spec + LLM)
  3. Write files to workspace
  4. Run: npm install (timeout enforced)
  5. Run: npm run build (timeout enforced)
  6. Run: automated tests (if any)
  7. Package for deployment
  8. Hand off to Deployer
  9. Return deployed URL

Each step logs to JobLog → SSE streams to Console
```

### 2.6 Deployer (`lib/deployer/`)

Two deployment targets (in order of implementation):

| Target | Database | When |
|--------|----------|------|
| Replit Deployments | Replit PostgreSQL | Phase-2.3 (primary) |
| Railway + Neon | Neon PostgreSQL | Phase-2.3 (alternative) |

The deployer:
- Pushes built artifacts to deployment target
- Waits for health check
- Stores the live URL in `Deployment` table
- Returns URL to the Chat for display to user

---

## 3. Data Flow & Security Model

### 3.1 Request Flow

```
User types message
  → POST /api/projects/[id]/chat
  → Auth check (session.user.id === project.userId)
  → Chat Orchestrator determines step (Clarify/Plan/Build)
  → If Build confirmed:
      → Create Job (status: RUNNING)
      → Spawn async Job Runner
      → Job Runner writes JobLogs (reuses Phase-1 SSE)
      → On success: Deployer creates Deployment record
      → Job status → COMPLETED
  → Response streamed back to chat (word-by-word SSE)
```

### 3.2 Security Model

| Layer | Mechanism |
|-------|-----------|
| Authentication | NextAuth.js Google OAuth (unchanged) |
| Authorization | Every API route checks `session.user.id === resource.userId` |
| Data isolation | All queries scoped by `userId` — no cross-tenant access |
| LLM isolation | Each request gets fresh context; no shared state between users |
| File sandbox | Each job gets isolated `/tmp/workspaces/{jobId}/` directory |
| Command exec | Sandboxed with timeout, resource limits, no network for build commands |
| Secret management | API keys in env vars only; never in generated code or logs |
| Memory isolation | `UserPreference` scoped by `userId`; never shared |

### 3.3 What Runs Where

| Component | Execution Context | Why |
|-----------|-------------------|-----|
| Chat Orchestrator | Next.js API route (server) | Needs DB access + auth |
| LLM Client | Next.js API route (server) | API key must stay server-side |
| File Generation | Async in API route (server) | Needs filesystem access |
| Command Execution | Child process (server) | Must be sandboxed |
| Log Streaming | SSE from API route (server) | Reuses Phase-1 pattern |
| Deployer | Async in API route (server) | Needs deployment API credentials |
| Memory Manager | Next.js API route (server) | DB access required |

---

## 4. DB Schema Additions (Prisma)

All existing models remain **unchanged**. New models added:

```prisma
// --- NEW MODELS FOR PHASE-2 ---

model UserPreference {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key       String                          // e.g. "preferred_stack", "style", "feedback"
  value     String   @db.Text               // JSON-encoded value
  expiresAt DateTime?                       // optional TTL
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, key])                   // one value per key per user
  @@index([userId])
}

model BuildArtifact {
  id           String   @id @default(cuid())
  jobId        String
  job          Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  filePath     String                       // relative path within workspace
  contentHash  String                       // SHA-256 of file content
  sizeBytes    Int
  createdAt    DateTime @default(now())

  @@index([jobId])
}

model Deployment {
  id          String   @id @default(cuid())
  jobId       String
  job         Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  provider    String   @default("replit")    // "replit" | "railway"
  status      String   @default("DEPLOYING") // DEPLOYING | LIVE | FAILED | STOPPED
  url         String?                        // live URL once deployed
  buildLog    String?  @db.Text              // deployment-specific log output
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([projectId])
  @@index([jobId])
}
```

**Relation additions to existing models** (non-breaking):

```prisma
// Add to User model:
  preferences UserPreference[]

// Add to Job model:
  artifacts   BuildArtifact[]
  deployments Deployment[]

// Add to Project model:
  deployments Deployment[]
```

---

## 5. Tooling Plan

### 5.1 File System Sandbox Strategy

```
/tmp/workspaces/
  └── {jobId}/                    # Created when job starts
      ├── .env                    # Generated env vars (no real secrets)
      ├── package.json            # Generated from spec
      ├── prisma/
      │   └── schema.prisma       # Generated from spec
      ├── src/                    # Generated app code
      │   ├── app/
      │   ├── components/
      │   └── lib/
      └── .build-output/          # Build artifacts

Lifecycle:
  1. mkdir /tmp/workspaces/{jobId}
  2. Generate files into workspace
  3. Run install + build inside workspace
  4. Package .build-output for deployment
  5. Cleanup: rm -rf /tmp/workspaces/{jobId} after deploy (or after TTL)
```

**Isolation guarantees:**
- Each job gets its own directory keyed by `jobId` (globally unique cuid)
- No symlinks allowed in generated files
- Path traversal checked before any file write
- Workspace deleted after job completes (success or failure)

### 5.2 Running Commands Safely

```typescript
// lib/runner/exec.ts
import { spawn } from "child_process";

interface ExecOptions {
  cwd: string;           // workspace dir
  timeout: number;       // ms (default: 120_000 for install, 180_000 for build)
  maxOutputBytes: number; // prevent log flooding (default: 5MB)
  env: Record<string, string>; // controlled env vars only
}

// Strategy:
// 1. spawn() with explicit cwd, env, and timeout
// 2. stdout/stderr piped and written to JobLog rows in real-time
// 3. On timeout: SIGTERM → wait 5s → SIGKILL
// 4. Exit code checked: non-zero → Job status FAILED
// 5. No shell=true (prevents injection)
// 6. PATH restricted to node/npm binaries only
```

### 5.3 Streaming Logs to JobLog (reuses Phase-1 SSE)

The Phase-1 SSE infrastructure is reused exactly:

```
Command stdout/stderr
  → Parse line by line
  → prisma.jobLog.create({ jobId, level, message })
  → SSE poll picks up new rows (existing /api/jobs/[jobId]/logs)
  → ConsolePanel renders in real-time (existing dedup + event:done)
```

No changes needed to the SSE routes or ConsolePanel — they already handle arbitrary JobLog rows.

---

## 6. Deployment Plan

### 6.1 Primary: Replit Deployments

```
Build complete in /tmp/workspaces/{jobId}/
  → Use Replit Deployments API (or CLI) to push
  → Monitor deployment health check
  → On healthy: store URL in Deployment table
  → Return URL to user in chat: "Your app is live at: {url}"
```

**Obtaining the deployed URL:**
- Replit Deployments provides a `*.replit.app` URL automatically
- Store in `Deployment.url` field
- Display in Chat (as a clickable link in the assistant message)
- Display in Database tab (in the Deployment section)

### 6.2 Alternative: Railway + Neon

```
Build complete in /tmp/workspaces/{jobId}/
  → Push to Railway via Railway API
  → Provision Neon PostgreSQL database
  → Set DATABASE_URL on Railway service
  → Wait for health check
  → Store Railway URL in Deployment table
```

**Required credentials** (stored as env vars, never exposed):
- `RAILWAY_API_TOKEN`
- `NEON_API_KEY`

### 6.3 URL Display to User

The deployed URL flows through:
1. Deployer writes `Deployment.url` in DB
2. Job Runner emits final JobLog: `[DEPLOY] Live at: {url}`
3. Chat Orchestrator's build-complete response includes the URL
4. DatabasePanel shows the deployment in the latest-job section
5. (Future) ConsolePanel could show a "Open App" button

---

## 7. Conversation Policy

### 7.1 Three-Step Flow

```
Step 1: CLARIFY
  Agent: "I'd like to understand your project better. [question]"
  - Asks 2-5 questions depending on how much info the user provided
  - Each question targets a specific missing piece (purpose, features, data model, auth needs, styling)
  - If user gives a lot upfront, may skip to 1-2 questions

Step 2: PLAN
  Agent: "Here's what I'll build for you: [structured plan]"
  - Presents: architecture, tech stack, key features, milestones
  - UI shows a "Build" confirmation button alongside the plan
  - User can ask questions/request changes before confirming

Step 3: CONFIRM BUILD
  User clicks "Build" button (or types "Build it" as legacy trigger)
  Agent: "Building your app now. Watch the Console tab for progress."
  - Job created, runner starts, logs stream
  - On completion: "Your app is live at {url}. Want me to make any changes?"
```

### 7.2 Angry / Impatient User Handling

```
User: "Just build something already!"

Agent: "Got it — I'll work with what we have. Here's a minimal plan
based on what you've described so far:

[auto-generated plan with sensible defaults]

I want to make sure this is right before I start building.
Ready to go? Click Build to start, or tell me what to change."
```

Rules:
- Never auto-build without explicit confirmation (button click or "Build it")
- Fill in reasonable defaults for anything unspecified
- Be concise — frustrated users don't want long responses
- Offer one clear action: "Click Build" or "Tell me what to change"

### 7.3 Honesty Policy

| Situation | Agent Response |
|-----------|---------------|
| Build succeeded | "Your app is live at {url}" + real URL |
| Build failed | "The build failed at step X: {real error}. Let me try to fix it." |
| Uncertain about requirement | "I'm not sure if you want X or Y. Can you clarify?" |
| Can't do something | "I can't do {thing} right now. Here's what I can do instead: ..." |
| Feature not implemented yet | "That's not available yet, but I can {alternative}." |

Never:
- Claim a file was generated when it wasn't
- Show a fake URL
- Pretend to understand when confused
- Silently skip a requested feature

---

## 8. Milestone Breakdown

### Phase-2.1: Replace Mock Agent with Real LLM
**Goal**: Chat produces real, context-aware responses instead of deterministic templates.

| Task | Details |
|------|---------|
| Feature flag | `AGENT_MODE=mock\|llm` env var; default `mock` |
| LLM client | OpenAI wrapper with retry, token management |
| System prompt | Structured prompt defining personality, constraints, output format |
| Conversation manager | 3-step flow (Clarify → Plan → Confirm) |
| Build confirmation button | UI button in ChatPanel that sends the build trigger |
| Spec generation | LLM generates structured `specJson` from conversation |
| Tests | Verify mock still works, verify LLM produces valid specs |

**Does NOT change**: SSE, ConsolePanel, DatabasePanel, Job/JobLog schema, auth

### Phase-2.2: Real File Generation + Tests
**Goal**: Given a spec, generate real project files and run install/build.

| Task | Details |
|------|---------|
| File generator | LLM-guided code generation based on specJson |
| Template engine | Base templates for Next.js + Prisma projects |
| Workspace sandbox | `/tmp/workspaces/{jobId}/` isolated directories |
| Command executor | Sandboxed `npm install` + `npm run build` |
| Log streaming | stdout/stderr → JobLog rows (reuse SSE) |
| Build validation | Check exit codes, parse errors, report to user |
| BuildArtifact model | Track generated files in DB |
| Integration tests | End-to-end: spec → files → build → success |

### Phase-2.3: Deployment + Live URL ✅ COMPLETED
**Goal**: Built apps get deployed and the user receives a live URL.

| Task | Status | Details |
|------|--------|---------|
| Reverse-proxy deployer | ✅ | `lib/deployer.ts` — spawns `next start` on internal port (7100–7999), health-checks, stores Deployment record |
| Proxy API routes | ✅ | `/api/deployments/[id]/proxy` + `/api/deployments/[id]/proxy/[...path]` — auth-protected reverse proxy |
| Deployment model | ✅ | `Deployment` + `BuildArtifact` models in Prisma, `db push` applied |
| URL display (Console) | ✅ | ConsolePanel shows green footer with live URL + external link icon |
| URL display (Database) | ✅ | DatabasePanel shows latest deployment status, URL, provider, error |
| Deployments API | ✅ | `GET /api/projects/{id}/deployments` — returns latest 5 deployments |
| SSE integration | ✅ | `event: done` payload includes `deploymentUrl` on success |
| Health check | ✅ | 25 retries with 2s interval against internal port `/api/health` |
| Job runner hook | ✅ | `job-runner.ts` calls `deployWorkspace()` after build success |
| XDG_CONFIG_HOME fix | ✅ | Set in both runner and deployer env to prevent npx unbound variable error |

**Architecture decision**: Reverse-proxy (NOT Replit Deployments API). The deployer spawns the built Next.js app as a child process on an internal port, and the proxy routes forward authenticated requests to it. This keeps everything self-contained within the Repl.

**Verified**: Full e2e test — project create → "Build it" → scaffold → npm install → npm build → next start → health check pass → deployment SUCCESS → live URL accessible.

### Phase-2.4: Memory + Feedback Loop + Regression Tests
**Goal**: The agent remembers user preferences and improves over time.

| Task | Details |
|------|---------|
| UserPreference model | Store preferred stack, past feedback, style prefs |
| Memory injection | Include relevant prefs in system prompt |
| Feedback capture | After deployment, ask "How did I do?" → store response |
| Preference TTL | Auto-expire stale preferences |
| Regression tests | Full pipeline tests: chat → plan → build → deploy → verify URL |
| Rate limiting | Per-user build limits to prevent abuse |

---

## 9. UI Changes (Minimal)

Phase-2 keeps the existing 3-tab layout. Changes within those tabs:

### ChatPanel additions:
- **Build confirmation button**: Appears after the agent proposes a plan. Sends the build trigger instead of requiring the user to type "Build it"
- **Deployed URL display**: After successful build, shows a clickable link to the live app
- **Conversation state indicator**: Shows current step (Clarifying / Planning / Building / Deployed)

### ConsolePanel: No changes
- Already handles arbitrary JobLog rows + SSE + dedup

### DatabasePanel additions:
- **Deployment section**: Shows latest deployment URL, status, provider
- **Memory section** (Phase-2.4): Shows stored preferences (read-only)

---

## 10. Questions for You

Before I start implementing, I need to understand your preferences on five things:

1. **Deployment target preference**: Should I prioritize Replit Deployments only for now, or do you want Railway+Neon support from the start? (Replit-first is simpler and faster to ship.)

2. **Supported stacks**: Should the builder only generate Next.js + Prisma + Tailwind projects, or do you want support for other frameworks (Express, Remix, plain React, etc.) eventually?

3. **Build time limits**: What's the maximum allowed time for a single build? I'm thinking 5 minutes for `npm install` + `npm run build` combined, with a hard kill at 10 minutes. Does that seem right?

4. **Memory retention rules**: How long should user preferences be stored? Options: forever (until user deletes), 90 days auto-expire, or per-session only (cleared on logout)?

5. **Pricing / usage limits**: Should there be any limits on builds per user? (e.g., 3 builds/day for free tier, unlimited for paid) Or is this unlimited for now?
