"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  ArrowLeft,
  Users,
  FolderKanban,
  Layers,
  Coins,
  Brain,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  DollarSign,
  Crown,
  Shield,
  Zap,
  BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";

interface QueueJob {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  userEmail: string | null;
  userName: string | null;
  projectName: string;
  createdAt: string;
  lockedBy: string | null;
}

interface TopUser {
  userId: string;
  email: string | null;
  name: string | null;
  builds?: number;
  requests?: number;
  tokens?: number;
}

interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  queueDepth: {
    queued: number;
    running: number;
    failed: number;
    success: number;
    total: number;
  };
  recentQueueJobs: QueueJob[];
  creditsSold: number;
  aiQuotaSold: { requests: number; tokens: number };
  planCounts: Record<string, number>;
  queueByPlan: Record<string, { queued: number; running: number }>;
  topUsersByBuilds: TopUser[];
  topUsersByAi: TopUser[];
  mrr: { placeholder: boolean; estimated: number };
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "QUEUED":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "RUNNING":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "SUCCESS":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "FAILED":
    case "CANCELLED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function QueueJobRow({ job }: { job: QueueJob }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(job.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const truncatedId = job.id.length > 8 ? job.id.slice(0, 4) + "..." + job.id.slice(-4) : job.id;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={job.status} />
          <span className={`text-xs font-medium ${
            job.status === "SUCCESS" ? "text-emerald-500" :
            job.status === "FAILED" ? "text-red-500" :
            job.status === "RUNNING" ? "text-blue-500" :
            "text-yellow-500"
          }`}>{job.status}</span>
        </div>
      </td>
      <td className="py-2 px-3">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={job.id}
          data-testid={`button-copy-id-${job.id}`}
        >
          {truncatedId}
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </td>
      <td className="py-2 px-3 text-muted-foreground text-xs">{job.userEmail || job.userName || "\u2014"}</td>
      <td className="py-2 px-3 text-xs">{job.projectName}</td>
      <td className="py-2 px-3 text-xs font-mono">{job.attempts}/{job.maxAttempts}</td>
      <td className="py-2 px-3 text-xs text-muted-foreground">{job.lockedBy || "\u2014"}</td>
      <td className="py-2 px-3 text-xs font-mono text-muted-foreground">
        {new Date(job.createdAt).toLocaleString()}
      </td>
      <td className="py-2 px-3 text-xs text-red-500 max-w-[200px] truncate">
        {job.error || "\u2014"}
      </td>
      <td className="py-2 px-3">
        <a
          href={`/api/queue/${job.id}/stream`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid={`link-stream-${job.id}`}
        >
          <ExternalLink className="h-3 w-3" />
          Stream
        </a>
      </td>
    </tr>
  );
}

function formatTokens(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const { data, isLoading, error } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch("/api/admin/stats").then((r) => {
      if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load");
      return r.json();
    }),
    refetchInterval: 10000,
    enabled: !!session,
  });

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-red-500">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">Admin Dashboard</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/projects")}
          className="gap-1"
          data-testid="button-back-projects"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {isLoading || !data ? (
          <div className="text-center text-muted-foreground py-12">Loading stats...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mb-8">
              <Card data-testid="card-total-users">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Users</CardDescription>
                  <CardTitle className="text-2xl" data-testid="text-total-users">{data.totalUsers}</CardTitle>
                </CardHeader>
              </Card>

              <Card data-testid="card-total-projects">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" /> Projects</CardDescription>
                  <CardTitle className="text-2xl">{data.totalProjects}</CardTitle>
                </CardHeader>
              </Card>

              <Card data-testid="card-queue-depth">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Queue</CardDescription>
                  <CardTitle className="text-lg">
                    <span className="text-yellow-500" data-testid="text-queue-queued">{data.queueDepth.queued}Q</span>
                    {" / "}
                    <span className="text-blue-500" data-testid="text-queue-running">{data.queueDepth.running}R</span>
                    {" / "}
                    <span className="text-red-500">{data.queueDepth.failed}F</span>
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card data-testid="card-credits-sold">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> Credits Sold</CardDescription>
                  <CardTitle className="text-2xl">{data.creditsSold}</CardTitle>
                </CardHeader>
              </Card>

              <Card data-testid="card-ai-quota-sold">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><Brain className="h-3.5 w-3.5" /> AI Sold</CardDescription>
                  <CardTitle className="text-lg">{data.aiQuotaSold.requests} req</CardTitle>
                </CardHeader>
              </Card>

              <Card data-testid="card-mrr">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Est. MRR</CardDescription>
                  <CardTitle className="text-2xl" data-testid="text-mrr">${data.mrr.estimated}</CardTitle>
                  {data.mrr.placeholder && <span className="text-[10px] text-muted-foreground">placeholder</span>}
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 mb-8">
              <Card data-testid="card-plan-distribution">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Active Plans
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { key: "basic", label: "Basic", icon: Zap, color: "text-muted-foreground" },
                      { key: "pro", label: "Pro", icon: Crown, color: "text-blue-500" },
                      { key: "enterprise", label: "Enterprise", icon: Shield, color: "text-violet-500" },
                    ].map(({ key, label, icon: Icon, color }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className={`flex items-center gap-2 text-sm ${color}`}>
                          <Icon className="h-4 w-4" />
                          {label}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold" data-testid={`text-plan-count-${key}`}>
                            {data.planCounts[key] || 0}
                          </span>
                          {data.queueByPlan[key] && (
                            <span className="text-[10px] text-muted-foreground">
                              ({data.queueByPlan[key].queued}Q/{data.queueByPlan[key].running}R)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-top-users">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Top Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground font-medium mb-2">By Builds</div>
                    {data.topUsersByBuilds.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No data</div>
                    ) : (
                      data.topUsersByBuilds.map((u, i) => (
                        <div key={u.userId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            {i + 1}. {u.email || u.name || u.userId.slice(0, 8)}
                          </span>
                          <span className="font-mono font-bold">{u.builds}</span>
                        </div>
                      ))
                    )}
                    <div className="text-xs text-muted-foreground font-medium mt-3 mb-2">By AI Usage</div>
                    {data.topUsersByAi.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No data</div>
                    ) : (
                      data.topUsersByAi.map((u, i) => (
                        <div key={u.userId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            {i + 1}. {u.email || u.name || u.userId.slice(0, 8)}
                          </span>
                          <span className="font-mono font-bold">{u.requests} req / {formatTokens(u.tokens || 0)} tok</span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4">Recent Queue Jobs (last 20)</h2>
              {data.recentQueueJobs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
                  No queue jobs yet
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-queue-jobs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">QueueJobId</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">User</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Project</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Attempts</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Worker</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Created</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Error</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Stream</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentQueueJobs.map((job) => (
                        <QueueJobRow key={job.id} job={job} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
