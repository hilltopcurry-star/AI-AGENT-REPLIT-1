"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MessageSquare,
  Trash2,
  ArrowLeft,
  Sparkles,
  Pencil,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Chat {
  id: string;
  createdAt: string;
}

interface WorkspaceSidebarProps {
  projectId: string;
  projectName: string;
  activeChatId: string | null;
  onChatSelect: (chatId: string) => void;
}

export function WorkspaceSidebar({
  projectId,
  projectName,
  activeChatId,
  onChatSelect,
}: WorkspaceSidebarProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(projectName);

  const { data: project } = useQuery<{
    chats: Chat[];
  }>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
  });

  const createChat = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/chats`),
    onSuccess: async (res) => {
      const chat = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      onChatSelect(chat.id);
    },
  });

  const deleteChat = useMutation({
    mutationFn: (chatId: string) =>
      apiRequest("DELETE", `/api/chats/${chatId}`),
    onSuccess: (_data, deletedChatId) => {
      if (activeChatId === deletedChatId) {
        const remaining = chats.filter((c) => c.id !== deletedChatId);
        onChatSelect(remaining[0]?.id || "");
      }
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
  });

  const renameProject = useMutation({
    mutationFn: (name: string) =>
      apiRequest("PATCH", `/api/projects/${projectId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsEditing(false);
    },
  });

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== projectName) {
      renameProject.mutate(trimmed);
    } else {
      setIsEditing(false);
      setEditName(projectName);
    }
  };

  const chats = project?.chats || [];

  return (
    <div className="w-56 border-r border-border bg-sidebar flex flex-col h-full">
      <div className="p-3 border-b border-sidebar-border">
        <Button
          data-testid="button-back-projects"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 mb-2 text-sidebar-foreground"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Button>
        <div className="flex items-center gap-2 px-2 group">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                data-testid="input-project-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditName(projectName);
                  }
                }}
                className="h-6 text-sm px-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleRename}
                data-testid="button-confirm-rename"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <span
                className="text-sm font-medium text-sidebar-foreground truncate flex-1"
                data-testid="text-project-name"
              >
                {projectName}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                onClick={() => {
                  setEditName(projectName);
                  setIsEditing(true);
                }}
                data-testid="button-edit-project-name"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-2">
        <Button
          data-testid="button-new-chat"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground"
          onClick={() => createChat.mutate()}
          disabled={createChat.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {chats.map((chat, i) => (
            <div
              key={chat.id}
              data-testid={`button-chat-${chat.id}`}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer group ${
                activeChatId === chat.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              onClick={() => onChatSelect(chat.id)}
            >
              <div className="flex items-center gap-2 truncate">
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Chat {chats.length - i}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                data-testid={`button-delete-chat-${chat.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat.mutate(chat.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
