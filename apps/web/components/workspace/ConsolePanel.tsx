"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Terminal,
  CheckCircle2,
  XCircle,
  Circle,
} from "lucide-react";

interface Job {
  id: string;
  status: string;
  createdAt: string;
  _count: { logs: number };
}

interface LogEntry {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

interface ConsolePanelProps {
  projectId: string;
  activeJobId?: string | null;
}

function formatTimestamp(date: string) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ConsolePanel({ projectId, activeJobId }: ConsolePanelProps) {
  const [streamingLogs, setStreamingLogs] = useState<LogEntry[]>([]);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [deploymentProvider, setDeploymentProvider] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/projects", projectId, "jobs"],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/jobs`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const currentJobId = selectedJobId || activeJobId || jobs?.[0]?.id;

  useEffect(() => {
    if (activeJobId) {
      setSelectedJobId(activeJobId);
    }
  }, [activeJobId]);

  useEffect(() => {
    if (!currentJobId) return;

    setStreamingLogs([]);
    setJobStatus(null);
    setDeploymentUrl(null);
    setDeploymentProvider(null);
    seenIdsRef.current = new Set();

    const eventSource = new EventSource(`/api/jobs/${currentJobId}/logs`);

    eventSource.onmessage = (event) => {
      const data = event.data;
      if (data === "[DONE]") {
        eventSource.close();
        return;
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "job_done") {
          setJobStatus(parsed.status);
          if (parsed.deploymentUrl) setDeploymentUrl(parsed.deploymentUrl);
          if (parsed.deploymentProvider) setDeploymentProvider(parsed.deploymentProvider);
          eventSource.close();
        } else if (parsed.id && !seenIdsRef.current.has(parsed.id)) {
          seenIdsRef.current.add(parsed.id);
          setStreamingLogs((prev) => [...prev, parsed]);
        }
      } catch {
        // skip
      }
    };

    eventSource.addEventListener("done", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data);
        setJobStatus(parsed.status);
        if (parsed.deploymentUrl) setDeploymentUrl(parsed.deploymentUrl);
        if (parsed.deploymentProvider) setDeploymentProvider(parsed.deploymentProvider);
      } catch {
        // skip
      }
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [currentJobId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingLogs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "SUCCESS": return "text-emerald-400";
      case "WARN": return "text-amber-400";
      case "ERROR": return "text-red-400";
      default: return "text-zinc-400";
    }
  };

  const getLevelPrefix = (level: string) => {
    switch (level) {
      case "SUCCESS": return "\u2713";
      case "WARN": return "\u26A0";
      case "ERROR": return "\u2717";
      default: return "\u203A";
    }
  };

  if (!currentJobId) {
    return (
      <div className="flex flex-col h-full bg-zinc-950">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
          <Terminal className="h-4 w-4 text-zinc-500" />
          <span className="text-xs text-zinc-500 font-mono">Console</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-xl bg-zinc-900 flex items-center justify-center mx-auto border border-zinc-800">
              <Terminal className="h-7 w-7 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm text-zinc-400 font-medium" data-testid="text-no-builds">No builds yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Switch to Chat &rarr; Build mode and type &quot;Build it&quot;
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-500" />
            <span className="text-xs text-zinc-500 font-mono">Console</span>
          </div>
          {jobs && jobs.length > 1 && (
            <div className="flex items-center gap-1">
              {jobs.slice(0, 5).map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  data-testid={`button-job-${job.id}`}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    currentJobId === job.id
                      ? "bg-zinc-800 text-zinc-300"
                      : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  #{job.id.slice(0, 6)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {jobStatus ? (
            <Badge
              variant="outline"
              data-testid="badge-job-status"
              className={`text-[10px] font-mono border-0 ${
                jobStatus === "COMPLETED"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {jobStatus === "COMPLETED" ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {jobStatus}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-0 bg-blue-500/10 text-blue-400"
            >
              <Circle className="h-2 w-2 mr-1.5 fill-current animate-pulse" />
              RUNNING
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto font-mono" ref={scrollRef}>
        <div className="p-4 space-y-0.5">
          {streamingLogs.map((log, i) => (
            <div
              key={log.id || i}
              data-testid={`log-entry-${i}`}
              className="flex items-start gap-2 py-0.5 hover:bg-zinc-900/50 px-1 -mx-1 rounded group animate-in fade-in slide-in-from-left-1 duration-150"
            >
              <span className="text-[10px] text-zinc-700 font-mono w-16 flex-shrink-0 pt-0.5 select-none">
                {formatTimestamp(log.createdAt)}
              </span>
              <span className={`text-xs flex-shrink-0 w-3 ${getLevelColor(log.level)}`}>
                {getLevelPrefix(log.level)}
              </span>
              <span className={`text-xs leading-relaxed ${
                log.level === "SUCCESS" ? "text-emerald-400" :
                log.level === "ERROR" ? "text-red-400" :
                log.level === "WARN" ? "text-amber-400" :
                "text-zinc-300"
              }`}>
                {log.message}
              </span>
            </div>
          ))}
          {!jobStatus && streamingLogs.length > 0 && (
            <div className="flex items-center gap-2 py-1 px-1 text-zinc-600">
              <span className="w-16 flex-shrink-0" />
              <span className="w-3 flex-shrink-0" />
              <span className="inline-block w-2 h-3.5 bg-zinc-600 animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {jobStatus === "COMPLETED" && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Build completed &mdash; {streamingLogs.length} steps</span>
          </div>
          {deploymentUrl && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono mt-1">
              <span data-testid="text-deployment-url">
                {deploymentProvider === "fly" ? "Fly (Production)" : "Live URL"}:{" "}
                <a
                  href={deploymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-emerald-300"
                  data-testid="link-deployment-url"
                >
                  {deploymentUrl}
                </a>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
