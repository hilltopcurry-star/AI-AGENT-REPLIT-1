"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Database,
  Table2,
  FileJson,
  Layers,
  CheckCircle2,
  Code2,
  Activity,
  Hammer,
  Rocket,
  ExternalLink,
  Brain,
  Trash2,
  ChevronDown,
  ChevronRight,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Zap,
  Shield,
  Coins,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  specJson: Record<string, unknown> | null;
  createdAt: string;
}

interface Job {
  id: string;
  status: string;
  createdAt: string;
  _count: { logs: number };
}

interface DeploymentData {
  id: string;
  provider: string;
  status: string;
  url: string | null;
  error: string | null;
  createdAt: string;
}

interface MemoryItem {
  id: string;
  scope: string;
  key: string;
  value: string;
  projectId: string | null;
  createdAt: string;
  expiresAt: string;
}

interface MetricsSummary {
  jobs: {
    last24h: { running: number; completed: number; failed: number };
    last7d: { running: number; completed: number; failed: number };
    latest: Array<{ id: string; projectId: string; status: string; createdAt: string; logsCount: number }>;
  };
  deployments: {
    last7d: { success: number; failed: number };
    latest: Array<{ id: string; projectId: string; jobId: string; status: string; url: string | null; createdAt: string }>;
  };
  openaiUsage: {
    today: { requests: number; tokens: number; remainingRequests: number; remainingTokens: number };
    last7d: { requests: number; tokens: number };
  };
  rateLimits: Array<{ key: string; windowStart: string; windowSec: number; count: number }>;
  recentErrors: Array<{ id: string; jobId: string; createdAt: string; message: string; level: string }>;
}

interface DatabasePanelProps {
  projectId: string;
}

function SpecValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-1">
        {value.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-muted-foreground text-xs mt-0.5">&bull;</span>
            <span className="text-sm">{typeof item === "object" ? JSON.stringify(item) : String(item)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-2 mt-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex items-start gap-2 pl-2 border-l-2 border-border">
            <span className="text-xs text-muted-foreground font-mono min-w-[80px]">{k}:</span>
            <span className="text-sm">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-sm">{String(value)}</span>;
}

function SpecSection({ label, value, icon: Icon }: { label: string; value: unknown; icon?: typeof Database }) {
  const IconComponent = Icon || FileJson;

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid={`data-spec-${label}`}>
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label.replace(/([A-Z])/g, " $1").trim()}
        </span>
      </div>
      <SpecValue value={value} />
    </div>
  );
}

function TruncatedValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const maxLen = 200;

  if (value.length <= maxLen) {
    return <span className="text-xs font-mono break-all">{value}</span>;
  }

  return (
    <span className="text-xs font-mono break-all">
      {expanded ? value : value.slice(0, maxLen) + "…"}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-blue-400 hover:text-blue-300 underline text-[10px]"
        data-testid="btn-toggle-value"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </span>
  );
}

function CreditsSection() {
  const { data: balanceData } = useQuery<{ balance: number; enabled: boolean; low: boolean; reserved: boolean; reserveMin?: number }>({
    queryKey: ["/api/billing/balance"],
    queryFn: () => fetch("/api/billing/balance").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const { data: ledgerData } = useQuery<{ entries: Array<{ id: string; amount: number; reason: string; source: string; createdAt: string }> }>({
    queryKey: ["/api/billing/ledger", "db-panel"],
    queryFn: () => fetch("/api/billing/ledger?limit=10").then((r) => r.json()),
    refetchInterval: 15000,
  });

  if (!balanceData?.enabled) return null;

  const balance = balanceData?.balance ?? 0;
  const isReserved = balanceData?.reserved ?? false;
  const isLow = (balanceData?.low ?? false) && !isReserved;

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="data-credits">
      <div className="flex items-center gap-2 mb-3">
        <Coins className={`h-4 w-4 ${isReserved || balance === 0 ? "text-red-500" : isLow ? "text-yellow-500" : "text-primary"}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Credits
        </span>
        <span
          className={`ml-auto text-lg font-bold ${
            isReserved || balance === 0 ? "text-red-500" : isLow ? "text-yellow-500" : "text-foreground"
          }`}
          data-testid="text-db-credit-balance"
        >
          {balance}
        </span>
      </div>

      {isReserved && (
        <div className="rounded bg-red-500/10 border border-red-500/20 p-2 mb-3 text-xs text-red-500 text-center">
          You have {balance} credits reserved. <a href="/billing" className="underline font-medium">Add credits</a> to build and deploy.
        </div>
      )}
      {isLow && !isReserved && (
        <div className="rounded bg-yellow-500/10 border border-yellow-500/20 p-2 mb-3 text-xs text-yellow-600 dark:text-yellow-400 text-center">
          Credits low ({balance} remaining). <a href="/billing" className="underline font-medium">Add credits</a>
        </div>
      )}

      {ledgerData?.entries && ledgerData.entries.length > 0 && (
        <div className="max-h-[150px] overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50">
                <th className="text-left py-0.5 pr-2 font-medium">Date</th>
                <th className="text-left py-0.5 pr-2 font-medium">Reason</th>
                <th className="text-right py-0.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledgerData.entries.map((e) => (
                <tr key={e.id} className="border-b border-border/30">
                  <td className="py-0.5 pr-2 text-muted-foreground font-mono">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-0.5 pr-2 truncate max-w-[150px]">{e.reason}</td>
                  <td className={`py-0.5 text-right font-mono font-medium ${e.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {e.amount > 0 ? "+" : ""}{e.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="rounded border border-border/50 bg-muted/30 p-2 text-center min-w-[70px]">
      <div className={`text-lg font-bold ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ObservabilitySection() {
  const queryClient = useQueryClient();

  const { data: metrics, isLoading, dataUpdatedAt } = useQuery<MetricsSummary>({
    queryKey: ["/api/metrics/summary"],
    queryFn: () => fetch("/api/metrics/summary").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="data-observability">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observability
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">{lastRefresh}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/metrics/summary"] })}
            data-testid="btn-refresh-metrics"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isLoading || !metrics ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading metrics…</div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Hammer className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Jobs</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <StatCard label="Running" value={metrics.jobs.last24h.running} sub="24h" color="text-blue-400" />
              <StatCard label="Completed" value={metrics.jobs.last24h.completed} sub="24h" color="text-emerald-400" />
              <StatCard label="Failed" value={metrics.jobs.last24h.failed} sub="24h" color="text-red-400" />
              <StatCard label="Completed" value={metrics.jobs.last7d.completed} sub="7d" color="text-emerald-400" />
              <StatCard label="Failed" value={metrics.jobs.last7d.failed} sub="7d" color="text-red-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Rocket className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Deploys (7d)</span>
            </div>
            <div className="flex gap-2">
              <StatCard label="Success" value={metrics.deployments.last7d.success} color="text-emerald-400" />
              <StatCard label="Failed" value={metrics.deployments.last7d.failed} color="text-red-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">OpenAI Usage</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <StatCard label="Requests" value={metrics.openaiUsage.today.requests} sub="today" />
              <StatCard label="Tokens" value={metrics.openaiUsage.today.tokens} sub="today" />
              <StatCard label="Req Left" value={metrics.openaiUsage.today.remainingRequests} sub="today" color={metrics.openaiUsage.today.remainingRequests < 5 ? "text-red-400" : "text-emerald-400"} />
              <StatCard label="Tok Left" value={metrics.openaiUsage.today.remainingTokens} sub="today" color={metrics.openaiUsage.today.remainingTokens < 1000 ? "text-red-400" : "text-emerald-400"} />
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              7d total: {metrics.openaiUsage.last7d.requests} requests, {metrics.openaiUsage.last7d.tokens.toLocaleString()} tokens
            </div>
          </div>

          {metrics.rateLimits.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Shield className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Rate Limits (Recent)</span>
              </div>
              <div className="max-h-[120px] overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/50">
                      <th className="text-left py-0.5 pr-2 font-medium">Key</th>
                      <th className="text-left py-0.5 pr-2 font-medium">Window</th>
                      <th className="text-right py-0.5 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.rateLimits.map((rl, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-0.5 pr-2 font-mono">{rl.key}</td>
                        <td className="py-0.5 pr-2 text-muted-foreground">
                          {new Date(rl.windowStart).toLocaleTimeString()}
                          <span className="ml-1">({rl.windowSec}s)</span>
                        </td>
                        <td className="py-0.5 text-right">{rl.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                Recent Errors ({metrics.recentErrors.length})
              </span>
            </div>
            {metrics.recentErrors.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2 text-center" data-testid="text-no-errors">
                No recent errors
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto space-y-1" data-testid="list-recent-errors">
                {metrics.recentErrors.map((err) => (
                  <div key={err.id} className="rounded border border-red-500/20 bg-red-500/5 p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {err.jobId.slice(0, 12)}…
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(err.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-red-400 mt-0.5 break-all">
                      {err.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemorySection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: memoryItems, isLoading } = useQuery<MemoryItem[]>({
    queryKey: ["/api/memory"],
    queryFn: () => fetch("/api/memory").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/memory?id=${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memory"] }),
  });

  const clearMemory = useMutation({
    mutationFn: (body: { scope: string; projectId?: string }) =>
      fetch("/api/memory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memory"] }),
  });

  const items = memoryItems || [];

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="data-memory">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Memory Items
          </span>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-memory-count">
            {items.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={items.filter((i) => i.scope === "user").length === 0}
                data-testid="btn-clear-user-memory"
              >
                Clear User
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear User Memory</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all user-scoped memory items. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearMemory.mutate({ scope: "user" })}
                  data-testid="btn-confirm-clear-user"
                >
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={items.filter((i) => i.projectId === projectId).length === 0}
                data-testid="btn-clear-project-memory"
              >
                Clear Project
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Project Memory</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all memory items for this project. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearMemory.mutate({ scope: "project", projectId })}
                  data-testid="btn-confirm-clear-project"
                >
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300"
                disabled={items.length === 0}
                data-testid="btn-clear-all-memory"
              >
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Memory</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all memory items across all scopes and projects. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearMemory.mutate({ scope: "all" })}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="btn-confirm-clear-all"
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading memory…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center" data-testid="text-memory-empty">
          No memory items. The AI will store preferences and context as you chat.
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {items.map((item) => (
            <MemoryRow
              key={item.id}
              item={item}
              onDelete={() => deleteOne.mutate(item.id)}
              isDeleting={deleteOne.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryRow({
  item,
  onDelete,
  isDeleting,
}: {
  item: MemoryItem;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded border border-border/50 bg-muted/30 p-2 group"
      data-testid={`memory-item-${item.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-left min-w-0 flex-1"
          data-testid={`btn-expand-${item.id}`}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <Badge
            variant="outline"
            className={`text-[9px] shrink-0 ${
              item.scope === "user" ? "bg-violet-500/10 text-violet-400" : "bg-blue-500/10 text-blue-400"
            }`}
          >
            {item.scope}
          </Badge>
          <span className="text-xs font-medium truncate">{item.key}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`btn-delete-memory-${item.id}`}
        >
          <Trash2 className="h-3 w-3 text-red-400" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 pl-4 space-y-1">
          <div>
            <TruncatedValue value={item.value} />
          </div>
          {item.projectId && (
            <div className="text-[10px] text-muted-foreground">
              Project: <span className="font-mono">{item.projectId}</span>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            Expires: {new Date(item.expiresAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

const SECTION_ICONS: Record<string, typeof Database> = {
  purpose: FileJson,
  features: Layers,
  techStack: Code2,
  dataModel: Table2,
  architecture: Layers,
};

export function DatabasePanel({ projectId }: DatabasePanelProps) {
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const { data: healthData } = useQuery<{ ok: boolean }>({
    queryKey: ["/api/health"],
    queryFn: () => fetch("/api/health").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: agentModeData } = useQuery<{ mode: string; hasOpenAiKey: boolean; buildRunnerMode?: string }>({
    queryKey: ["/api/agent-mode"],
    queryFn: () => fetch("/api/agent-mode").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/projects", projectId, "jobs"],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/jobs`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const { data: deployments } = useQuery<DeploymentData[]>({
    queryKey: ["/api/projects", projectId, "deployments"],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/deployments`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const latestJob = jobs?.[0];
  const latestDeployment = deployments?.[0];
  const spec = project?.specJson;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Project Data</span>
        </div>
        {spec && (
          <Badge variant="outline" className="text-xs gap-1" data-testid="badge-spec-status">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Spec saved
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3 max-w-2xl mx-auto">
          <CreditsSection />

          <ObservabilitySection />

          <MemorySection projectId={projectId} />

          <div className="rounded-lg border border-border bg-card p-4" data-testid="data-health">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API Health &amp; Config
              </span>
            </div>
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto">
              {JSON.stringify({
                health: healthData || { ok: "loading..." },
                agentMode: agentModeData?.mode || "loading...",
                buildRunnerMode: agentModeData?.buildRunnerMode || "loading...",
              }, null, 2)}
            </pre>
          </div>

          {latestJob && (
            <div className="rounded-lg border border-border bg-card p-4" data-testid="data-latest-job">
              <div className="flex items-center gap-2 mb-2">
                <Hammer className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Latest Job
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">jobId:</span>
                  <span className="font-mono text-xs">{latestJob.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">status:</span>
                  <Badge variant="outline" className={`text-[10px] font-mono border-0 ${
                    latestJob.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-500" :
                    latestJob.status === "RUNNING" ? "bg-blue-500/10 text-blue-500" :
                    "bg-red-500/10 text-red-500"
                  }`}>
                    {latestJob.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">logs:</span>
                  <span className="text-xs">{latestJob._count?.logs || 0} rows</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">created:</span>
                  <span className="text-xs">{new Date(latestJob.createdAt).toLocaleString()}</span>
                </div>
                {agentModeData?.buildRunnerMode === "real" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono min-w-[60px]">workspace:</span>
                    <span className="font-mono text-xs text-muted-foreground">/tmp/workspaces/{latestJob.id}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {latestDeployment && (
            <div className="rounded-lg border border-border bg-card p-4" data-testid="data-latest-deployment">
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Latest Deployment
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">id:</span>
                  <span className="font-mono text-xs">{latestDeployment.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">status:</span>
                  <Badge variant="outline" className={`text-[10px] font-mono border-0 ${
                    latestDeployment.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-500" :
                    latestDeployment.status === "DEPLOYING" ? "bg-blue-500/10 text-blue-500" :
                    latestDeployment.status === "FAILED" ? "bg-red-500/10 text-red-500" :
                    "bg-yellow-500/10 text-yellow-500"
                  }`}>
                    {latestDeployment.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">provider:</span>
                  <span className="text-xs">{latestDeployment.provider}</span>
                </div>
                {latestDeployment.url && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono min-w-[60px]">url:</span>
                    <a
                      href={latestDeployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                      data-testid="link-deployment-url-db"
                    >
                      {latestDeployment.url.length > 60
                        ? latestDeployment.url.slice(0, 60) + "..."
                        : latestDeployment.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {latestDeployment.error && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground font-mono min-w-[60px]">error:</span>
                    <span className="text-xs text-red-400">{latestDeployment.error}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px]">created:</span>
                  <span className="text-xs">{new Date(latestDeployment.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {spec ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-foreground">{project?.name}</h3>
                <span className="text-xs text-muted-foreground">&middot;</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(project?.createdAt || "").toLocaleDateString()}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-card p-4" data-testid="data-spec-json">
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    specJson (read-only)
                  </span>
                </div>
                <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(spec, null, 2)}
                </pre>
              </div>

              {Object.entries(spec)
                .filter(([key]) => key !== "createdAt" && key !== "planGenerated")
                .map(([key, value]) => (
                  <SpecSection
                    key={key}
                    label={key}
                    value={value}
                    icon={SECTION_ICONS[key]}
                  />
                ))}
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Database className="h-7 w-7 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm text-foreground font-medium">No project specification</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Switch to <span className="font-medium text-violet-500">Plan</span> mode in Chat and describe your project. After a few exchanges, the AI will generate and save a spec here.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
