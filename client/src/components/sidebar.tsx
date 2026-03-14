import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageSquare, Plus, Trash2, Pencil, Check, X, LogOut, Moon, Sun, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { useTheme } from "./theme-provider";
import { useAuth } from "../hooks/use-auth";
import { apiRequest, queryClient } from "../lib/queryClient";
import type { Conversation } from "@shared/schema";

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", {});
      return res.json();
    },
    onSuccess: (conv: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setLocation(`/chat/${conv.id}`);
      onNavigate?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (location === `/chat/${id}`) {
        setLocation("/");
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const res = await apiRequest("PATCH", `/api/conversations/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditingId(null);
    },
  });

  const activeConvId = location.startsWith("/chat/")
    ? parseInt(location.split("/chat/")[1])
    : null;

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const saveEdit = (id: number) => {
    if (editTitle.trim()) {
      renameMutation.mutate({ id, title: editTitle.trim() });
    } else {
      setEditingId(null);
    }
  };

  return (
    <div className="w-72 h-screen flex flex-col border-r border-border bg-sidebar text-sidebar-foreground" data-testid="sidebar">
      <div className="p-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight">AI Chat</span>
      </div>

      <div className="px-3 pb-2">
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full justify-start gap-2"
          variant="outline"
          data-testid="button-new-chat"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-3 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-conversations">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  activeConvId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
                onClick={() => {
                  if (editingId !== conv.id) {
                    setLocation(`/chat/${conv.id}`);
                    onNavigate?.();
                  }
                }}
                data-testid={`link-conversation-${conv.id}`}
              >
                <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {editingId === conv.id ? (
                  <div className="flex-1 flex items-center gap-1">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-6 text-sm px-1.5"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      data-testid="input-rename-chat"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveEdit(conv.id);
                      }}
                      data-testid="button-save-rename"
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      data-testid="button-cancel-rename"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm truncate flex-1">{conv.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(conv);
                        }}
                        data-testid={`button-rename-${conv.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(conv.id);
                        }}
                        data-testid={`button-delete-${conv.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-3 space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={toggleTheme} data-testid="button-toggle-theme">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
        {user && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
                {(user.firstName || user.username || "U")[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm text-muted-foreground truncate flex-1" data-testid="text-username">
              {user.firstName || user.username}
            </span>
          </div>
        )}
        <a href="/api/logout">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive" data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </a>
      </div>
    </div>
  );
}
