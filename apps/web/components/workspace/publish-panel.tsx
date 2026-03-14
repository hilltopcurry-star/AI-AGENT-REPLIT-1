"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Rocket,
  Globe,
  Server,
  Shield,
  GitBranch,
  CheckCircle2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PublishPanelProps {
  projectId?: string;
}

const DEPLOY_TARGETS = [
  { name: "Vercel", description: "Optimized for Next.js", icon: "▲", recommended: true },
  { name: "Railway", description: "Full-stack deployments", icon: "🚂", recommended: false },
  { name: "Fly.io", description: "Edge compute", icon: "✈", recommended: false },
  { name: "AWS", description: "Full cloud control", icon: "☁", recommended: false },
];

const DEPLOY_CHECKS = [
  { label: "Project specification", key: "spec" },
  { label: "Build completed", key: "build" },
  { label: "Environment variables", key: "env" },
  { label: "Database configuration", key: "db" },
  { label: "Domain configuration", key: "domain" },
];

export function PublishPanel({ projectId }: PublishPanelProps) {
  const { data: project } = useQuery<{
    specJson: Record<string, unknown> | null;
    jobs: { id: string; status: string }[];
  }>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  const hasSpec = !!project?.specJson;
  const hasBuild = project?.jobs?.some((j) => j.status === "COMPLETED");
  const readyCount = [hasSpec, hasBuild].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Publish</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {readyCount}/5 checks passed
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Deployment Readiness
            </h3>
            <div className="space-y-2">
              {DEPLOY_CHECKS.map((check) => {
                const isReady =
                  (check.key === "spec" && hasSpec) ||
                  (check.key === "build" && hasBuild);
                return (
                  <div key={check.key} className="flex items-center gap-2" data-testid={`check-${check.key}`}>
                    {isReady ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${isReady ? "text-foreground" : "text-muted-foreground"}`}>
                      {check.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Deploy Target
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {DEPLOY_TARGETS.map((target) => (
                <button
                  key={target.name}
                  data-testid={`button-deploy-${target.name.toLowerCase()}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all text-left"
                >
                  <span className="text-lg">{target.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{target.name}</span>
                      {target.recommended && (
                        <Badge variant="secondary" className="text-[9px] px-1">Recommended</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{target.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={!hasSpec || !hasBuild}
            data-testid="button-deploy"
          >
            <Rocket className="h-4 w-4" />
            Deploy Application
          </Button>

          {(!hasSpec || !hasBuild) && (
            <p className="text-xs text-muted-foreground text-center">
              Complete all readiness checks before deploying. Start by creating a plan and running a build.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
