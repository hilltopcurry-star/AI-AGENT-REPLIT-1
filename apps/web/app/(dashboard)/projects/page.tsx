"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Sparkles,
  Trash2,
  MessageSquare,
  Hammer,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { CreditsBadge, AiStatusBadge, AiQuotaBadge, PlanBadge } from "@/components/credits-badge";
import { useEffect } from "react";

interface Project {
  id: string;
  name: string;
  createdAt: string;
  _count: { chats: number; jobs: number };
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
    enabled: !!session,
  });

  const createProject = useMutation({
    mutationFn: () => apiRequest("POST", "/api/projects", { name: "New Project" }),
    onSuccess: async (res) => {
      const project = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      router.push(`/projects/${project.id}`);
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">AI Workspace</span>
        </div>
        <div className="flex items-center gap-3">
          <PlanBadge />
          <AiStatusBadge />
          <AiQuotaBadge />
          <CreditsBadge />
          <span className="text-sm text-muted-foreground hidden sm:block">
            {session?.user?.name}
          </span>
          <Button
            data-testid="button-toggle-theme"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            data-testid="button-sign-out"
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="gap-1"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-projects-heading">
            Projects
          </h1>
          <Button
            data-testid="button-new-project"
            onClick={() => createProject.mutate()}
            disabled={createProject.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : !projects?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <Card
                key={project.id}
                data-testid={`card-project-${project.id}`}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex-1">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {project._count.chats} chats
                      </span>
                      <span className="flex items-center gap-1">
                        <Hammer className="h-3 w-3" />
                        {project._count.jobs} jobs
                      </span>
                    </CardDescription>
                  </div>
                  <Button
                    data-testid={`button-delete-project-${project.id}`}
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject.mutate(project.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
