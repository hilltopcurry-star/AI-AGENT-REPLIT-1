import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are an ultra-intelligent AI assistant with expert-level knowledge across all domains, especially web development, software engineering, and programming. 

Key behaviors:
- Read and analyze the FULL conversation context before responding
- Never hallucinate or bluff. If you're unsure, say "I don't know" or "I'm not sure"
- Respond in the same language the user writes in (auto-detect)
- Support all major languages (English, Urdu, Hindi, Arabic, Vietnamese, Chinese, etc.)
- Provide detailed, well-structured responses with code examples when relevant
- Use markdown formatting for clarity (headers, code blocks, lists, bold, etc.)
- For code, always specify the language in code blocks
- When images are shared, analyze them carefully and describe what you see
- Be honest, helpful, and thorough`;

const SUMMARY_THRESHOLD = 40;
const RECENT_MESSAGES_TO_KEEP = 20;
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["data:image/jpeg;", "data:image/png;", "data:image/webp;", "data:image/gif;"];

function getUserId(req: Request): number {
  return (req.session as any).userId;
}

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sseWrite(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}

function parseAttachments(attachmentsStr: string | null): string[] {
  if (!attachmentsStr) return [];
  try {
    const parsed = JSON.parse(attachmentsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildMessageContent(
  textContent: string,
  attachments: string[]
): string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> {
  if (attachments.length === 0) return textContent;

  const parts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];

  const realText = textContent && textContent !== "[Images attached]" ? textContent : "";
  if (realText) {
    parts.push({ type: "text", text: realText });
  } else {
    parts.push({ type: "text", text: "Please analyze these images." });
  }

  for (const img of attachments) {
    parts.push({
      type: "image_url",
      image_url: { url: img, detail: "auto" },
    });
  }

  return parts;
}

async function generateSummary(messages: { role: string; content: string }[]): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "Summarize the following conversation concisely. Capture key topics, decisions, code discussed, and important context. This summary will be used to maintain conversation context. Be thorough but concise.",
        },
        {
          role: "user",
          content: messages.map(m => `${m.role}: ${m.content}`).join("\n\n"),
        },
      ],
      max_completion_tokens: 8192,
    });
    return response.choices[0]?.message?.content || "";
  } catch (err) {
    console.error("Failed to generate summary:", err);
    return "";
  }
}

async function generateTitle(firstMessage: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "Generate a very short title (3-6 words max) for a conversation that starts with the following message. Return ONLY the title, no quotes or punctuation unless part of the title. Respond in the same language as the message.",
        },
        { role: "user", content: firstMessage },
      ],
      max_completion_tokens: 50,
    });
    return response.choices[0]?.message?.content?.trim() || "New Chat";
  } catch {
    return "New Chat";
  }
}

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const convs = await storage.getUserConversations(userId);
      res.json(convs);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const title = typeof req.body.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : "New Chat";
      const conv = await storage.createConversation({ userId, title });
      res.json(conv);
    } catch (err) {
      console.error("Failed to create conversation:", err);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ID" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Not found" });
      if (conv.userId !== getUserId(req)) return res.status(403).json({ message: "Forbidden" });
      res.json(conv);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.patch("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ID" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Not found" });
      if (conv.userId !== getUserId(req)) return res.status(403).json({ message: "Forbidden" });

      const { title } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      const updated = await storage.updateConversationTitle(conv.id, title.trim());
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ID" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Not found" });
      if (conv.userId !== getUserId(req)) return res.status(403).json({ message: "Forbidden" });

      await storage.deleteConversation(conv.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ID" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Not found" });
      if (conv.userId !== getUserId(req)) return res.status(403).json({ message: "Forbidden" });

      const msgs = await storage.getConversationMessages(conv.id);
      res.json(msgs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const convId = parseId(req.params.id);
      if (!convId) return res.status(400).json({ message: "Invalid ID" });

      const conv = await storage.getConversation(convId);
      if (!conv) return res.status(404).json({ message: "Not found" });
      if (conv.userId !== getUserId(req)) return res.status(403).json({ message: "Forbidden" });

      const { content, attachments: rawAttachments } = req.body;

      const hasText = content && typeof content === "string" && content.trim();
      const attachments: string[] = [];

      if (Array.isArray(rawAttachments)) {
        for (const img of rawAttachments.slice(0, MAX_IMAGES)) {
          if (typeof img !== "string") continue;
          const isAllowed = ALLOWED_IMAGE_TYPES.some(t => img.startsWith(t));
          if (!isAllowed) continue;
          const base64Part = img.split(",")[1];
          if (!base64Part) continue;
          const sizeBytes = Math.ceil(base64Part.length * 0.75);
          if (sizeBytes > MAX_IMAGE_BYTES) continue;
          attachments.push(img);
        }
      }

      if (!hasText && attachments.length === 0) {
        return res.status(400).json({ message: "Content or images required" });
      }

      const textContent = hasText ? content.trim() : "";
      const attachmentsJson = attachments.length > 0 ? JSON.stringify(attachments) : null;

      await storage.createMessage({
        conversationId: convId,
        role: "user",
        content: textContent || "[Images attached]",
        attachments: attachmentsJson,
      });

      const allMessages = await storage.getConversationMessages(convId);

      const isFirstMessage = allMessages.length === 1;
      if (isFirstMessage) {
        const titleSource = textContent || "Image analysis";
        generateTitle(titleSource).then(title => {
          storage.updateConversationTitle(convId, title);
        });
      }

      const contextMessages: Array<{
        role: "system" | "user" | "assistant";
        content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
      }> = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

      const messagesToUse = allMessages.length > SUMMARY_THRESHOLD
        ? (() => {
            if (conv.summary) {
              contextMessages.push({
                role: "system",
                content: `Previous conversation summary:\n${conv.summary}`,
              });
            }
            return allMessages.slice(-RECENT_MESSAGES_TO_KEEP);
          })()
        : allMessages;

      for (const msg of messagesToUse) {
        const msgAttachments = parseAttachments(msg.attachments);
        contextMessages.push({
          role: msg.role as "user" | "assistant",
          content: buildMessageContent(msg.content, msgAttachments),
        });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Transfer-Encoding", "chunked");
      res.status(200);
      res.flushHeaders();

      sseWrite(res, { type: "start" });

      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
        if (typeof (res as any).flush === "function") {
          (res as any).flush();
        }
      }, 15000);

      let fullResponse = "";

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5.2",
          messages: contextMessages as any,
          stream: true,
          max_completion_tokens: 8192,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            sseWrite(res, { content: delta });
          }
        }
      } catch (streamErr: any) {
        console.error("OpenAI stream error:", streamErr?.message || streamErr);
        sseWrite(res, { error: "AI response failed. Please try again." });
      }

      clearInterval(heartbeat);

      if (fullResponse) {
        await storage.createMessage({
          conversationId: convId,
          role: "assistant",
          content: fullResponse,
        });

        const totalMessages = allMessages.length + 1;
        const shouldSummarize = totalMessages >= SUMMARY_THRESHOLD &&
          (totalMessages % SUMMARY_THRESHOLD === 0 || (!conv.summary && totalMessages > SUMMARY_THRESHOLD));

        if (shouldSummarize) {
          const allMsgsWithAssistant = await storage.getConversationMessages(convId);
          const messagePairs = allMsgsWithAssistant.map(m => ({
            role: m.role,
            content: m.content,
          }));
          generateSummary(messagePairs).then(summary => {
            if (summary) {
              storage.updateConversationSummary(convId, summary);
            }
          });
        }
      }

      sseWrite(res, { done: true });
      res.end();
    } catch (err: any) {
      console.error("Failed to send message:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to send message" });
      } else {
        sseWrite(res, { error: "Failed to process message" });
        res.end();
      }
    }
  });
}
