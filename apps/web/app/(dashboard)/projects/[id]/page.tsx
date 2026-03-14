"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { ConsolePanel } from "@/components/workspace/ConsolePanel";
import { DatabasePanel } from "@/components/workspace/DatabasePanel";
import {
  Sparkles,
  Terminal,
  Database,
} from "lucide-react";
import { CreditsBadge, CreditsBanner, AiStatusBadge, AiQuotaBadge } from "@/components/credits-badge";

interface Project {
  id: string;
  name: string;
  chats: { id: string; createdAt: string }[];
  jobs: { id: string; status: string; createdAt: string }[];
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("chat");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then((r) => r.json()),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (project?.chats?.[0]?.id && !activeChatId) {
      setActiveChatId(project.chats[0].id);
    }
  }, [project, activeChatId]);

  const handleJobCreated = (jobId: string) => {
    setActiveJobId(jobId);
    setActiveTab("console");
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Project not found
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <WorkspaceSidebar
        projectId={id}
        projectName={project.name}
        activeChatId={activeChatId}
        onChatSelect={setActiveChatId}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <CreditsBanner />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col h-full"
        >
          <div className="border-b border-border px-4 flex items-center justify-between">
            <TabsList className="h-10 bg-transparent p-0 gap-0">
              <TabsTrigger
                value="chat"
                data-testid="tab-chat"
                className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="console"
                data-testid="tab-console"
                className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Terminal className="h-3.5 w-3.5" />
                Console
              </TabsTrigger>
              <TabsTrigger
                value="database"
                data-testid="tab-database"
                className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Database className="h-3.5 w-3.5" />
                Database
              </TabsTrigger>
            </TabsList>
            <AiStatusBadge />
            <AiQuotaBadge />
            <CreditsBadge />
          </div>

          <TabsContent value="chat" className="flex-1 m-0 overflow-hidden">
            <ChatPanel
              chatId={activeChatId}
              projectId={id}
              onJobCreated={handleJobCreated}
            />
          </TabsContent>
          <TabsContent value="console" className="flex-1 m-0 overflow-hidden">
            <ConsolePanel projectId={id} activeJobId={activeJobId} />
          </TabsContent>
          <TabsContent value="database" className="flex-1 m-0 overflow-hidden">
            <DatabasePanel projectId={id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
