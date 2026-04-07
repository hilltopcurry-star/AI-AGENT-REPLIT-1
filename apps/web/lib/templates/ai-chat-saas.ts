import type { TemplateFile, TemplateDefinition } from "./index";

function getFiles(): TemplateFile[] {
  return [
    {
      path: "prisma/schema.prisma",
      content: `generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  createdAt DateTime @default(now())
  chats     Chat[]
}

model Chat {
  id        String    @id @default(cuid())
  title     String    @default("New Chat")
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Message {
  id        String   @id @default(cuid())
  role      String
  content   String
  chatId    String
  chat      Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}`,
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};
module.exports = nextConfig;
`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "es5",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
          exclude: ["node_modules"],
        },
        null,
        2
      ),
    },
    {
      path: "app/globals.css",
      content: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f0f1a; color: #e8e8f0; line-height: 1.6;
}
.sidebar {
  width: 260px; background: #1a1a2e; border-right: 1px solid #2a2a3e;
  display: flex; flex-direction: column; height: 100vh;
}
.sidebar-header {
  padding: 1rem; border-bottom: 1px solid #2a2a3e;
  display: flex; justify-content: space-between; align-items: center;
}
.sidebar-chats { flex: 1; overflow-y: auto; padding: 0.5rem; }
.chat-item {
  padding: 0.5rem 0.75rem; border-radius: 8px; cursor: pointer;
  font-size: 0.875rem; color: #b0b0c0; text-decoration: none; display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
}
.chat-item:hover { background: #2a2a3e; color: #e8e8f0; }
.chat-item.active { background: #3a3a5e; color: #ffffff; }
.main-area {
  flex: 1; display: flex; flex-direction: column; height: 100vh;
}
.messages-container {
  flex: 1; overflow-y: auto; padding: 1.5rem; max-width: 800px;
  margin: 0 auto; width: 100%;
}
.message {
  margin-bottom: 1.5rem; display: flex; gap: 0.75rem;
}
.message-avatar {
  width: 32px; height: 32px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 0.75rem;
  font-weight: 700; flex-shrink: 0;
}
.message-avatar.user { background: #4f46e5; color: white; }
.message-avatar.assistant { background: #059669; color: white; }
.message-content {
  flex: 1; font-size: 0.9375rem; line-height: 1.7;
}
.message-content p { margin-bottom: 0.5rem; }
.message-content pre {
  background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 8px;
  padding: 1rem; overflow-x: auto; margin: 0.5rem 0; font-size: 0.8125rem;
}
.message-content code {
  background: #2a2a3e; padding: 0.125rem 0.375rem; border-radius: 4px;
  font-size: 0.8125rem;
}
.input-area {
  border-top: 1px solid #2a2a3e; padding: 1rem 1.5rem;
  max-width: 800px; margin: 0 auto; width: 100%;
}
.input-wrapper {
  display: flex; gap: 0.5rem; align-items: flex-end;
}
.input-wrapper textarea {
  flex: 1; resize: none; background: #1a1a2e; border: 1px solid #2a2a3e;
  border-radius: 12px; padding: 0.75rem 1rem; color: #e8e8f0;
  font-family: inherit; font-size: 0.9375rem; min-height: 44px;
  max-height: 200px; outline: none;
}
.input-wrapper textarea:focus { border-color: #4f46e5; }
.send-btn {
  background: #4f46e5; color: white; border: none; border-radius: 10px;
  width: 40px; height: 40px; display: flex; align-items: center;
  justify-content: center; cursor: pointer; flex-shrink: 0;
  font-size: 1.125rem;
}
.send-btn:hover { background: #4338ca; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 1rem; border-radius: 8px; border: none;
  font-weight: 600; cursor: pointer; font-size: 0.875rem;
  transition: all 0.2s;
}
.btn-primary { background: #4f46e5; color: white; }
.btn-primary:hover { background: #4338ca; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; opacity: 0.5; text-align: center;
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import './globals.css';

export const metadata = {
  title: 'AI Chat',
  description: 'Chat with AI - your intelligent assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="ai-workspace-template" content="ai-chat-saas" />
      </head>
      <body>
        <div style={{ display: 'flex', height: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatSummary { id: string; title: string; updatedAt: string; }
interface Message { id: string; role: string; content: string; }

export default function ChatApp() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchChats(); }, []);

  useEffect(() => {
    if (activeChatId) fetchMessages(activeChatId);
    else setMessages([]);
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchChats() {
    try {
      const res = await fetch('/api/chats');
      if (res.ok) setChats(await res.json());
    } catch {}
  }

  async function fetchMessages(chatId: string) {
    try {
      const res = await fetch(\`/api/chats/\${chatId}/messages\`);
      if (res.ok) setMessages(await res.json());
    } catch {}
  }

  async function createChat() {
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      if (res.ok) {
        const chat = await res.json();
        setActiveChatId(chat.id);
        fetchChats();
      }
    } catch {}
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    let chatId = activeChatId;
    if (!chatId) {
      try {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: input.slice(0, 50) }),
        });
        if (res.ok) {
          const chat = await res.json();
          chatId = chat.id;
          setActiveChatId(chat.id);
          fetchChats();
        }
      } catch { return; }
    }

    const userMsg: Message = { id: 'temp-' + Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const userInput = input;
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(\`/api/chats/\${chatId}/messages\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        fetchChats();
      }
    } catch {}
    setLoading(false);
  }

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <span style={{ fontWeight: 700 }}>AI Chat</span>
          <button className="btn btn-primary btn-sm" onClick={createChat}>+ New</button>
        </div>
        <div className="sidebar-chats">
          {chats.map(c => (
            <a key={c.id} href={\`/chat/\${c.id}\`}
              className={\`chat-item \${activeChatId === c.id ? 'active' : ''}\`}
              onClick={(e) => { e.preventDefault(); setActiveChatId(c.id); }}>
              {c.title}
            </a>
          ))}
        </div>
      </div>
      <div className="main-area">
        {messages.length === 0 && !activeChatId ? (
          <div className="empty-state">
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>How can I help you today?</h2>
            <p>Start a conversation by typing a message below.</p>
          </div>
        ) : (
          <div className="messages-container">
            {messages.map(m => (
              <div key={m.id} className="message">
                <div className={\`message-avatar \${m.role}\`}>
                  {m.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="message-content">
                  <p>{m.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="message">
                <div className="message-avatar assistant">AI</div>
                <div className="message-content"><p style={{ opacity: 0.5 }}>Thinking...</p></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        <div className="input-area">
          <form onSubmit={sendMessage} className="input-wrapper">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
              placeholder="Type your message..."
              rows={1}
            />
            <button type="submit" className="send-btn" disabled={loading || !input.trim()}>&#x27A4;</button>
          </form>
        </div>
      </div>
    </>
  );
}
`,
    },
    {
      path: "app/chat/[chatId]/page.tsx",
      content: `import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function resolveParams(params: any): Promise<{ chatId: string }> {
  const resolved = typeof params?.then === 'function' ? await params : params;
  return resolved;
}

export default async function ChatDetailPage({ params }: { params: any }) {
  const { chatId } = await resolveParams(params);
  redirect(\`/?chat=\${chatId}\`);
}
`,
    },
    {
      path: "app/api/health/route.ts",
      content: `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
`,
    },
    {
      path: "app/api/db-check/route.ts",
      content: `import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/chats/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const chats = await prisma.chat.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });
    return NextResponse.json(chats);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title } = body;

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: "demo@example.com", name: "Demo User", password: "demo" },
      });
    }

    const chat = await prisma.chat.create({
      data: { title: title || "New Chat", userId: user.id },
    });
    return NextResponse.json(chat, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/chats/[chatId]/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveChatId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.chatId;
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const chatId = await resolveChatId(ctx);
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json(chat);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const chatId = await resolveChatId(ctx);
    await prisma.chat.delete({ where: { id: chatId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/chats/[chatId]/messages/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveChatId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.chatId;
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const chatId = await resolveChatId(ctx);
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(messages);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const chatId = await resolveChatId(ctx);
    const body = await req.json();
    const { content } = body;
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    await prisma.message.create({
      data: { role: "user", content, chatId },
    });

    const aiReply = generateAIReply(content);

    await prisma.message.create({
      data: { role: "assistant", content: aiReply, chatId },
    });

    if (chat.title === "New Chat") {
      await prisma.chat.update({
        where: { id: chatId },
        data: { title: content.slice(0, 50) },
      });
    } else {
      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });
    }

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages }, { status: 201 });
  } catch (e: any) {
    console.error("[MESSAGES POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function generateAIReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi")) {
    return "Hello! I'm your AI assistant. How can I help you today?";
  }
  if (lower.includes("help")) {
    return "I'm here to help! You can ask me questions, request explanations, get coding help, brainstorm ideas, or just have a conversation. What would you like to do?";
  }
  if (lower.includes("code") || lower.includes("programming")) {
    return "I'd be happy to help with coding! Please share the specific problem or question you have, and I'll do my best to assist you with a solution.";
  }
  return \`Thank you for your message. You said: "\${userMessage.slice(0, 100)}". I'm a demo AI assistant — in a production app, this would connect to an AI model like GPT-4 or Claude for intelligent responses.\`;
}
`,
    },
    {
      path: "lib/seed.ts",
      content: `import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: { email: "demo@example.com", name: "Demo User", password: "demo" },
  });

  const chat = await prisma.chat.create({
    data: {
      title: "Welcome Chat",
      userId: user.id,
    },
  });

  await prisma.message.create({
    data: { role: "assistant", content: "Hello! I'm your AI assistant. How can I help you today?", chatId: chat.id },
  });

  console.log("Seed data created successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
`,
    },
    {
      path: ".env",
      content: `DATABASE_URL="file:./prisma/dev.db"
`,
    },
  ];
}

function getPackageJson(): Record<string, unknown> {
  return {
    name: "ai-chat-saas",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && prisma db push --accept-data-loss && next build",
      start: "next start",
      seed: "tsx lib/seed.ts",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
      "@prisma/client": "^5.14.0",
    },
    devDependencies: {
      typescript: "^5.4.0",
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      prisma: "^5.14.0",
      tsx: "^4.0.0",
    },
  };
}

export const aiChatSaasTemplate: TemplateDefinition = {
  key: "ai-chat-saas",
  name: "AI Chat Application",
  description:
    "A ChatGPT-style AI chat interface with conversation history, message threads, and a sidebar",
  keywords: [
    "ai chat",
    "chatbot",
    "chat bot",
    "chatgpt",
    "gpt",
    "llm",
    "language model",
    "conversational ai",
    "ai assistant",
    "chat interface",
    "chat app",
    "messaging",
    "conversation",
    "prompt",
    "ai response",
    "chat history",
    "claude",
    "openai",
    "gemini",
  ],
  uiKeywords: [
    "sidebar",
    "chat",
    "message",
    "conversation",
    "interface",
    "ui",
    "app",
    "web",
    "frontend",
    "dark mode",
    "responsive",
  ],
  requiredModules: ["next", "react", "@prisma/client", "prisma"],
  requiredRoutes: [
    "/api/health",
    "/api/db-check",
    "/api/chats",
    "/api/chats/[chatId]",
    "/api/chats/[chatId]/messages",
  ],
  requiredEntities: ["User", "Chat", "Message"],
  getFiles,
  getPackageJson,
};
