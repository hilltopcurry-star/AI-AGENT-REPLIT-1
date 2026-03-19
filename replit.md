# AI Workspace — Phase-Scale-2

## Status: PHASE-SCALE-2 (2026-03-14) — Real Fly.io Deployment

## Overview
AI-powered development workspace built with Next.js App Router. Deterministic mock agent (Phase-1) with optional LLM agent behind `AI_AGENT_MODE` feature flag. Real sandboxed build runner behind `BUILD_RUNNER_MODE` feature flag. Reverse-proxy deployer launches built apps and serves them via proxy routes. 3 workspace tabs (Chat, Console, Database). Google OAuth authentication. All build logs are DB-backed and streamed via SSE. OpenAI cost controls with kill switch, daily caps, and usage tracking. Workspace cleanup with TTL and per-user limits. Build queue system with worker process for scalable builds. Fly.io deployment stub (Phase-Scale-2 for real API). Admin dashboard for monitoring.

## Non-Negotiables (DO NOT CHANGE)
1. Default behavior is Phase-1 mock agent (deterministic). LLM only when `AI_AGENT_MODE=llm`.
2. Strict Build gate: Job created ONLY when mode==="Build" AND raw message equals exactly one of the allowed confirmation phrases (case-insensitive, NO trimming — trailing spaces rejected). Both mock and LLM agents use strict exact-match only (no startsWith).
3. UI tabs: Chat / Console / Database ONLY. No Preview/Publish.
4. Auth on /api/jobs/* endpoints must remain. 401 via curl is expected.
5. Protected workspace/app URLs must not be overwritten.

## Architecture
- **Layout**: Monorepo — Next.js app under `apps/web/`, Prisma at repo root
- **Framework**: Next.js 16 (App Router) + TypeScript (strict)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js (Auth.js v5 beta) with Google OAuth + Prisma adapter + trustHost
- **AI**: Agent router (`lib/agent/index.ts`) → mock-agent.ts (default) or llm-agent.ts (when AI_AGENT_MODE=llm)
- **Build**: Real sandboxed runner (`lib/job-runner.ts`) or mock logs, controlled by `BUILD_RUNNER_MODE`
- **Deploy**: `deployWorkspace()` attempts Fly.io first when `FLY_API_TOKEN` is set; on Fly success returns Fly URL as primary. Falls back to reverse-proxy deployer (spawns `next start`, proxies via `/api/deployments/{id}/proxy`). Done events include `deploymentProvider` ("fly" or "replit-proxy") and `deploymentId`. `FlyDeployment.queueJobId` is now optional (supports both queue worker and direct job-runner paths).
- **Cost Controls**: Kill switch, daily request/token caps, per-request token limit, usage tracking
- **Cleanup**: TTL-based workspace cleanup, per-user workspace/deployment limits
- **UI**: Radix UI + Tailwind CSS + shadcn/ui components
- **State**: TanStack React Query

## Project Structure
```
apps/web/
  app/
    api/
      health/route.ts              # GET /api/health → {"ok": true}
      auth/[...nextauth]/route.ts  # NextAuth route handler
      agent-mode/route.ts          # GET /api/agent-mode → {mode, hasOpenAiKey, buildRunnerMode} (public)
      debug-routes/route.ts        # Debug: lists route existence (public)
      tests/phase1/route.ts        # GET /api/tests/phase1 → deterministic validation (auth)
      jobs/
        latest/route.ts            # GET /api/jobs/latest?projectId=X
        [jobId]/
          logs/route.ts            # SSE stream (cursor+seenIds dedup, event:done)
          stream/route.ts          # SSE stream (cursor+seenIds dedup, event:done, resume support)
          verify/route.ts          # Job summary (auth required)
      chats/[id]/messages/route.ts # Chat messages + build gate
      projects/
        route.ts                   # Project list/create
        [id]/
          route.ts                 # Project CRUD
          chat/route.ts            # Chat via projectId (raw content for Build mode)
          chats/route.ts           # Project chats
          jobs/route.ts            # Project jobs
          deployments/route.ts     # GET project deployments (auth)
      deployments/
        [deploymentId]/
          proxy/route.ts           # Reverse proxy to deployed app (root)
          proxy/[...path]/route.ts # Reverse proxy to deployed app (subpaths)
      download/
        backup/route.ts            # Download backup v1 (auth)
        backup-v2/route.ts         # Download backup v2 (auth)
    (dashboard)/
      projects/
        page.tsx                   # Projects list
        [id]/page.tsx              # Workspace (Chat/Console/Database)
    page.tsx                       # Landing page
    layout.tsx                     # Root layout with providers
    globals.css                    # Global styles
  components/
    ui/                            # shadcn/ui components
    workspace/
      ChatPanel.tsx                # Chat panel (PascalCase)
      ConsolePanel.tsx             # Console panel (dedup by log id, event:done listener, deployment URL footer)
      DatabasePanel.tsx            # Database panel (health, latest job, deployment section, specJson)
      mode-selector.tsx            # Agent mode selector
      workspace-sidebar.tsx        # Project sidebar
  lib/
    agent/
      index.ts                    # Unified entry point: processUserMessage() + createBuildJob() routes to mock or real runner + opportunistic cleanup
    auth.ts                        # NextAuth config (trustHost: true)
    prisma.ts                      # Prisma client singleton
    mock-agent.ts                  # Deterministic mock agent (Phase-1, strict build gate)
    llm-agent.ts                   # LLM agent (Phase-2.1, OpenAI, 3-step conversation, cost controls, kill switch)
    job-runner.ts                  # Real sandboxed build runner (Phase-2.2, scaffold gen + npm install/build)
    deployer.ts                    # Reverse-proxy deployer (Phase-2.3, spawns next start, health check, DB record)
    cleanup.ts                     # Workspace + deployment cleanup (Phase-2.6, TTL, per-user limits)
    memory.ts                      # Memory manager (MemoryItem CRUD with TTL)
    tools/
      index.ts                    # Tool calling (save_project_spec, set_memory, create_build_job)
  hooks/
    use-toast.ts
    use-mobile.tsx
prisma/
  schema.prisma                    # Database schema
tests/
  vitest.config.ts                 # Vitest config (fileParallelism: false, path aliases)
  helpers.ts                       # Test user/session/project/chat creation, HTTP utils, SSE parser
  run.sh                           # Test runner (TMPDIR fix, sequential mode)
  01-auth.test.ts                  # Auth 401s, ownership isolation, expired sessions (20 tests)
  02-build-gate.test.ts            # Build gate confirmation phrases, mode restrictions (20 tests)
  03-llm-flow.test.ts              # Agent modes, SSE events, message persistence, multi-turn (20 tests)
  04-runner-deploy.test.ts         # Runner logs, artifacts, deployment records, proxy auth (20 tests)
  05-memory.test.ts                # Memory CRUD, TTL, scoping, cleanup (20 tests)
  06-auth-extended.test.ts         # Extended auth: bad tokens, cross-user isolation, session edge cases
  07-runner-extended.test.ts       # Runner model validation, build logs analysis
  08-deploy-proxy.test.ts          # Deployment model validation, proxy auth, deploy logs
  09-sse-correctness.test.ts       # SSE event structure, persistence, multi-turn, modes
  10-misc-regressions.test.ts      # Malformed requests, mode edge cases, build gate strictness
  11-cleanup.test.ts               # Workspace/deployment cleanup, opportunistic cleanup
  12-cost-controls.test.ts         # OpenAiUsage model, kill switch, daily caps
  13-schema-integrity.test.ts      # Schema validation: all models, relations, cascades
  14-api-surface.test.ts           # Content-type handling, large payloads, special chars, concurrency
  15-build-gate-extended.test.ts   # Case-insensitive triggers, non-triggers with extra chars
  16-memory-extended.test.ts       # Chat history accumulation, spec persistence, mode preservation
  17-edge-cases.test.ts            # URL edge cases, response headers, multi-user isolation, DB safety
  18-db-operations.test.ts         # CRUD operations on all models, aggregates, pagination
  19-regression-suite.test.ts      # Filter queries, job lifecycle, session validation, usage aggregation
  20-db-fixtures.test.ts           # Parameterized DB fixture tests: special chars, modes, jobs, deployments, memory
package.json
```

## Phase-Scale-1 Changes (2026-03-14)

### Build Queue System
1. **Prisma models**: `BuildQueueJob` (userId, projectId, status, priority, attempts, maxAttempts, lockedAt/By, availableAt), `FlyDeployment` (userId, projectId, queueJobId, status, appName, url, error). `BuildArtifact` extended with type, pathOrRef, projectId, userId.
2. **Queue library** (`lib/build-queue.ts`): `enqueueBuild()`, `lockNextJob()`, `completeQueueJob()`, `requeueJob()`, `getQueueStatus()`, `getQueueDepth()`. Per-user limit: 1 running + 5 queued max.
3. **Worker** (`worker/index.ts`): Standalone polling process. Atomically locks QUEUED jobs, runs scaffold+install+build pipeline, writes JobLogs, creates BuildArtifact, attempts FlyDeployment. Retry with exponential backoff up to maxAttempts. `MAX_CONCURRENT_BUILDS_PER_WORKER=2`.
4. **API routes**: `POST /api/queue/build` (enqueue build with credit deduction), `GET /api/queue/status?projectId=` (latest queue job + position), `GET /api/queue/[queueJobId]/stream` (SSE log streaming).
5. **Run worker**: `cd apps/web && npm run worker` with `WORKER_ID` env.

### Fly.io Deployment (Phase-Scale-2)
1. **Fly deployer** (`lib/fly-deployer.ts`): Real Fly.io deployment. Creates Fly app via Machines API, deploys via `flyctl deploy --remote-only`. Deterministic app naming: `aiapp-<projectIdShort>`. One Fly app per project (redeploys update same app).
2. **Docker context**: Generates multi-stage Dockerfile (build + runner) for standalone Next.js output. Handles missing `public/` dir gracefully.
3. **Env vars**: `FLY_API_TOKEN` (required), `FLY_ORG` (default: "personal"), `FLY_REGION` (default: "iad"). `flyctl` installed at `/home/runner/.fly/bin/flyctl`.
4. **Fallback**: If `flyctl` not available, creates app via API but marks FAILED with manual deployment instructions. If `FLY_API_TOKEN` missing, marks FAILED with clear reason.
5. **On success**: `FlyDeployment.status=SUCCESS`, `url=https://<appName>.fly.dev`. On failure: `status=FAILED`, error saved with details.

### Admin Dashboard
1. **API route**: `GET /api/admin/stats` (auth + ADMIN_EMAILS allowlist) returns totalUsers, totalProjects, queueDepth, recentQueueJobs (last 20), creditsSold, aiQuotaSold.
2. **UI**: `/admin` page with summary cards (users, projects, queue depth, credits/quota sold) + queue jobs table with status, user, project, attempts, worker, errors.
3. **Env var**: `ADMIN_EMAILS` (comma-separated email allowlist).

## Phase-2.9 Changes (2026-03-14)

### AI Quota Packs (Phase 4)
1. **Prisma models**: `AiQuotaLedger` (userId, amountRequests, amountTokens, reason, source), `AiQuotaBalance` (userId unique, remainingRequests, remainingTokens), `StripePurchase` (userId, kind, amount, stripeSessionId, status)
2. **Core library** (`lib/ai-quota.ts`): `addAiQuota()`, `deductAiQuotaAtomic()`, `ensureInitialAiQuota()`, `refundAiQuotaTokens()`, `requireAiQuota()`, `AiQuotaExhaustedError`; `aiQuotaEnabled()` kill switch via `AI_QUOTA_ENABLED` env
3. **Pre-charge enforcement**: LLM calls pre-charge max tokens (maxTokensPerRequest * 6 for tool-calling, maxTokensPerRequest for single) before OpenAI call, then refund unused tokens after. Prevents bypass of quota.
4. **API routes**: `GET /api/ai/quota` (remaining + low/exhausted), `POST /api/ai/add-quota` (mock top-up), `GET /api/ai/quota-ledger` (paginated)
5. **Welcome bonus**: `AI_QUOTA_INITIAL_REQUESTS=20`, `AI_QUOTA_INITIAL_TOKENS=10000` granted on first AI quota check
6. **UI**: `AiQuotaBadge` (requests/tokens in header), billing page with AI quota packs section (Starter/Builder/Pro), AI quota history table
7. **Env vars**: `AI_QUOTA_ENABLED` (default 1), `AI_QUOTA_INITIAL_REQUESTS` (20), `AI_QUOTA_INITIAL_TOKENS` (10000)
8. **Test safety**: `AI_QUOTA_ENABLED=0` in test server (run.sh) to avoid quota interference

### AI Quota Fallback (Basic Mode)
1. **Fallback logic** (`lib/agent/index.ts`): When LLM mode active but daily limit reached or kill switch on, chat falls back to mock agent (Basic Mode) instead of blocking. One-time notice with 60s dedupe per user.
2. **`checkAiAvailability()`** (`lib/llm-agent.ts`): Exported function returns `{ available, reason }` for kill_switch, daily_limit, no_key.
3. **`/api/ai/status`** endpoint: Returns `{ mode, available, limited, llmEnabled, reason }` for UI consumption.
4. **`AiStatusBadge`** component: Shows "Basic Mode" (non-LLM), "AI: active" (LLM available), or "AI: limited" (quota exhausted/forced). Tap to toggle force-basic mode (stored in localStorage).
5. **`forceBasicMode`** request payload: ChatPanel sends localStorage flag in POST body; server uses mock agent when set.
6. **Build/deploy independence**: Build/deploy paths check credits only, not AI quota. Mock agent can still trigger builds.
7. **Messaging rules**: AI quota exhausted → "AI quota reached" (no credit mention); credits reserved → "Credits reserved" (no AI mention).

### Credits Reserve & Purchase Bonus
1. **Reserve threshold** (`CREDIT_RESERVE_MIN=2`): `atomicDeduct` and `requireCredits` enforce `remaining >= reserve`. `InsufficientCreditsError` has `reserved: boolean` flag.
2. **Purchase bonus** (`CREDIT_PURCHASE_BONUS=2`): `addCreditsWithBonus()` creates two ledger entries — purchase + bonus. `/api/billing/add-credits` uses it.
3. **Balance API**: Returns `reserved` and `reserveMin` fields.
4. **UI**: CreditsBanner/Badge/CreditsSection show reserved-specific messaging. Messages route shows "Credits reserved" vs "Insufficient credits".
5. **Input validation**: add-credits rejects non-integer amounts.

## Phase-2.6 Changes (2026-03-13)

### OpenAI Cost Controls
1. **OpenAiUsage Model**: `prisma/schema.prisma` — tracks per-user daily request count and token usage. Unique on `[userId, date]`.
2. **Kill Switch**: `OPENAI_KILL_SWITCH=1` → all LLM requests return "LLM temporarily disabled." immediately.
3. **Daily Caps**: `OPENAI_MAX_REQUESTS_PER_DAY_PER_USER` (default 50), `OPENAI_MAX_TOKENS_PER_DAY_PER_USER` (default 20000).
4. **Per-Request Limit**: `OPENAI_MAX_TOKENS_PER_REQUEST` (default 800).
5. **Usage Tracking**: `incrementUsage()` called after each successful OpenAI call, records tokens used.
6. **Exported**: `isKillSwitchEnabled()` for test assertions.

### Billing & Credits System
1. **Prisma models**: `CreditLedger` (userId, amount, reason, source), `CreditBalance` (userId unique, balance), `CreditUsage` (userId, jobId?, projectId?, amount, action)
2. **Core library** (`lib/credits.ts`): `getBalance()`, `addCredits()`, `deductCredits()`, `requireCredits()` — all transactional; `InsufficientCreditsError` typed error; `creditsEnabled()` kill switch via `CREDITS_ENABLED` env
3. **API routes**: `GET /api/billing/balance` (balance + low/threshold), `GET /api/billing/ledger` (paginated), `POST /api/billing/add-credits` (mock top-up for dev; blocked when Stripe keys present)
4. **Enforcement**: Build blocked if insufficient credits (returns guidance message with billing CTA, no Job created). Deploy blocked in job-runner with logged error. Chat always continues regardless of credits.
5. **Smart confirm**: When `showConfirmBuild` is true, phrases like "yes", "ok", "go ahead" etc. auto-map to "Build it" in Build mode.
6. **UI**: `CreditsBadge` (clickable coin count in headers), `CreditsBanner` (red/yellow warning bar), `CreditsSection` in Database tab, `/billing` page with plan info + mock credit packages + transaction history.
7. **Env vars**: `CREDITS_ENABLED` (default 1), `COST_BUILD` (10), `COST_DEPLOY` (5), `COST_LLM_REQUEST` (1), `LOW_CREDITS_THRESHOLD` (5)
8. **Test safety**: `CREDITS_ENABLED=0` in test server (run.sh) to avoid credit interference with tests.

### Observability Dashboard
1. **API route**: `GET /api/metrics/summary` (auth-protected) returns job counts (24h/7d by status), deployment counts (7d), OpenAI usage (today + 7d with remaining quotas), recent rate limit buckets, and latest 50 error logs.
2. **Frontend**: Observability section at top of Database tab with stat cards for jobs, deploys, OpenAI usage, rate limit table, and scrollable error log. Auto-refreshes every 30s with manual Refresh button.
3. **Multi-tenant safe**: All queries scoped to session user's projects/data.

### Memory Controls
1. **API routes** (all auth-protected):
   - `GET /api/memory` — lists non-expired MemoryItems for current user. Supports `?scope=user|project|all` and `?projectId=<id>` filters.
   - `DELETE /api/memory?id=<memoryId>` — deletes a single MemoryItem owned by session user.
   - `POST /api/memory/clear` — bulk delete by `{ scope, projectId? }`. Returns `{ ok: true, deleted: N }`.
   - `POST /api/memory/cleanup` — deletes expired rows for session user.
2. **Frontend (DatabasePanel)**: Memory section at top of Database tab with expandable rows (scope badge, key, truncated value with "Show more"), per-row delete button, and Clear User/Clear Project/Clear All buttons with confirmation dialogs.
3. **Security**: All endpoints verify `session.user.id` ownership. Never leaks across users.

### Rate Limiting / Abuse Protection
1. **DB-backed rate limiting** (`lib/rate-limit.ts`): Uses `RateLimitBucket` Prisma model with atomic transaction-based counting per time window.
2. **Protected endpoints**:
   - `POST /api/projects/[id]/chat` — `CHAT_POST_LIMIT_PER_MIN` (default 30)
   - `POST /api/chats/[id]/messages` — shares `chat_post` key, same limit
   - `GET /api/jobs/[jobId]/stream` — `JOB_STREAM_CONCURRENT_LIMIT` (default 3), in-memory tracking with release on close/cancel
   - `GET /api/deployments/[deploymentId]/proxy/*` — `PROXY_REQ_LIMIT_PER_MIN` (default 120)
3. **Multi-tenant keyed** by userId (preferred), fallback to IP for unauth endpoints.
4. **Kill switch**: `RATE_LIMITS_ENABLED=0` disables all rate limiting (default enabled). Test server uses `RATE_LIMITS_ENABLED=0`.
5. **429 response format**: `{ error: "Rate limit exceeded", key, resetAt, limit }`
6. **Self-test route**: `GET /api/tests/ratelimit` (auth-protected) exercises the rate limiter and returns pass/fail JSON.
7. **Cleanup**: `cleanupExpiredBuckets()` removes stale windows older than 5 minutes.

### Workspace + Process Cleanup
1. **Cleanup Module** (`lib/cleanup.ts`): `cleanupWorkspaces()` removes expired workspaces (TTL-based) and excess per-user workspaces. `cleanupDeployments()` stops expired and excess deployments.
2. **Opportunistic Cleanup**: `opportunisticCleanup()` runs at most once per 60 seconds, called from `createBuildJob()` and proxy handler.
3. **Safe Path Traversal**: `safePath()` validates workspace paths against `/tmp/workspaces/` base, rejects `..` and `/`.
4. **Env Vars**: `WORKSPACE_TTL_HOURS` (default 24), `MAX_WORKSPACES_PER_USER` (default 20), `MAX_ACTIVE_DEPLOYMENTS_PER_USER` (default 5).

### 500+ Test Regression Harness
1. **20 test files**, 564 runtime tests covering auth, build gate, LLM flow, runner/deploy, memory, schema integrity, API surface, cost controls, cleanup, edge cases, DB operations, and parameterized DB fixtures.
2. **Self-contained runner**: `bash tests/run.sh` — starts its own temporary mock server on a random port (no manual env changes needed), runs 2 batches (DB-only first, then API), prints `TOTAL: X passed, Y failed`, and stops the server. Uses `NEXT_DIST_DIR` for separate build dir, `TMPDIR` for vitest cache.
3. **Two-batch strategy**: Batch 1 (DB-only, no server needed, ~8s) + Batch 2 (API tests with mock server, ~63s). Total ~80-90s, well under 120s.
4. **Framework**: Vitest with sequential file execution (`fileParallelism: false`), `cacheDir` set to `.tmp-vitest/.vitest-cache` to avoid `/tmp` quota issues.
5. **Test helpers**: `createCompletedJob()` in `tests/helpers.ts` creates fully self-contained test fixtures with Job + JobLogs + BuildArtifact + Deployment records matching `[RUNNER]`/`[DEPLOY]` log patterns (for DB-only assertions).
6. **Mock agent**: `generateBuildLogs()` in `apps/web/lib/mock-agent.ts` produces `[MOCK]` prefixed simulation logs. Delay configurable via `MOCK_LOG_DELAY_MS` env var (default 400ms). Run.sh uses `MOCK_LOG_DELAY_MS=10` for fast test execution.
7. **Contract**: Mock-agent logs use `[MOCK]` prefix (product behavior). `[RUNNER]`/`[DEPLOY]` patterns are ONLY in `createCompletedJob()` fixtures for test assertions.
8. **Verified**: 564 tests, 0 failures (Batch 1: 285 DB-only, Batch 2: 279 API).

## Phase-5 Changes (2026-03-19)

### Plans + Limits + Autoscale Foundation
1. **Prisma models**: `Subscription` (userId unique, planKey, status, currentPeriodEnd, stripeCustomerId, stripeSubscriptionId), `PlanConfig` (planKey unique PK, maxRunningBuilds, maxQueuedBuilds, maxAiRequestsPerMonth, maxAiTokensPerMonth, maxDeploysPerDay, priority)
2. **Core library** (`lib/plans.ts`): `getUserPlan()` (cached 60s), `getLimits()` (admin → unlimited), `getLimitsByPlan()`, `setUserPlan()`, `isOwnerUnlimited()`, `PLAN_DISPLAY`. Three tiers: basic (free), pro ($29/mo), enterprise ($99/mo).
3. **Enforcement**:
   - **build-queue.ts**: Plan-based `maxRunningBuilds` + `maxQueuedBuilds` (basic: 1/3, pro: 3/10, enterprise: 10/50). Priority set by plan (0/10/20). Friendly error with "Upgrade" mention.
   - **rate-limit.ts**: Plan-based multiplier (basic: 1x, pro: 3x, enterprise: 10x) on rate limits.
   - **Admin bypass**: All limits bypassed for admin users.
4. **API routes**: `GET/POST /api/billing/plan` (view/change plan), admin stats extended with planCounts, queueByPlan, topUsersByBuilds, topUsersByAi, MRR placeholder.
5. **UI**: Billing page with plan cards (Basic/Pro/Enterprise) + upgrade buttons + plan limits display. `PlanBadge` component in headers. Admin dashboard with plan distribution, queue by plan, top users, MRR card.
6. **Tests**: 19 new tests (565–583) covering plan defaults, upgrade/downgrade, queue enforcement with plan limits, subscription model, PlanConfig model, admin stats plan data.

## Database Schema (Prisma)
- **User** (id, name, email, emailVerified, image)
- **Account** (NextAuth standard)
- **Session** (NextAuth standard)
- **VerificationToken** (NextAuth standard)
- **Project** (id, userId, name, **specJson**, createdAt) — relation to User
- **Chat** (id, projectId, createdAt) — relation to Project
- **Message** (id, chatId, mode, role, content, createdAt) — relation to Chat
- **Job** (id, projectId, userId, status, createdAt) — relation to Project, User
- **JobLog** (id, jobId, level, message, createdAt) — relation to Job
- **BuildArtifact** (id, jobId, filePath, contentHash, sizeBytes, createdAt) — relation to Job
- **Deployment** (id, jobId, projectId, userId, provider, status, url, error, **internalPort**, **workspacePath**, createdAt) — relation to Job, Project, User
- **MemoryItem** (id, userId, projectId?, scope, key, value, createdAt, expiresAt) — 90-day TTL, @@unique([userId, projectId, scope, key])
- **OpenAiUsage** (id, userId, date, requests, tokens) — @@unique([userId, date])
- **RateLimitBucket** (id, userId?, ip?, key, windowStart, windowSec, count) — @@unique([userId, ip, key, windowStart])
- **Subscription** (id, userId unique, planKey, status, currentPeriodEnd?, stripeCustomerId?, stripeSubscriptionId?) — relation to User
- **PlanConfig** (planKey PK unique, maxRunningBuilds, maxQueuedBuilds, maxAiRequestsPerMonth, maxAiTokensPerMonth, maxDeploysPerDay, priority)

## Environment Variables (Required)
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL` — Public domain URL
- `NEXTAUTH_SECRET` — NextAuth secret (`openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret

## Environment Variables (Optional — Phase-2)
- `AI_AGENT_MODE` — `mock` (default) or `llm`. Controls which agent handles chat.
- `OPENAI_API_KEY` — Required when `AI_AGENT_MODE=llm`. Without it, LLM mode returns a stub warning.
- `OPENAI_MODEL` — Model to use (default: `gpt-4o-mini`)
- `BUILD_RUNNER_MODE` — `mock` (default) or `real`. Controls whether builds use mock logs or real sandboxed runner.
- `OPENAI_KILL_SWITCH` — `1` to disable all LLM requests immediately.
- `OPENAI_MAX_TOKENS_PER_REQUEST` — Max tokens per OpenAI request (default: 800).
- `OPENAI_MAX_REQUESTS_PER_DAY_PER_USER` — Daily request cap per user (default: 50).
- `OPENAI_MAX_TOKENS_PER_DAY_PER_USER` — Daily token cap per user (default: 20000).
- `WORKSPACE_TTL_HOURS` — Hours before workspace cleanup (default: 24).
- `MAX_WORKSPACES_PER_USER` — Max workspaces per user before cleanup (default: 20).
- `MAX_ACTIVE_DEPLOYMENTS_PER_USER` — Max active deployments per user (default: 5).

## Start Command (Replit)
```
cd apps/web && HOSTNAME=0.0.0.0 npx next dev -p 5000
```

## Backup Archives
- `ai-workspace-phase1.tar.gz` — Original Phase-1 archive
- `ai-workspace-phase1-final-locked.tar.gz` — Final locked state (2026-03-11)
- `ai-workspace-full-backup-v2.tar.gz` — Full backup v2 (27MB)

## Verification Endpoints
- `GET /api/health` → `{"ok": true}` (public)
- `GET /api/agent-mode` → `{"mode":"mock"|"llm","hasOpenAiKey":bool,"buildRunnerMode":"mock"|"real"}` (public)
- `GET /api/debug-routes` → Route existence check (public)
- `GET /api/tests/phase1` → Deterministic validation JSON (auth required)
- `GET /api/auth/providers` → Google provider info
- `GET /api/jobs/:jobId/logs` → SSE stream (auth required, 401 unauthenticated)
- `GET /api/jobs/:jobId/stream` → SSE stream with resume (auth required, 401 unauthenticated)
- `GET /api/jobs/:jobId/verify` → Job summary (auth required)
- `GET /api/projects/:id/deployments` → Latest deployments with internalPort (auth required)
- `GET /api/deployments/:id` → Debug endpoint: deployment info + processRunning + livePort (auth required)
- `/api/deployments/:id/proxy` → Reverse proxy to deployed app, auto-relaunches if process died (auth required)
- `/api/deployments/:id/proxy/*` → Reverse proxy subpath routing (auth required)
