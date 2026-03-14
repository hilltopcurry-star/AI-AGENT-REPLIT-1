"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "./mode-selector";
import { useForceBasicMode } from "@/components/credits-badge";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  MessageSquare,
  FileText,
  Hammer,
  Wrench,
  Bug,
  Copy,
  Check,
} from "lucide-react";

interface Message {
  id: string;
  chatId: string;
  role: string;
  content: string;
  mode: string;
  createdAt: string;
}

interface ChatPanelProps {
  chatId: string | null;
  projectId: string;
  onJobCreated?: (jobId: string) => void;
}

const MODE_ICONS: Record<string, typeof Sparkles> = {
  Discuss: MessageSquare,
  Plan: FileText,
  Build: Hammer,
  Improve: Wrench,
  Debug: Bug,
};

const MODE_COLORS: Record<string, string> = {
  Discuss: "text-blue-500",
  Plan: "text-violet-500",
  Build: "text-orange-500",
  Improve: "text-emerald-500",
  Debug: "text-red-500",
};

const SUGGESTED_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  Discuss: [
    { label: "Build a SaaS", prompt: "I want to build a SaaS application for project management with team collaboration features" },
    { label: "E-commerce app", prompt: "Help me design an e-commerce platform with inventory management and payment processing" },
    { label: "API architecture", prompt: "I need to design a RESTful API for a mobile app with real-time features" },
  ],
  Plan: [
    { label: "Start planning", prompt: "Let's create a detailed specification for my project" },
    { label: "Tech stack help", prompt: "Help me choose the right technology stack for a high-traffic web application" },
  ],
  Build: [
    { label: "Start build", prompt: "Build it" },
  ],
  Improve: [
    { label: "Review my project", prompt: "Analyze my project spec and suggest improvements" },
    { label: "Performance audit", prompt: "Review the project for performance bottlenecks and optimization opportunities" },
  ],
  Debug: [
    { label: "Report a bug", prompt: "I'm seeing an error in my application and need help debugging it" },
  ],
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      data-testid="button-copy-code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0 pb-1 border-b border-border">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-4 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mb-1.5 mt-3 first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h4>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
        code: ({ className, children }) => {
          const match = /language-(\w+)/.exec(className || "");
          if (match) {
            return (
              <div className="group relative my-3">
                <div className="flex items-center justify-between bg-zinc-800 dark:bg-zinc-900 text-zinc-400 px-4 py-1.5 rounded-t-md text-xs font-mono">
                  <span>{match[1]}</span>
                </div>
                <pre className="bg-zinc-900 dark:bg-zinc-950 rounded-b-md p-4 overflow-x-auto">
                  <code className="text-xs font-mono text-zinc-100 leading-relaxed">{children}</code>
                </pre>
                <CopyButton text={String(children).replace(/\n$/, "")} />
              </div>
            );
          }
          return (
            <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono text-foreground">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-primary/40 pl-4 my-3 text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-4 border-border" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-md border border-border">
            <table className="min-w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-sm border-b border-border">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function ThinkingIndicator({ mode }: { mode: string }) {
  const ModeIcon = MODE_ICONS[mode] || Sparkles;
  const color = MODE_COLORS[mode] || "text-primary";
  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
        <ModeIcon className={`h-4 w-4 ${color} animate-pulse`} />
      </div>
      <div className="rounded-xl px-4 py-3 bg-card border border-border shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-muted-foreground">
            {mode === "Build" ? "Preparing build..." : mode === "Debug" ? "Analyzing..." : mode === "Plan" ? "Planning..." : "Thinking..."}
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isStreaming = false }: { msg: { role: string; content: string; mode: string }; isStreaming?: boolean }) {
  const ModeIcon = MODE_ICONS[msg.mode] || Sparkles;
  const color = MODE_COLORS[msg.mode] || "text-primary";

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="rounded-xl rounded-br-sm px-4 py-2.5 max-w-[80%] bg-primary text-primary-foreground shadow-sm">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center ring-1 ring-border">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
        <ModeIcon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="rounded-xl rounded-bl-sm px-4 py-3 max-w-[85%] bg-card border border-border shadow-sm">
        <MarkdownContent content={msg.content} />
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-primary rounded-sm animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  );
}

export function ChatPanel({ chatId, projectId, onJobCreated }: ChatPanelProps) {
  const [mode, setMode] = useState("Discuss");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showConfirmBuild, setShowConfirmBuild] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const { forced: forceBasicMode } = useForceBasicMode();

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/chats", chatId, "messages"],
    queryFn: () =>
      chatId
        ? fetch(`/api/chats/${chatId}/messages`).then((r) => r.json())
        : Promise.resolve([]),
    enabled: !!chatId,
  });

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isThinking, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const CONFIRM_PHRASES = ["yes", "ok", "okay", "sure", "go ahead", "please build", "do it", "yep", "yeah", "let's go", "confirm", "go", "y", "please"];

  const handleSend = async (overrideContent?: string, overrideMode?: string) => {
    let content = (overrideContent || input).trim();
    let sendMode = overrideMode || mode;
    if (!content || !chatId || isSending) return;

    if (showConfirmBuild && CONFIRM_PHRASES.includes(content.toLowerCase().replace(/[.!]/g, ""))) {
      content = "Build it";
      sendMode = "Build";
      setShowConfirmBuild(false);
    }

    setInput("");
    setIsSending(true);
    setIsThinking(true);
    setStreamingContent("");

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode: sendMode, forceBasicMode }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "user_message") {
                qc.setQueryData<Message[]>(
                  ["/api/chats", chatId, "messages"],
                  (old) => old ? [...old, parsed.message] : [parsed.message]
                );
              } else if (parsed.type === "token") {
                setIsThinking(false);
                setStreamingContent((prev) => prev + parsed.content);
              } else if (parsed.type === "assistant_message") {
                setStreamingContent("");
                setIsThinking(false);
                if (parsed.showConfirmButton) {
                  setShowConfirmBuild(true);
                }
                if (parsed.jobId && onJobCreated) {
                  setShowConfirmBuild(false);
                  onJobCreated(parsed.jobId);
                  qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
                }
              } else if (parsed.type === "spec_saved") {
                qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
              }
            } catch {
              // skip malformed
            }
          }
        }
      }

      qc.invalidateQueries({ queryKey: ["/api/chats", chatId, "messages"] });
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setIsSending(false);
      setIsThinking(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConfirmBuild = () => {
    setShowConfirmBuild(false);
    setMode("Build");
    handleSend("Build it", "Build");
  };

  const handlePromptClick = (prompt: string) => {
    handleSend(prompt);
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground h-full">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto ring-1 ring-primary/10">
            <Bot className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="font-medium text-foreground">No chat selected</p>
            <p className="text-sm mt-1">Create or select a chat from the sidebar</p>
          </div>
        </div>
      </div>
    );
  }

  const currentSuggestions = SUGGESTED_PROMPTS[mode] || SUGGESTED_PROMPTS.Discuss;
  const showEmptyState = !isLoading && !messages?.length && !streamingContent && !isThinking;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-4 py-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : showEmptyState ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                <Sparkles className="h-10 w-10 text-primary/60" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold text-foreground" data-testid="text-welcome-title">AI Workspace</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your AI engineering partner. Describe what you want to build, and I'll help you design, plan, build, improve, and debug it.
                </p>
              </div>

              <div className="flex items-center gap-2 mt-2">
                {(["Discuss", "Plan", "Build", "Improve", "Debug"] as const).map((m) => {
                  const Icon = MODE_ICONS[m];
                  const isActive = mode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      data-testid={`button-mode-${m.toLowerCase()}`}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {m}
                    </button>
                  );
                })}
              </div>

              <div className="w-full max-w-lg space-y-2 mt-4">
                <p className="text-xs text-muted-foreground text-center mb-3">Quick start</p>
                {currentSuggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handlePromptClick(s.prompt)}
                    data-testid={`button-prompt-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/20 transition-all text-sm text-foreground group"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs group-hover:text-foreground transition-colors">→ {s.prompt.slice(0, 80)}{s.prompt.length > 80 ? "..." : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pb-4">
              {messages?.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {isThinking && !streamingContent && <ThinkingIndicator mode={mode} />}
              {streamingContent && (
                <MessageBubble
                  msg={{ role: "assistant", content: streamingContent, mode }}
                  isStreaming
                />
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirmBuild && (
        <div className="border-t border-border bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hammer className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Plan is ready! Start the build?
              </span>
            </div>
            <Button
              data-testid="button-confirm-build"
              onClick={handleConfirmBuild}
              disabled={isSending}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Hammer className="h-3.5 w-3.5 mr-1.5" />
              Confirm Build
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {!showEmptyState && (
            <div className="flex items-center gap-1.5 mb-2">
              {(["Discuss", "Plan", "Build", "Improve", "Debug"] as const).map((m) => {
                const Icon = MODE_ICONS[m];
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    data-testid={`button-mode-inline-${m.toLowerCase()}`}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {m}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                data-testid="input-chat-message"
                placeholder={
                  mode === "Build"
                    ? 'Type "Build it" to start mock build simulation...'
                    : mode === "Plan"
                    ? "Describe what you want to build..."
                    : mode === "Debug"
                    ? "Paste an error message or describe the issue..."
                    : mode === "Improve"
                    ? "Ask for specific improvements or request a full review..."
                    : "What do you want to build?"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="resize-none min-h-[44px] max-h-[160px] text-sm pr-12 rounded-xl border-border focus-visible:ring-primary/30"
                rows={1}
                disabled={isSending}
              />
              <Badge
                variant="secondary"
                className={`absolute right-2 bottom-2 text-[10px] py-0 px-1.5 pointer-events-none ${MODE_COLORS[mode]}`}
              >
                {mode}
              </Badge>
            </div>
            <Button
              data-testid="button-send-message"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isSending}
              className="h-11 w-11 flex-shrink-0 rounded-xl shadow-sm"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            AI Workspace · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
