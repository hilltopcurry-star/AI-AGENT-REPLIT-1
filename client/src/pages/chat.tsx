import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Send, Sparkles, User, Square, AlertCircle, ImagePlus, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { apiRequest, queryClient } from "../lib/queryClient";
import MarkdownRenderer from "../components/markdown-renderer";
import type { Conversation, ChatMessage } from "@shared/schema";

const MAX_IMAGES = 20;
const MAX_IMAGE_SIZE_PX = 1024;
const IMAGE_QUALITY = 0.7;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

        if (w > MAX_IMAGE_SIZE_PX || h > MAX_IMAGE_SIZE_PX) {
          if (w > h) {
            h = Math.round((h * MAX_IMAGE_SIZE_PX) / w);
            w = MAX_IMAGE_SIZE_PX;
          } else {
            w = Math.round((w * MAX_IMAGE_SIZE_PX) / h);
            h = MAX_IMAGE_SIZE_PX;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas error"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error("Image load error"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const [, params] = useRoute("/chat/:id");
  const [, navigate] = useLocation();
  const conversationId = params?.id ? parseInt(params.id) : null;
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingForFirstToken, setIsWaitingForFirstToken] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [completedStreamContent, setCompletedStreamContent] = useState("");
  const [streamError, setStreamError] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", conversationId],
    queryFn: () => fetchJson<Conversation>(`/api/conversations/${conversationId}`),
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    queryFn: () => fetchJson<ChatMessage[]>(`/api/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  });

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isWaitingForFirstToken, scrollToBottom]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_IMAGES - pendingImages.length;
    const filesToProcess = Array.from(files).slice(0, remaining);

    const compressed: string[] = [];
    for (const file of filesToProcess) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const dataUrl = await compressImage(file);
        compressed.push(dataUrl);
      } catch (err) {
        console.error("Failed to compress image:", err);
      }
    }

    setPendingImages((prev) => [...prev, ...compressed].slice(0, MAX_IMAGES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingImages.length]);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && pendingImages.length === 0) || !conversationId || isStreaming) return;

    const userMessage = input.trim();
    const imagesToSend = [...pendingImages];
    setInput("");
    setPendingImages([]);
    setIsStreaming(true);
    setIsWaitingForFirstToken(true);
    setStreamingContent("");
    setCompletedStreamContent("");
    setStreamError("");
    streamingContentRef.current = "";

    queryClient.setQueryData(
      ["/api/conversations", conversationId, "messages"],
      (old: ChatMessage[] | undefined) => [
        ...(old || []),
        {
          id: Date.now(),
          conversationId,
          role: "user",
          content: userMessage || "[Images attached]",
          attachments: imagesToSend.length > 0 ? JSON.stringify(imagesToSend) : null,
          createdAt: new Date().toISOString(),
        } as any,
      ]
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: any = {};
      if (userMessage) body.content = userMessage;
      if (imagesToSend.length > 0) body.attachments = imagesToSend;

      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `Server error (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "start") continue;
            if (data.content) {
              setIsWaitingForFirstToken(false);
              streamingContentRef.current += data.content;
              setStreamingContent((prev) => prev + data.content);
            }
            if (data.error) {
              setIsWaitingForFirstToken(false);
              setStreamError(data.error);
            }
            if (data.done) break;
          } catch {
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
      } else {
        console.error("Send error:", err);
        setStreamError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setIsStreaming(false);
      setIsWaitingForFirstToken(false);
      abortRef.current = null;

      setCompletedStreamContent(streamingContentRef.current);

      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });

      setStreamingContent("");
      setCompletedStreamContent("");
    }
  }, [input, conversationId, isStreaming, pendingImages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;

    e.preventDefault();
    const remaining = MAX_IMAGES - pendingImages.length;
    const filesToProcess = imageFiles.slice(0, remaining);

    const compressed: string[] = [];
    for (const file of filesToProcess) {
      try {
        const dataUrl = await compressImage(file);
        compressed.push(dataUrl);
      } catch (err) {
        console.error("Failed to compress pasted image:", err);
      }
    }

    setPendingImages((prev) => [...prev, ...compressed].slice(0, MAX_IMAGES));
  }, [pendingImages.length]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4" data-testid="text-welcome">
        <div className="max-w-2xl w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">How can I help you today?</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Start a new conversation or select one from the sidebar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto pt-4">
            {[
              "Explain how async/await works in JavaScript",
              "Help me design a REST API",
              "Write a Python script to parse CSV files",
              "Debug my React component",
            ].map((suggestion, i) => (
              <button
                key={i}
                className="text-left p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors text-sm text-muted-foreground"
                data-testid={`button-suggestion-${i}`}
                onClick={async () => {
                  const res = await apiRequest("POST", "/api/conversations", {});
                  const conv = await res.json();
                  queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                  setInput(suggestion);
                  navigate(`/chat/${conv.id}`);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen" data-testid="chat-page">
      <div className="border-b border-border px-6 py-3 flex items-center bg-background/80 backdrop-blur-sm shrink-0">
        <h2 className="font-semibold text-base truncate pl-10 md:pl-0" data-testid="text-chat-title">
          {conversation?.title || "Chat"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messagesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 && !isStreaming && !isWaitingForFirstToken ? (
            <div className="text-center py-16 space-y-3" data-testid="text-empty-chat">
              <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Send a message to start the conversation</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} attachments={msg.attachments} />
              ))}

              {isWaitingForFirstToken && (
                <ThinkingIndicator />
              )}

              {isStreaming && streamingContent && (
                <MessageBubble role="assistant" content={streamingContent} isStreaming />
              )}

              {!isStreaming && completedStreamContent && (
                <MessageBubble role="assistant" content={completedStreamContent} />
              )}

              {streamError && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-destructive/10 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-block text-left rounded-2xl px-4 py-3 bg-destructive/10 text-destructive text-sm">
                      {streamError}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border p-4 bg-background shrink-0">
        <div className="max-w-3xl mx-auto">
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 p-2 bg-muted/30 rounded-lg border border-border" data-testid="image-preview-area">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img}
                    alt={`Upload ${i + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-border"
                    data-testid={`preview-image-${i}`}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-image-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <span className="text-xs text-muted-foreground self-end pb-1">
                {pendingImages.length}/{MAX_IMAGES}
              </span>
            </div>
          )}
          <div className="relative flex items-end gap-2 bg-muted/50 rounded-xl border border-border p-2 focus-within:border-primary/50 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
              data-testid="input-file-upload"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="rounded-lg flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
              disabled={isStreaming || pendingImages.length >= MAX_IMAGES}
              title={`Upload images (${pendingImages.length}/${MAX_IMAGES})`}
              data-testid="button-upload-image"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={pendingImages.length > 0 ? "Add a message or send images..." : "Type your message..."}
              className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
              disabled={isStreaming}
              data-testid="input-message"
            />
            {isStreaming ? (
              <Button
                onClick={handleStop}
                size="icon"
                variant="outline"
                className="rounded-lg flex-shrink-0 h-9 w-9"
                data-testid="button-stop"
              >
                <Square className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim() && pendingImages.length === 0}
                size="icon"
                className="rounded-lg flex-shrink-0 h-9 w-9"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            AI can make mistakes. Please verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-3" data-testid="thinking-indicator">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-primary/10 text-primary">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-3 bg-muted/70">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-muted-foreground ml-2">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

function parseAttachments(attachmentsStr: string | null | undefined): string[] {
  if (!attachmentsStr) return [];
  try {
    const parsed = JSON.parse(attachmentsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function MessageBubble({
  role,
  content,
  attachments,
  isStreaming = false,
}: {
  role: string;
  content: string;
  attachments?: string | null;
  isStreaming?: boolean;
}) {
  const isUser = role === "user";
  const images = parseAttachments(attachments);

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${role}`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary"
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}
      >
        <div
          className={`inline-block text-left rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground max-w-[85%]"
              : "bg-muted/70 max-w-full"
          }`}
        >
          {images.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${content && content !== "[Images attached]" ? "mb-2" : ""}`}>
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`Attachment ${i + 1}`}
                  className="max-w-[200px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(img, "_blank")}
                  data-testid={`attachment-image-${i}`}
                />
              ))}
            </div>
          )}
          {isUser ? (
            content && content !== "[Images attached]" ? (
              <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
            ) : null
          ) : (
            <div className="text-sm overflow-hidden">
              <MarkdownRenderer content={content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
