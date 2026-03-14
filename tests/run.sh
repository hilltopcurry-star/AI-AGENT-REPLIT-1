#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
export TMPDIR="$ROOT_DIR/.tmp-vitest"
mkdir -p "$TMPDIR"

RESULTS_FILE="$TMPDIR/results.txt"
: > "$RESULTS_FILE"

log() {
  echo "$@"
  echo "$@" >> "$RESULTS_FILE"
}

SERVER_PID=""
TEST_NEXT_DIR="$TMPDIR/.next-test"

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$TEST_NEXT_DIR" 2>/dev/null
}
trap cleanup EXIT

FREE_PORT=$(node -e "const s=require('net').createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})")

log "============================================"
log " Phase-2 Test Suite"
log "============================================"
log ""

TOTAL_PASS=0
TOTAL_FAIL=0
ALL_OK=true

run_batch() {
  local label="$1"
  shift
  local files=("$@")

  result=$(cd "$ROOT_DIR" && TMPDIR="$TMPDIR" NODE_OPTIONS="--max-old-space-size=384" npx vitest run --config tests/vitest.config.ts "${files[@]}" 2>&1)
  exit_code=$?

  tests_line=$(echo "$result" | grep "Tests" | head -1)
  passes=$(echo "$tests_line" | grep -oP '[0-9]+(?=\s+passed)' || echo 0)
  fails=$(echo "$tests_line" | grep -oP '[0-9]+(?=\s+failed)' || echo 0)
  passes=${passes:-0}
  fails=${fails:-0}

  TOTAL_PASS=$((TOTAL_PASS + passes))
  TOTAL_FAIL=$((TOTAL_FAIL + fails))

  if [ "$exit_code" -ne 0 ] || [ "$fails" -gt 0 ]; then
    ALL_OK=false
    log "  FAIL  $label: $passes passed, $fails failed"
    echo "$result" | tail -30 | tee -a "$RESULTS_FILE"
  else
    log "  PASS  $label: $passes passed"
  fi
}

log "--- Batch 1: DB-only tests (no server) ---"
run_batch "Batch 1/2 (DB-only)" \
  tests/05-memory.test.ts tests/11-cleanup.test.ts tests/12-cost-controls.test.ts \
  tests/13-schema-integrity.test.ts tests/16-memory-extended.test.ts \
  tests/18-db-operations.test.ts tests/19-regression-suite.test.ts tests/20-db-fixtures.test.ts

log ""
log "--- Batch 2: API tests (starting server) ---"
log "Starting test server on port $FREE_PORT (mock mode)..."

rm -rf "$TEST_NEXT_DIR" 2>/dev/null
mkdir -p "$TEST_NEXT_DIR"
rm -f "$ROOT_DIR/apps/web/.next/dev/lock" 2>/dev/null

lsof -ti :"$FREE_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

TEST_NEXT_REL=$(node -e "console.log(require('path').relative('$ROOT_DIR/apps/web', '$TEST_NEXT_DIR'))" 2>/dev/null || echo "$TEST_NEXT_DIR")

cd "$ROOT_DIR/apps/web"
AI_AGENT_MODE=mock \
BUILD_RUNNER_MODE=mock \
MOCK_LOG_DELAY_MS=10 \
RATE_LIMITS_ENABLED=0 \
CREDITS_ENABLED=0 \
AI_QUOTA_ENABLED=0 \
HOSTNAME=0.0.0.0 \
NEXT_DIST_DIR="$TEST_NEXT_REL" \
NODE_OPTIONS="--max-old-space-size=512" \
npx next dev -p "$FREE_PORT" \
  > "$TMPDIR/test-server.log" 2>&1 &
SERVER_PID=$!
cd "$ROOT_DIR"

for i in $(seq 1 60); do
  if curl -s "http://127.0.0.1:${FREE_PORT}/api/health" > /dev/null 2>&1; then
    MODE=$(curl -s "http://127.0.0.1:${FREE_PORT}/api/agent-mode" 2>/dev/null)
    log "Server ready (pid $SERVER_PID): $MODE"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "ERROR: Test server died during startup. Log tail:"
    tail -20 "$TMPDIR/test-server.log" | tee -a "$RESULTS_FILE"
    exit 1
  fi
  if [ "$i" -eq 60 ]; then
    log "ERROR: Server did not become ready in 60s. Log tail:"
    tail -20 "$TMPDIR/test-server.log" | tee -a "$RESULTS_FILE"
    exit 1
  fi
  sleep 1
done

export TEST_BASE_URL="http://127.0.0.1:${FREE_PORT}"

log "Warming up server routes..."
curl -s "$TEST_BASE_URL/api/health" > /dev/null 2>&1
curl -s "$TEST_BASE_URL/api/agent-mode" > /dev/null 2>&1
curl -s "$TEST_BASE_URL/api/projects" > /dev/null 2>&1
curl -s -X POST "$TEST_BASE_URL/api/chats/warmup/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"warmup","mode":"Discuss"}' > /dev/null 2>&1
log "Warmup complete."
log ""

run_batch "Batch 2/2 (API)" \
  tests/01-auth.test.ts tests/02-build-gate.test.ts tests/03-llm-flow.test.ts \
  tests/04-runner-deploy.test.ts tests/06-auth-extended.test.ts \
  tests/07-runner-extended.test.ts tests/08-deploy-proxy.test.ts \
  tests/09-sse-correctness.test.ts tests/10-misc-regressions.test.ts \
  tests/14-api-surface.test.ts tests/15-build-gate-extended.test.ts \
  tests/17-edge-cases.test.ts

log ""
log "============================================"
log "TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed"
log "============================================"

if [ "$ALL_OK" = false ]; then
  exit 1
fi
exit 0
