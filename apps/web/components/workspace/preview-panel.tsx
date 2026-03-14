"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe, ExternalLink, RefreshCw, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface PreviewPanelProps {
  projectId?: string;
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const { data: project } = useQuery<{ specJson: Record<string, unknown> | null }>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  const hasSpec = !!project?.specJson;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-2">
            {([
              { key: "desktop", icon: Monitor, label: "Desktop" },
              { key: "tablet", icon: Tablet, label: "Tablet" },
              { key: "mobile", icon: Smartphone, label: "Mobile" },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewport(key)}
                data-testid={`button-viewport-${key}`}
                className={`p-1.5 transition-colors ${
                  viewport === key
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-refresh-preview">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-open-external">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center p-4">
        <div
          className={`bg-background border border-border rounded-lg shadow-lg flex items-center justify-center transition-all duration-300 ${
            viewport === "desktop" ? "w-full h-full" :
            viewport === "tablet" ? "w-[768px] max-w-full h-full" :
            "w-[375px] max-w-full h-full"
          }`}
        >
          {hasSpec ? (
            <div className="text-center space-y-3 p-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Preview ready</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your application preview will appear here after the build completes.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Waiting for build...
              </Badge>
            </div>
          ) : (
            <div className="text-center space-y-3 p-8">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <Globe className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No preview available</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Create a project plan and run a build first. The preview will show your running application.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
