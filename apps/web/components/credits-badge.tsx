"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Coins, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";

interface BalanceData {
  balance: number;
  enabled: boolean;
  low: boolean;
  reserved: boolean;
  reserveMin?: number;
}

interface AiStatusData {
  mode: string;
  available: boolean;
  limited: boolean;
  llmEnabled: boolean;
  reason?: string | null;
}

export function useForceBasicMode() {
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setForced(localStorage.getItem("forceBasicMode") === "1");
    }
  }, []);

  const toggle = useCallback((val: boolean) => {
    setForced(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("forceBasicMode", val ? "1" : "0");
    }
  }, []);

  return { forced, toggle };
}

export function AiStatusBadge() {
  const { forced, toggle } = useForceBasicMode();
  const queryClient = useQueryClient();

  const { data } = useQuery<AiStatusData>({
    queryKey: ["/api/ai/status"],
    queryFn: () => fetch("/api/ai/status").then((r) => r.json()),
    refetchInterval: 30000,
  });

  if (!data) return null;

  const isLlmEnabled = data.llmEnabled;
  const isLimited = data.limited || forced;

  const handleClick = () => {
    if (!isLlmEnabled) return;
    if (forced) {
      toggle(false);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
    } else {
      toggle(true);
    }
  };

  if (!isLlmEnabled) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-2 py-1"
        data-testid="button-ai-status"
      >
        <Zap className="h-3.5 w-3.5" />
        <span data-testid="text-ai-status">Basic Mode</span>
      </div>
    );
  }

  if (forced) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        data-testid="button-ai-status"
        className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ZapOff className="h-3.5 w-3.5" />
        <span data-testid="text-ai-status">Basic Mode</span>
        <span className="text-[10px]">(tap to restore)</span>
      </Button>
    );
  }

  if (isLimited) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        data-testid="button-ai-status"
        className="gap-1.5 text-xs font-medium text-orange-500 hover:text-orange-600"
      >
        <ZapOff className="h-3.5 w-3.5" />
        <span data-testid="text-ai-status">AI: limited</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      data-testid="button-ai-status"
      className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <Zap className="h-3.5 w-3.5" />
      <span data-testid="text-ai-status">AI: active</span>
    </Button>
  );
}

interface AiQuotaData {
  enabled: boolean;
  remainingRequests: number;
  remainingTokens: number;
  low: boolean;
  exhausted: boolean;
}

export function AiQuotaBadge() {
  const router = useRouter();

  const { data } = useQuery<AiQuotaData>({
    queryKey: ["/api/ai/quota"],
    queryFn: () => fetch("/api/ai/quota").then((r) => r.json()),
    refetchInterval: 30000,
  });

  if (!data || !data.enabled) return null;

  const isExhausted = data.exhausted;
  const isLow = data.low && !isExhausted;

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return String(n);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push("/billing")}
      data-testid="button-ai-quota-badge"
      className={`gap-1.5 text-xs font-medium ${
        isExhausted
          ? "text-orange-500 hover:text-orange-600"
          : isLow
          ? "text-yellow-500 hover:text-yellow-600"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      <span data-testid="text-ai-quota">
        {data.remainingRequests} req / {formatTokens(data.remainingTokens)} tok
      </span>
      {isExhausted && <span className="text-[10px]">Add</span>}
    </Button>
  );
}

export function CreditsBadge() {
  const router = useRouter();

  const { data } = useQuery<BalanceData>({
    queryKey: ["/api/billing/balance"],
    queryFn: () => fetch("/api/billing/balance").then((r) => r.json()),
    refetchInterval: 30000,
  });

  if (!data || !data.enabled) return null;

  const isReserved = data.reserved;
  const isZero = data.balance === 0;
  const isLow = data.low && !isReserved;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push("/billing")}
      data-testid="button-credits-badge"
      className={`gap-1.5 text-xs font-medium ${
        isZero || isReserved
          ? "text-red-500 hover:text-red-600"
          : isLow
          ? "text-yellow-500 hover:text-yellow-600"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Coins className="h-3.5 w-3.5" />
      <span data-testid="text-credits-count">{data.balance}</span>
      {(isZero || isReserved) && <span className="text-[10px]">Add credits</span>}
    </Button>
  );
}

export function CreditsBanner() {
  const router = useRouter();

  const { data } = useQuery<BalanceData>({
    queryKey: ["/api/billing/balance"],
    queryFn: () => fetch("/api/billing/balance").then((r) => r.json()),
    refetchInterval: 30000,
  });

  if (!data || !data.enabled) return null;

  if (data.reserved) {
    return (
      <div
        className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-center gap-3"
        data-testid="banner-reserved-credits"
      >
        <span className="text-sm text-red-500 font-medium">
          You have {data.balance} credits reserved — add credits to build and deploy
        </span>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => router.push("/billing")}
          className="h-7 text-xs"
          data-testid="button-go-billing"
        >
          Go to Billing
        </Button>
      </div>
    );
  }

  if (data.low) {
    return (
      <div
        className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-1.5 flex items-center justify-center gap-3"
        data-testid="banner-low-credits"
      >
        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
          Low credits ({data.balance} remaining)
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/billing")}
          className="h-6 text-[10px] border-yellow-500/30"
          data-testid="button-add-credits-banner"
        >
          Add credits
        </Button>
      </div>
    );
  }

  return null;
}
