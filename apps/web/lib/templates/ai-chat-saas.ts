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
  uploads   Upload[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Message {
  id        String   @id @default(cuid())
  role      String
  content   String
  imageUrl  String?
  chatId    String
  chat      Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

model Upload {
  id          String          @id @default(cuid())
  chatId      String?
  chat        Chat?           @relation(fields: [chatId], references: [id], onDelete: SetNull)
  status      String          @default("PENDING")
  totalChunks Int             @default(0)
  receivedChunks Int          @default(0)
  totalSize   Int             @default(0)
  summary     String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  chunks      DocumentChunk[]
}

model DocumentChunk {
  id        String   @id @default(cuid())
  uploadId  String
  upload    Upload   @relation(fields: [uploadId], references: [id], onDelete: Cascade)
  index     Int
  content   String
  summary   String?
  keywords  String?
  createdAt DateTime @default(now())
}`,
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
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
.attach-btn {
  background: transparent; color: #b0b0c0; border: 1px solid #2a2a3e;
  border-radius: 10px; width: 40px; height: 40px; display: flex;
  align-items: center; justify-content: center; cursor: pointer;
  flex-shrink: 0; font-size: 1.125rem;
}
.attach-btn:hover { background: #2a2a3e; color: #e8e8f0; }
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
.banner-warning {
  background: #7c2d12; color: #fed7aa; padding: 0.75rem 1rem;
  text-align: center; font-size: 0.875rem; border-bottom: 1px solid #9a3412;
}
.image-preview {
  max-width: 200px; max-height: 150px; border-radius: 8px;
  margin-top: 0.5rem; border: 1px solid #2a2a3e;
}
.image-attachment {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0;
  font-size: 0.8125rem; color: #b0b0c0;
}
.image-attachment button {
  background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.75rem;
}
.input-hint {
  font-size: 0.6875rem; color: #6b7280; text-align: center;
  padding: 0.25rem 0 0; user-select: none;
}
`,
    },
    {
      path: "pages/_error.tsx",
      content: `function ErrorPage({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1>{statusCode || 'Error'}</h1>
      <p>{statusCode === 404 ? 'Page not found' : 'An error occurred'}</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
`,
    },
    {
      path: "app/global-error.tsx",
      content: `'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
          <h1>Something went wrong</h1>
          <button onClick={reset}>Try Again</button>
        </div>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import './globals.css';

export const metadata = {
  title: 'AI Chat',
  description: 'Chat with AI powered by Claude - your intelligent assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="ai-workspace-template" content="ai-chat-saas" />
      </head>
      <body>
        <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/not-found.tsx",
      content: `export default function NotFound() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>404 - Page Not Found</h1>
      <a href="/" style={{ color: '#3b82f6' }}>Go to Chat</a>
    </div>
  );
}
`,
    },
    {
      path: "app/error.tsx",
      content: `'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Something went wrong</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>{error.message}</p>
      <button onClick={reset} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        Try Again
      </button>
    </div>
  );
}
`,
    },
    {
      path: "app/ChatApp.tsx",
      content: `'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatSummary { id: string; title: string; updatedAt: string; }
interface Message { id: string; role: string; content: string; imageUrl?: string | null; }

export default function ChatApp() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [attachedUploadId, setAttachedUploadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchChats();
    fetch('/api/ai-status').then(r => r.json()).then(data => {
      setAiConfigured(data.configured);
      setAiModel(data.model || '');
    }).catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    if (activeChatId) fetchMessages(activeChatId);
    else setMessages([]);
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

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

  function attachImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) attachImage(file);
  }

  const LARGE_PASTE_THRESHOLD = 200000;

  async function uploadLargeText(text: string, chatId: string) {
    setUploadProgress('Initializing upload...');
    const CHUNK_SIZE = 512000;
    try {
      const initRes = await fetch('/api/uploads/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, totalSize: text.length, chunkSize: CHUNK_SIZE }),
      });
      if (!initRes.ok) throw new Error('Upload init failed');
      const { uploadId, totalChunks } = await initRes.json();

      for (let i = 0; i < totalChunks; i++) {
        setUploadProgress(\`Uploading chunk \${i + 1}/\${totalChunks}...\`);
        const start = i * CHUNK_SIZE;
        const chunkContent = text.slice(start, start + CHUNK_SIZE);
        const chunkRes = await fetch(\`/api/uploads/\${uploadId}/chunk\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: i, content: chunkContent }),
        });
        if (!chunkRes.ok) throw new Error(\`Chunk \${i} upload failed\`);
      }

      setUploadProgress('Indexing content...');
      const finalRes = await fetch(\`/api/uploads/\${uploadId}/finalize\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!finalRes.ok) throw new Error('Finalize failed');

      setAttachedUploadId(uploadId);
      setUploadProgress(null);
      return uploadId;
    } catch (err: any) {
      setUploadProgress('Upload failed: ' + err.message);
      setTimeout(() => setUploadProgress(null), 3000);
      return null;
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) attachImage(file);
        return;
      }
    }
    const pastedText = e.clipboardData?.getData('text') || '';
    if (pastedText.length > LARGE_PASTE_THRESHOLD) {
      e.preventDefault();
      setInput('[Large document pasted - ' + Math.round(pastedText.length / 1000) + 'k chars]');
      (window as any).__pendingLargeText = pastedText;
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) attachImage(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && !imageFile) || loading) return;

    let chatId = activeChatId;
    if (!chatId) {
      try {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: (input || 'Image chat').slice(0, 50) }),
        });
        if (res.ok) {
          const chat = await res.json();
          chatId = chat.id;
          setActiveChatId(chat.id);
          fetchChats();
        }
      } catch { return; }
    }

    const pendingLargeText = (window as any).__pendingLargeText;
    if (pendingLargeText && chatId) {
      (window as any).__pendingLargeText = null;
      await uploadLargeText(pendingLargeText, chatId);
    }

    const userContent = input.trim() || (imageFile ? '[Image sent]' : '');
    const userMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userContent,
      imageUrl: imagePreview,
    };
    setMessages(prev => [...prev, userMsg]);
    const userInput = input;
    const currentImage = imagePreview;
    setInput('');
    clearImage();
    setAttachedUploadId(null);
    setLoading(true);
    setStreamingText('');

    try {
      const body: Record<string, string> = { content: userInput };
      if (currentImage) body.image = currentImage;

      const res = await fetch(\`/api/chats/\${chatId}/messages\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setStreamingText('');
        setMessages(prev => [...prev, {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: 'Error: ' + (err.error || 'Something went wrong'),
        }]);
        setLoading(false);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'token') {
                fullText += parsed.text;
                setStreamingText(fullText);
              } else if (parsed.type === 'error') {
                fullText += '\\n[Error: ' + parsed.error + ']';
                setStreamingText(fullText);
              }
            } catch {}
          }
        }
        setStreamingText('');
        await fetchMessages(chatId!);
        fetchChats();
      } else {
        const data = await res.json();
        setMessages(data.messages || []);
        fetchChats();
      }
    } catch {}
    setLoading(false);
  }

  return (
    <>
      {aiConfigured === false && (
        <div className="banner-warning">
          ANTHROPIC_API_KEY is not set. AI responses are disabled.
          Set the environment variable to enable Claude-powered chat.
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="sidebar">
          <div className="sidebar-header">
            <span style={{ fontWeight: 700 }}>AI Chat</span>
            <button className="btn btn-primary btn-sm" onClick={createChat} data-testid="button-new-chat">+ New</button>
          </div>
          {aiModel && (
            <div style={{ padding: '0.25rem 1rem', fontSize: '0.75rem', color: '#6b7280' }}>
              Model: {aiModel}
            </div>
          )}
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
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt="attachment" className="image-preview" />
                    )}
                    <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
                  </div>
                </div>
              ))}
              {(loading || streamingText) && (
                <div className="message">
                  <div className="message-avatar assistant">AI</div>
                  <div className="message-content">
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {streamingText || 'Thinking...'}
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          <div className="input-area" onDrop={handleDrop} onDragOver={handleDragOver} data-testid="drop-zone">
            {uploadProgress && (
              <div style={{ padding: '0.5rem 0.75rem', background: '#1e3a5f', borderRadius: 8, marginBottom: '0.5rem', fontSize: '0.875rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.5rem' }} data-testid="text-upload-progress">
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#8987;</span>
                {uploadProgress}
              </div>
            )}
            {attachedUploadId && !uploadProgress && (
              <div style={{ padding: '0.25rem 0.75rem', background: '#1a2e1a', borderRadius: 8, marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#86efac' }} data-testid="text-upload-attached">
                &#128196; Document indexed and attached to this chat
              </div>
            )}
            {imagePreview && (
              <div className="image-attachment">
                <img src={imagePreview} alt="preview" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                <span>{imageFile?.name || 'Pasted image'}</span>
                <button onClick={clearImage} data-testid="button-remove-image">&times; Remove</button>
              </div>
            )}
            <form onSubmit={sendMessage} className="input-wrapper">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageSelect}
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image"
                data-testid="button-attach-image"
              >
                &#128206;
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
                onPaste={handlePaste}
                placeholder="Type your message..."
                rows={1}
                data-testid="input-message"
              />
              <button type="submit" className="send-btn" disabled={loading || (!input.trim() && !imageFile)} data-testid="button-send">&#x27A4;</button>
            </form>
            <div className="input-hint" data-testid="text-input-hint">Paste (Ctrl+V), drag-drop, or click &#128206; to upload images.</div>
          </div>
        </div>
      </div>
    </>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import dynamic from 'next/dynamic';

const ChatApp = dynamic(() => import('./ChatApp'), { ssr: false });

export default function Page() {
  return <ChatApp />;
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
      path: "app/api/ai-status/route.ts",
      content: `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    configured,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    provider: "anthropic",
  });
}
`,
    },
    {
      path: "app/api/debug/env/route.ts",
      content: `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  return NextResponse.json({
    ANTHROPIC_API_KEY: key ? { present: true, length: key.length, prefix: key.slice(0, 7) + "..." } : { present: false },
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "(default: claude-sonnet-4-20250514)",
    NODE_ENV: process.env.NODE_ENV || "unknown",
    DATABASE_URL: process.env.DATABASE_URL ? { present: true } : { present: false },
  });
}
`,
    },
    {
      path: "app/api/db-check/route.ts",
      content: `import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

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

export const dynamic = "force-dynamic";

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

export const dynamic = "force-dynamic";

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

export const dynamic = "force-dynamic";

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI not configured. Set ANTHROPIC_API_KEY environment variable." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { content, image } = body;
    if ((!content || typeof content !== "string") && !image) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;
    let imageMetadata: string | null = null;

    if (image && typeof image === "string") {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        imageMimeType = match[1];
        imageBase64 = match[2];
        imageMetadata = JSON.stringify({ type: imageMimeType, size: imageBase64.length });
      }
    }

    const msgContent = content || "[Image sent]";
    await prisma.message.create({
      data: {
        role: "user",
        content: msgContent,
        imageUrl: imageMetadata,
        chatId,
      },
    });

    const history = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });

    const MAX_HISTORY = 50;
    const recentHistory = history.length > MAX_HISTORY
      ? history.slice(history.length - MAX_HISTORY)
      : history;

    const uploads = await prisma.upload.findMany({
      where: { chatId, status: "READY" },
      select: { id: true, summary: true },
    });

    let ragContext = "";
    let hasLargeDocument = false;
    if (uploads.length > 0) {
      hasLargeDocument = true;
      const queryWords = msgContent.toLowerCase().replace(/[^a-z0-9\\s]/g, " ").split(/\\s+/).filter((w: string) => w.length > 3);

      for (const upload of uploads) {
        if (upload.summary) {
          ragContext += "\\n[Document Summary]\\n" + upload.summary + "\\n";
        }

        if (queryWords.length > 0) {
          const allChunks = await prisma.documentChunk.findMany({
            where: { uploadId: upload.id },
            orderBy: { index: "asc" },
            select: { content: true, keywords: true, summary: true, index: true },
          });

          const scored = allChunks.map((chunk: any) => {
            const chunkLower = (chunk.keywords || "").toLowerCase() + " " + (chunk.content || "").toLowerCase().slice(0, 500);
            let score = 0;
            for (const qw of queryWords) {
              if (chunkLower.includes(qw)) score++;
            }
            return { ...chunk, score };
          });

          scored.sort((a: any, b: any) => b.score - a.score);
          const topChunks = scored.filter((c: any) => c.score > 0).slice(0, 5);
          if (topChunks.length > 0) {
            ragContext += "\\n[Relevant Sections]\\n";
            for (const tc of topChunks) {
              ragContext += "[Section " + tc.index + "] " + tc.content.slice(0, 2000) + "\\n";
            }
          }
        }
      }
    }

    const processingUploads = await prisma.upload.findMany({
      where: { chatId, status: { in: ["UPLOADING", "PROCESSING"] } },
    });
    const isStillIndexing = processingUploads.length > 0;

    const claudeMessages: Array<{ role: "user" | "assistant"; content: any }> = [];
    for (const m of recentHistory) {
      if (m.role === "assistant") {
        claudeMessages.push({ role: "assistant", content: m.content });
      } else {
        claudeMessages.push({ role: "user", content: m.content });
      }
    }

    if (imageBase64 && imageMimeType) {
      const lastIdx = claudeMessages.length - 1;
      if (lastIdx >= 0 && claudeMessages[lastIdx].role === "user") {
        const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (supportedTypes.includes(imageMimeType)) {
          claudeMessages[lastIdx] = {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageMimeType,
                  data: imageBase64,
                },
              },
              { type: "text", text: msgContent },
            ],
          };
        }
      }
    }

    if (ragContext) {
      const lastIdx = claudeMessages.length - 1;
      if (lastIdx >= 0 && claudeMessages[lastIdx].role === "user") {
        const existing = typeof claudeMessages[lastIdx].content === "string"
          ? claudeMessages[lastIdx].content
          : msgContent;
        claudeMessages[lastIdx] = {
          role: "user",
          content: "[Retrieved context from uploaded documents]\\n" + ragContext.slice(0, 8000) + "\\n\\n[User question]\\n" + existing,
        };
      }
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    const keyPreview = apiKey.slice(0, 10) + "..." + apiKey.slice(-4);
    console.log("[AI-CHAT] Starting Claude request: model=" + model + " key=" + keyPreview + " messages=" + claudeMessages.length);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let systemPrompt = "You are a helpful AI assistant.";
          if (hasLargeDocument) {
            systemPrompt += " The user has uploaded a large document. Use the retrieved context to answer their question accurately. Always end your response with a '## Next Steps' section listing 2-4 actionable suggestions for what the user could do or ask next.";
          }
          if (isStillIndexing) {
            systemPrompt += " Note: Some content is still being indexed. Let the user know you're working with partial content and will have more complete answers once indexing finishes.";
          }

          const reqBody: any = {
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: claudeMessages,
            stream: true,
          };
          console.log("[AI-CHAT] Sending to Anthropic API...");

          const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(reqBody),
          });

          console.log("[AI-CHAT] Anthropic response status: " + anthropicRes.status);

          if (!anthropicRes.ok) {
            const errBody = await anthropicRes.text();
            const errMsg = "Anthropic API error: " + anthropicRes.status + " " + errBody.slice(0, 300);
            console.error("[AI-CHAT] " + errMsg);
            controller.enqueue(
              encoder.encode(\`data: \${JSON.stringify({ type: "error", error: errMsg })}\\n\\n\`)
            );
            controller.close();
            return;
          }

          const reader = anthropicRes.body!.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";
          let buf = "";
          let tokenCount = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                  fullResponse += parsed.delta.text;
                  tokenCount++;
                  controller.enqueue(
                    encoder.encode(\`data: \${JSON.stringify({ type: "token", text: parsed.delta.text })}\\n\\n\`)
                  );
                }
              } catch {}
            }
          }

          console.log("[AI-CHAT] Stream complete: " + tokenCount + " tokens, " + fullResponse.length + " chars");

          if (fullResponse) {
            await prisma.message.create({
              data: { role: "assistant", content: fullResponse, chatId },
            });
          } else {
            console.warn("[AI-CHAT] WARNING: Claude returned empty response");
          }

          if (chat.title === "New Chat" && recentHistory.length <= 1) {
            await prisma.chat.update({
              where: { id: chatId },
              data: { title: (content || "Image chat").slice(0, 50) },
            });
          } else {
            await prisma.chat.update({
              where: { id: chatId },
              data: { updatedAt: new Date() },
            });
          }

          controller.enqueue(
            encoder.encode(\`data: \${JSON.stringify({ type: "done" })}\\n\\n\`)
          );
          controller.close();
        } catch (e: any) {
          console.error("[AI-CHAT] Stream error:", e.message, e.stack);
          controller.enqueue(
            encoder.encode(\`data: \${JSON.stringify({ type: "error", error: e.message })}\\n\\n\`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[MESSAGES POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/uploads/init/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId, totalSize, chunkSize } = body;
    if (!totalSize || totalSize < 1) {
      return NextResponse.json({ error: "totalSize is required" }, { status: 400 });
    }
    const effectiveChunkSize = chunkSize || 512000;
    const totalChunks = Math.ceil(totalSize / effectiveChunkSize);

    const upload = await prisma.upload.create({
      data: {
        chatId: chatId || null,
        status: "UPLOADING",
        totalChunks,
        totalSize,
      },
    });
    return NextResponse.json({
      uploadId: upload.id,
      totalChunks,
      chunkSize: effectiveChunkSize,
      status: upload.status,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/uploads/[uploadId]/chunk/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

async function resolveUploadId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.uploadId;
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const uploadId = await resolveUploadId(ctx);
    const body = await req.json();
    const { index, content } = body;
    if (index === undefined || !content) {
      return NextResponse.json({ error: "index and content are required" }, { status: 400 });
    }
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    if (upload.status !== "UPLOADING") {
      return NextResponse.json({ error: "Upload is not in UPLOADING state" }, { status: 400 });
    }
    await prisma.documentChunk.create({
      data: { uploadId, index, content },
    });
    await prisma.upload.update({
      where: { id: uploadId },
      data: { receivedChunks: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, index });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/uploads/[uploadId]/finalize/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

async function resolveUploadId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.uploadId;
}

function extractKeywords(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9\\s]/g, " ").split(/\\s+/).filter(w => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w)
    .join(" ");
}

function summarizeChunk(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const picks = sentences.slice(0, 3).map(s => s.trim());
  if (picks.length === 0) return text.slice(0, 200);
  return picks.join(". ") + ".";
}

export async function POST(req: NextRequest, ctx: any) {
  let uploadId = "";
  try {
    uploadId = await resolveUploadId(ctx);
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    if (upload.status !== "UPLOADING") {
      return NextResponse.json({ error: "Upload already finalized" }, { status: 400 });
    }

    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "PROCESSING" },
    });

    const chunks = await prisma.documentChunk.findMany({
      where: { uploadId },
      orderBy: { index: "asc" },
    });

    const chunkSummaries: string[] = [];
    for (const chunk of chunks) {
      const keywords = extractKeywords(chunk.content);
      const summary = summarizeChunk(chunk.content);
      chunkSummaries.push(summary);
      await prisma.documentChunk.update({
        where: { id: chunk.id },
        data: { keywords, summary },
      });
    }

    const overallSummary = chunkSummaries.length > 5
      ? chunkSummaries.slice(0, 3).join(" ") + " ... [" + chunkSummaries.length + " sections total]"
      : chunkSummaries.join(" ");

    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "READY",
        summary: overallSummary.slice(0, 5000),
      },
    });

    return NextResponse.json({
      ok: true,
      status: "READY",
      chunksProcessed: chunks.length,
      summaryLength: overallSummary.length,
    });
  } catch (e: any) {
    if (uploadId) {
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "ERROR" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`,
    },
    {
      path: "app/api/uploads/[uploadId]/status/route.ts",
      content: `import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

async function resolveUploadId(ctx: any): Promise<string> {
  const p = ctx.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved.uploadId;
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const uploadId = await resolveUploadId(ctx);
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: {
        id: true, status: true, totalChunks: true,
        receivedChunks: true, totalSize: true, summary: true,
        chatId: true,
      },
    });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    return NextResponse.json(upload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
    data: { role: "assistant", content: "Hello! I'm your AI assistant powered by Claude. How can I help you today?", chatId: chat.id },
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
    "A ChatGPT-style AI chat interface powered by Claude with streaming, conversation history, image upload, and a sidebar",
  keywords: [
    "ai chat",
    "ai chat app",
    "ai chat web",
    "chat web app",
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
    "chat application",
    "messaging",
    "conversation",
    "ai response",
    "chat history",
    "claude",
    "openai",
    "gemini",
    "streaming",
    "real-time chat",
    "realtime chat",
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
    "/api/ai-status",
    "/api/debug/env",
    "/api/db-check",
    "/api/chats",
    "/api/chats/[chatId]",
    "/api/chats/[chatId]/messages",
    "/api/uploads/init",
    "/api/uploads/[uploadId]/chunk",
    "/api/uploads/[uploadId]/finalize",
    "/api/uploads/[uploadId]/status",
  ],
  requiredEntities: ["User", "Chat", "Message", "Upload", "DocumentChunk"],
  getFiles,
  getPackageJson,
};
