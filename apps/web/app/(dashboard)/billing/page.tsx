"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  ArrowLeft,
  CreditCard,
  Coins,
  Plus,
  Zap,
  TrendingUp,
  Brain,
} from "lucide-react";
import { useEffect } from "react";

interface BalanceData {
  balance: number;
  enabled: boolean;
  low: boolean;
  threshold?: number;
}

interface AiQuotaData {
  enabled: boolean;
  remainingRequests: number;
  remainingTokens: number;
  low: boolean;
  exhausted: boolean;
}

interface LedgerEntry {
  id: string;
  amount: number;
  reason: string;
  source: string;
  createdAt: string;
}

interface AiQuotaLedgerEntry {
  id: string;
  amountRequests: number;
  amountTokens: number;
  reason: string;
  source: string;
  createdAt: string;
}

function formatTokens(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const { data: balanceData, isLoading: balLoading } = useQuery<BalanceData>({
    queryKey: ["/api/billing/balance"],
    queryFn: () => fetch("/api/billing/balance").then((r) => r.json()),
    enabled: !!session,
  });

  const { data: aiQuotaData, isLoading: aiQuotaLoading } = useQuery<AiQuotaData>({
    queryKey: ["/api/ai/quota"],
    queryFn: () => fetch("/api/ai/quota").then((r) => r.json()),
    enabled: !!session,
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: ["/api/billing/ledger"],
    queryFn: () => fetch("/api/billing/ledger").then((r) => r.json()),
    enabled: !!session,
  });

  const { data: aiLedgerData } = useQuery<{ entries: AiQuotaLedgerEntry[] }>({
    queryKey: ["/api/ai/quota-ledger"],
    queryFn: () => fetch("/api/ai/quota-ledger").then((r) => r.json()),
    enabled: !!session,
  });

  const addCreditsMut = useMutation({
    mutationFn: (amount: number) =>
      fetch("/api/billing/add-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/ledger"] });
    },
  });

  const addAiQuotaMut = useMutation({
    mutationFn: (pack: { requests: number; tokens: number }) =>
      fetch("/api/ai/add-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pack),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/quota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/quota-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
    },
  });

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const balance = balanceData?.balance ?? 0;
  const isLow = balanceData?.low ?? false;
  const aiReqs = aiQuotaData?.remainingRequests ?? 0;
  const aiTokens = aiQuotaData?.remainingTokens ?? 0;
  const aiEnabled = aiQuotaData?.enabled ?? false;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">AI Workspace</span>
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

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <CreditCard className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-billing-heading">
            Billing & Credits
          </h1>
        </div>

        <div className={`grid gap-6 ${aiEnabled ? "md:grid-cols-3" : "md:grid-cols-2"} mb-8`}>
          <Card data-testid="card-balance">
            <CardHeader>
              <CardDescription>Build Credits</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Coins className={`h-6 w-6 ${isLow ? "text-yellow-500" : balance === 0 ? "text-red-500" : "text-emerald-500"}`} />
                <span
                  className={`text-4xl font-bold ${
                    balance === 0 ? "text-red-500" : isLow ? "text-yellow-500" : "text-foreground"
                  }`}
                  data-testid="text-credit-balance"
                >
                  {balLoading ? "..." : balance}
                </span>
                <span className="text-lg text-muted-foreground font-normal">credits</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Build cost</span>
                  <span className="font-mono">10 credits</span>
                </div>
                <div className="flex justify-between">
                  <span>Deploy cost</span>
                  <span className="font-mono">5 credits</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {aiEnabled && (
            <Card data-testid="card-ai-quota">
              <CardHeader>
                <CardDescription>AI Quota</CardDescription>
                <CardTitle className="flex items-center gap-2">
                  <Brain className={`h-6 w-6 ${aiQuotaData?.exhausted ? "text-orange-500" : aiQuotaData?.low ? "text-yellow-500" : "text-violet-500"}`} />
                  <div className="flex flex-col">
                    <span
                      className={`text-2xl font-bold ${aiQuotaData?.exhausted ? "text-orange-500" : "text-foreground"}`}
                      data-testid="text-ai-quota-requests"
                    >
                      {aiQuotaLoading ? "..." : aiReqs}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">requests left</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Tokens remaining</span>
                    <span className="font-mono" data-testid="text-ai-quota-tokens">{formatTokens(aiTokens)}</span>
                  </div>
                  {aiQuotaData?.exhausted && (
                    <div className="rounded bg-orange-500/10 border border-orange-500/20 p-1.5 mt-2 text-center text-orange-500 font-medium">
                      AI quota exhausted — chat continues in Basic Mode
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-plan">
            <CardHeader>
              <CardDescription>Current Plan</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Developer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pay-as-you-go credits + AI quota. Welcome bonus on signup.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Build Credits
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { amount: 20, label: "Starter", price: "$2" },
              { amount: 50, label: "Builder", price: "$5" },
              { amount: 100, label: "Pro", price: "$10" },
            ].map((pkg) => (
              <Card
                key={pkg.amount}
                className="cursor-pointer hover:border-primary/50 transition-colors"
              >
                <CardHeader>
                  <CardTitle className="text-base">{pkg.label}</CardTitle>
                  <CardDescription>{pkg.amount} credits</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full gap-2"
                    variant={pkg.amount === 50 ? "default" : "outline"}
                    onClick={() => addCreditsMut.mutate(pkg.amount)}
                    disabled={addCreditsMut.isPending}
                    data-testid={`button-add-${pkg.amount}-credits`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    {addCreditsMut.isPending ? "Adding..." : `Add ${pkg.amount} credits`}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    +2 bonus credits · DEV MODE (mock)
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {aiEnabled && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Add AI Quota
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { requests: 50, tokens: 50000, label: "Starter AI", price: "$10" },
                { requests: 120, tokens: 150000, label: "Builder AI", price: "$20" },
                { requests: 1000, tokens: 1500000, label: "Pro AI", price: "$100" },
              ].map((pkg) => (
                <Card
                  key={pkg.requests}
                  className="cursor-pointer hover:border-violet-500/50 transition-colors"
                >
                  <CardHeader>
                    <CardTitle className="text-base">{pkg.label}</CardTitle>
                    <CardDescription>
                      +{pkg.requests} requests · +{formatTokens(pkg.tokens)} tokens
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full gap-2"
                      variant={pkg.requests === 120 ? "default" : "outline"}
                      onClick={() => addAiQuotaMut.mutate({ requests: pkg.requests, tokens: pkg.tokens })}
                      disabled={addAiQuotaMut.isPending}
                      data-testid={`button-add-ai-${pkg.requests}`}
                    >
                      <Brain className="h-4 w-4" />
                      {addAiQuotaMut.isPending ? "Adding..." : `${pkg.price} — Add AI Quota`}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      DEV MODE (mock)
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Build Credits History
          </h2>
          {ledgerLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
          ) : !ledgerData?.entries?.length ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
              No transactions yet
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm" data-testid="table-ledger">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Source</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground font-mono text-xs">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">{entry.reason}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          entry.source === "promo" ? "bg-violet-500/10 text-violet-500" :
                          entry.source === "mock" ? "bg-blue-500/10 text-blue-500" :
                          entry.source === "stripe" ? "bg-emerald-500/10 text-emerald-500" :
                          entry.source === "bonus" ? "bg-amber-500/10 text-amber-500" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {entry.source}
                        </span>
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-medium ${entry.amount > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {entry.amount > 0 ? "+" : ""}{entry.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {aiEnabled && aiLedgerData?.entries && aiLedgerData.entries.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Quota History
            </h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm" data-testid="table-ai-quota-ledger">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Source</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Requests</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {aiLedgerData.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground font-mono text-xs">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">{entry.reason}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          entry.source === "promo" ? "bg-violet-500/10 text-violet-500" :
                          entry.source === "mock" ? "bg-blue-500/10 text-blue-500" :
                          entry.source === "stripe" ? "bg-emerald-500/10 text-emerald-500" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {entry.source}
                        </span>
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-medium ${entry.amountRequests > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {entry.amountRequests > 0 ? "+" : ""}{entry.amountRequests}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-medium ${entry.amountTokens > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {entry.amountTokens > 0 ? "+" : ""}{formatTokens(entry.amountTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
