import { prisma } from "./prisma";
import * as https from "https";
import * as http from "http";
import { getAcceptanceToken } from "./acceptance-token";

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AcceptanceResult {
  passed: boolean;
  checks: CheckResult[];
  attempts: number;
}

async function logJob(jobId: string, level: string, message: string) {
  try {
    await prisma.jobLog.create({ data: { jobId, level, message } });
  } catch {}
}

function isProxyUrl(url: string): boolean {
  return url.includes("/api/deployments/") && url.includes("/proxy");
}

function toLocalProxyUrl(url: string): string {
  if (!isProxyUrl(url)) return url;
  try {
    const parsed = new URL(url);
    return `http://localhost:${process.env.PORT || 5000}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function getAcceptanceHeaders(): Record<string, string> {
  return { "x-internal-acceptance-token": getAcceptanceToken() };
}

function httpGet(url: string, timeoutMs = 30000, extraHeaders?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const headers: Record<string, string> = { ...extraHeaders };
    if (isProxyUrl(url)) {
      Object.assign(headers, getAcceptanceHeaders());
    }
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET" as const,
      headers,
      timeout: timeoutMs,
    };
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function httpPost(
  url: string,
  data: Record<string, unknown>,
  timeoutMs = 30000
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const payload = JSON.stringify(data);
    const extraHeaders: Record<string, string> = {};
    if (isProxyUrl(url)) {
      Object.assign(extraHeaders, getAcceptanceHeaders());
    }
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...extraHeaders,
      },
      timeout: timeoutMs,
    };
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(payload);
    req.end();
  });
}

async function checkHealth(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/health`);
    const parsed = JSON.parse(body);
    if (status === 200 && parsed.ok === true) {
      return { name: "health", passed: true, detail: "GET /api/health returned {ok:true}" };
    }
    return { name: "health", passed: false, detail: `status=${status} body=${body.slice(0, 200)}` };
  } catch (e: any) {
    return { name: "health", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkHomepage(baseUrl: string): Promise<CheckResult> {
  try {
    const { status } = await httpGet(baseUrl);
    if (status === 200) {
      return { name: "homepage", passed: true, detail: "Homepage loads (200)" };
    }
    return { name: "homepage", passed: false, detail: `status=${status}` };
  } catch (e: any) {
    return { name: "homepage", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkDbConnection(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/db-check`);
    const parsed = JSON.parse(body);
    if (status === 200 && parsed.ok === true) {
      return { name: "dbCheck", passed: true, detail: "GET /api/db-check returned {ok:true}" };
    }
    return { name: "dbCheck", passed: false, detail: `status=${status} body=${body.slice(0, 200)}` };
  } catch (e: any) {
    return { name: "dbCheck", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkProjectsPage(baseUrl: string, templateKey: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/projects`);
    if (status !== 200) {
      return { name: "projectsPage", passed: false, detail: `GET /projects returned status=${status}` };
    }

    const lower = body.toLowerCase();
    const hasMarker = lower.includes(`content="${templateKey}"`);
    if (hasMarker) {
      return { name: "projectsPage", passed: true, detail: `GET /projects 200 + template marker "${templateKey}" found` };
    }

    const signals = [
      lower.includes("project"),
      lower.includes("create") || lower.includes("new project"),
      lower.includes("projecthub") || lower.includes("task"),
    ];
    const signalCount = signals.filter(Boolean).length;
    if (signalCount >= 2) {
      return { name: "projectsPage", passed: true, detail: `GET /projects 200 + ${signalCount} template signals found` };
    }

    return {
      name: "projectsPage",
      passed: false,
      detail: `GET /projects 200 but no template marker and only ${signalCount}/2 signals. Not the correct template.`,
    };
  } catch (e: any) {
    return { name: "projectsPage", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkChatHomepage(baseUrl: string, templateKey: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(baseUrl);
    if (status !== 200) {
      return { name: "chatHomepage", passed: false, detail: `GET / returned status=${status}` };
    }
    const lower = body.toLowerCase();
    const hasMarker = lower.includes(`content="${templateKey}"`);
    if (hasMarker) {
      return { name: "chatHomepage", passed: true, detail: `GET / 200 + template marker "${templateKey}" found` };
    }
    const signals = [
      lower.includes("chat"),
      lower.includes("message") || lower.includes("conversation"),
      lower.includes("ai") || lower.includes("assistant"),
    ];
    const signalCount = signals.filter(Boolean).length;
    if (signalCount >= 2) {
      return { name: "chatHomepage", passed: true, detail: `GET / 200 + ${signalCount} chat signals found` };
    }
    return { name: "chatHomepage", passed: false, detail: `GET / 200 but only ${signalCount}/2 chat signals` };
  } catch (e: any) {
    return { name: "chatHomepage", passed: false, detail: `error: ${e.message}` };
  }
}

function httpPostStream(
  url: string,
  data: Record<string, unknown>,
  timeoutMs = 30000
): Promise<{ status: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const payload = JSON.stringify(data);
    const extraHeaders: Record<string, string> = {};
    if (isProxyUrl(url)) {
      Object.assign(extraHeaders, getAcceptanceHeaders());
    }
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...extraHeaders,
      },
      timeout: timeoutMs,
    };
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        contentType: res.headers["content-type"] || "",
        body,
      }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(payload);
    req.end();
  });
}

const DEMO_PATTERNS = [
  "i'm a demo ai assistant",
  "demo ai assistant",
  "this would connect to an ai model",
  "connect to an ai model like gpt",
];

async function checkAiStatus(baseUrl: string): Promise<CheckResult> {
  try {
    const { status, body } = await httpGet(`${baseUrl}/api/ai-status`);
    if (status !== 200) {
      return { name: "aiStatus", passed: false, detail: `GET /api/ai-status returned status=${status}` };
    }
    const parsed = JSON.parse(body);
    if (!parsed.configured) {
      return { name: "aiStatus", passed: false, detail: `ANTHROPIC_API_KEY not set in deployed app (provider=${parsed.provider}, model=${parsed.model})` };
    }
    return { name: "aiStatus", passed: true, detail: `AI configured: provider=${parsed.provider} model=${parsed.model}` };
  } catch (e: any) {
    return { name: "aiStatus", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkChatCrud(baseUrl: string): Promise<CheckResult> {
  try {
    const chatRes = await httpPost(`${baseUrl}/api/chats`, { title: "Smoke Test Chat" });
    if (chatRes.status !== 201 && chatRes.status !== 200) {
      return { name: "chatCrud", passed: false, detail: `POST /api/chats failed: status=${chatRes.status}` };
    }
    let chatId: string;
    try { chatId = JSON.parse(chatRes.body).id; } catch {
      return { name: "chatCrud", passed: false, detail: "Could not parse chat response" };
    }

    const msgRes = await httpPostStream(
      `${baseUrl}/api/chats/${chatId}/messages`,
      { content: "Say hello in exactly one sentence." }
    );

    if (msgRes.status === 400) {
      const errBody = JSON.parse(msgRes.body).error || "";
      if (errBody.toLowerCase().includes("not configured") || errBody.toLowerCase().includes("anthropic_api_key")) {
        return { name: "chatCrud", passed: false, detail: "AI not configured: ANTHROPIC_API_KEY not set in deployed environment" };
      }
      return { name: "chatCrud", passed: false, detail: `POST messages returned 400: ${errBody.slice(0, 200)}` };
    }

    if (msgRes.status !== 200 && msgRes.status !== 201) {
      return { name: "chatCrud", passed: false, detail: `POST messages failed: status=${msgRes.status} body=${msgRes.body.slice(0, 200)}` };
    }

    const isStreaming = msgRes.contentType.includes("text/event-stream");

    let responseText = "";
    let errorText = "";
    if (isStreaming) {
      const lines = msgRes.body.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === "token" && parsed.text) {
            responseText += parsed.text;
          } else if (parsed.type === "error" && parsed.error) {
            errorText = parsed.error;
          }
        } catch {}
      }
    } else {
      try {
        const parsed = JSON.parse(msgRes.body);
        if (parsed.messages) {
          const assistantMsg = parsed.messages.find((m: any) => m.role === "assistant");
          responseText = assistantMsg?.content || "";
        }
        if (parsed.error) {
          errorText = parsed.error;
        }
      } catch {}
    }

    if (errorText) {
      return { name: "chatCrud", passed: false, detail: `Claude API error: ${errorText.slice(0, 300)}` };
    }

    const lowerResponse = responseText.toLowerCase();
    for (const pattern of DEMO_PATTERNS) {
      if (lowerResponse.includes(pattern)) {
        return { name: "chatCrud", passed: false, detail: `Response contains demo placeholder text: "${pattern}"` };
      }
    }

    if (!responseText || responseText.length < 2) {
      const bodyPreview = msgRes.body.slice(0, 300).replace(/\n/g, "\\n");
      return {
        name: "chatCrud",
        passed: false,
        detail: `AI response was empty or too short (${responseText.length} chars). status=${msgRes.status} contentType=${msgRes.contentType} bodyPreview=${bodyPreview}`,
      };
    }

    const detailRes = await httpGet(`${baseUrl}/api/chats/${chatId}`);
    if (detailRes.status !== 200) {
      return { name: "chatCrud", passed: false, detail: `GET /api/chats/${chatId} returned status=${detailRes.status}` };
    }

    const streamNote = isStreaming ? " (streamed)" : " (non-streamed)";
    return { name: "chatCrud", passed: true, detail: `Created chat, sent message, received ${responseText.length}-char Claude reply${streamNote}, detail API verified` };
  } catch (e: any) {
    return { name: "chatCrud", passed: false, detail: `error: ${e.message}` };
  }
}

function parseStreamResponse(body: string): string {
  let text = "";
  const lines = body.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      if (parsed.type === "token" && parsed.text) text += parsed.text;
    } catch {}
  }
  return text;
}

async function checkLargeInput(baseUrl: string): Promise<CheckResult> {
  try {
    const textSize = 10000000;
    const chunkSize = 1000000;
    const totalChunks = Math.ceil(textSize / chunkSize);

    const chatRes = await httpPost(`${baseUrl}/api/chats`, { title: "Large Input Test 10M" });
    if (chatRes.status !== 201 && chatRes.status !== 200) {
      return { name: "largeInput", passed: false, detail: `Could not create chat: status=${chatRes.status}` };
    }
    const chatId = JSON.parse(chatRes.body).id;

    const initRes = await httpPost(`${baseUrl}/api/uploads/init`, {
      chatId, totalSize: textSize, chunkSize,
    });
    if (initRes.status !== 201) {
      return { name: "largeInput", passed: false, detail: `Upload init failed: status=${initRes.status} body=${initRes.body.slice(0, 200)}` };
    }
    const initData = JSON.parse(initRes.body);
    const { uploadId } = initData;
    const effectiveChunkSize = initData.chunkSize || chunkSize;
    const effectiveTotalChunks = initData.totalChunks || totalChunks;
    if (!uploadId) {
      return { name: "largeInput", passed: false, detail: "Upload init did not return uploadId" };
    }

    const topicsByChunk: string[] = [
      "quantum computing algorithms qubits superposition entanglement error correction",
      "machine learning neural networks deep learning gradient descent backpropagation",
      "distributed systems consensus protocols raft paxos byzantine fault tolerance",
      "cryptography encryption decryption public key infrastructure digital signatures",
      "database optimization indexing query planning sharding replication partitioning",
      "cloud infrastructure kubernetes containers orchestration microservices deployment",
      "compiler design lexical analysis parsing abstract syntax trees code generation",
      "network protocols tcp udp http websockets routing load balancing",
      "operating systems kernel memory management process scheduling virtual memory",
      "software engineering testing continuous integration deployment agile methodology",
    ];

    for (let i = 0; i < effectiveTotalChunks; i++) {
      const topic = topicsByChunk[i % topicsByChunk.length];
      let chunkContent = "";
      const chunkTarget = Math.min(effectiveChunkSize, textSize - i * effectiveChunkSize);
      while (chunkContent.length < chunkTarget) {
        chunkContent += `[Section ${i} paragraph ${Math.floor(chunkContent.length / 200)}] This section covers ${topic}. `;
        chunkContent += `In the field of ${topic.split(" ").slice(0, 2).join(" ")}, researchers have made significant advances. `;
        chunkContent += "The applications range from theoretical foundations to practical implementations in industry. ";
      }
      chunkContent = chunkContent.slice(0, chunkTarget);

      const chunkRes = await httpPost(`${baseUrl}/api/uploads/${uploadId}/chunk`, {
        index: i, content: chunkContent,
      });
      if (chunkRes.status !== 200) {
        return { name: "largeInput", passed: false, detail: `Chunk ${i}/${effectiveTotalChunks} upload failed: status=${chunkRes.status}` };
      }
    }

    const finalizeRes = await httpPost(`${baseUrl}/api/uploads/${uploadId}/finalize`, {});
    if (finalizeRes.status !== 200) {
      return { name: "largeInput", passed: false, detail: `Finalize failed: status=${finalizeRes.status} body=${finalizeRes.body.slice(0, 200)}` };
    }

    const statusRes = await httpGet(`${baseUrl}/api/uploads/${uploadId}/status`);
    if (statusRes.status !== 200) {
      return { name: "largeInput", passed: false, detail: `Status check failed: ${statusRes.status}` };
    }
    const statusData = JSON.parse(statusRes.body);
    if (statusData.status !== "READY") {
      return { name: "largeInput", passed: false, detail: `Upload not READY: status=${statusData.status}` };
    }

    const queries = [
      "What does this document say about quantum computing and qubits?",
      "Explain the distributed systems concepts covered, especially consensus protocols.",
      "What database optimization techniques are discussed in this document?",
    ];

    const queryResults: string[] = [];
    for (let q = 0; q < queries.length; q++) {
      const msgRes = await httpPostStream(
        `${baseUrl}/api/chats/${chatId}/messages`,
        { content: queries[q] },
        90000
      );
      if (msgRes.status !== 200) {
        return { name: "largeInput", passed: false, detail: `Query ${q + 1} failed: status=${msgRes.status}` };
      }
      const responseText = msgRes.contentType.includes("text/event-stream")
        ? parseStreamResponse(msgRes.body)
        : msgRes.body;

      if (!responseText || responseText.length < 10) {
        return { name: "largeInput", passed: false, detail: `Query ${q + 1} response too short: ${responseText.length} chars` };
      }
      const hasNextSteps = responseText.toLowerCase().includes("next step");
      if (!hasNextSteps) {
        return { name: "largeInput", passed: false, detail: `Query ${q + 1} missing 'Next steps' (${responseText.length} chars)` };
      }
      queryResults.push(`Q${q + 1}=${responseText.length}chars`);
    }

    const perfStart = Date.now();
    const newChatRes = await httpPost(`${baseUrl}/api/chats`, { title: "Perf Test" });
    if (newChatRes.status === 200 || newChatRes.status === 201) {
      const newChatId = JSON.parse(newChatRes.body).id;
      const perfMsgRes = await httpPostStream(
        `${baseUrl}/api/chats/${newChatId}/messages`,
        { content: "Hello, how are you?" },
        30000
      );
      const perfTime = Date.now() - perfStart;
      if (perfMsgRes.status === 200 && perfTime > 30000) {
        return { name: "largeInput", passed: false, detail: `New chat too slow after large upload: ${perfTime}ms` };
      }
    }

    return {
      name: "largeInput",
      passed: true,
      detail: `Uploaded ${textSize} chars in ${effectiveTotalChunks} chunks, indexed, 3 RAG queries passed (${queryResults.join(", ")}), new-chat perf OK`,
    };
  } catch (e: any) {
    return { name: "largeInput", passed: false, detail: `error: ${e.message}` };
  }
}

async function checkCrud(baseUrl: string): Promise<CheckResult> {
  try {
    const projRes = await httpPost(`${baseUrl}/api/projects`, {
      name: "Smoke Test Project",
      description: "Automated acceptance check",
    });
    if (projRes.status !== 201 && projRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `POST /api/projects failed: status=${projRes.status} body=${projRes.body.slice(0, 200)}`,
      };
    }

    let projectId: string;
    try {
      const parsed = JSON.parse(projRes.body);
      projectId = parsed.id;
    } catch {
      return { name: "crud", passed: false, detail: "Could not parse project response" };
    }

    const taskRes = await httpPost(`${baseUrl}/api/projects/${projectId}/tasks`, {
      title: "Smoke Test Task",
      priority: "high",
    });
    if (taskRes.status !== 201 && taskRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `POST /api/projects/${projectId}/tasks failed: status=${taskRes.status} body=${taskRes.body.slice(0, 200)}`,
      };
    }

    const detailRes = await httpGet(`${baseUrl}/projects/${projectId}`);
    if (detailRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `GET /projects/${projectId} returned status=${detailRes.status} (expected 200 for project detail page)`,
      };
    }

    const apiDetailRes = await httpGet(`${baseUrl}/api/projects/${projectId}`);
    if (apiDetailRes.status !== 200) {
      return {
        name: "crud",
        passed: false,
        detail: `GET /api/projects/${projectId} returned status=${apiDetailRes.status} (expected 200 for project API detail)`,
      };
    }

    return { name: "crud", passed: true, detail: "Created project + task via API, project detail page + API verified" };
  } catch (e: any) {
    return { name: "crud", passed: false, detail: `error: ${e.message}` };
  }
}

export async function runAcceptanceChecks(
  baseUrl: string,
  jobId: string,
  templateKey: string | null
): Promise<CheckResult[]> {
  const effectiveUrl = toLocalProxyUrl(baseUrl);
  await logJob(jobId, "INFO", `[ACCEPTANCE] templateKey=${templateKey || "none"}`);
  await logJob(jobId, "INFO", `[ACCEPTANCE] Running checks against ${effectiveUrl}${effectiveUrl !== baseUrl ? " (localized from " + baseUrl + ")" : ""}`);

  const checks: CheckResult[] = [];

  const healthResult = await checkHealth(effectiveUrl);
  checks.push(healthResult);
  await logJob(jobId, healthResult.passed ? "SUCCESS" : "ERROR",
    `[ACCEPTANCE] health ${healthResult.passed ? "OK" : "FAIL"}: ${healthResult.detail}`);

  const pageResult = await checkHomepage(effectiveUrl);
  checks.push(pageResult);
  await logJob(jobId, pageResult.passed ? "SUCCESS" : "ERROR",
    `[ACCEPTANCE] homepage ${pageResult.passed ? "OK" : "FAIL"}: ${pageResult.detail}`);

  if (templateKey === "ai-chat-saas") {
    const chatHomeResult = await checkChatHomepage(effectiveUrl, templateKey);
    checks.push(chatHomeResult);
    await logJob(jobId, chatHomeResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] chatHomepage ${chatHomeResult.passed ? "OK" : "FAIL"}: ${chatHomeResult.detail}`);

    const dbResult = await checkDbConnection(effectiveUrl);
    checks.push(dbResult);
    await logJob(jobId, dbResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] db-check ${dbResult.passed ? "OK" : "FAIL"}: ${dbResult.detail}`);

    const aiStatusResult = await checkAiStatus(effectiveUrl);
    checks.push(aiStatusResult);
    await logJob(jobId, aiStatusResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] aiStatus ${aiStatusResult.passed ? "OK" : "FAIL"}: ${aiStatusResult.detail}`);

    const chatCrudResult = await checkChatCrud(effectiveUrl);
    checks.push(chatCrudResult);
    await logJob(jobId, chatCrudResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] chatCrud ${chatCrudResult.passed ? "OK" : "FAIL"}: ${chatCrudResult.detail}`);

    const largeInputResult = await checkLargeInput(effectiveUrl);
    checks.push(largeInputResult);
    await logJob(jobId, largeInputResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] largeInput ${largeInputResult.passed ? "OK" : "FAIL"}: ${largeInputResult.detail}`);

    const summary = `chatHomepage:${chatHomeResult.passed ? "OK" : "FAIL"} dbCheck:${dbResult.passed ? "OK" : "FAIL"} aiStatus:${aiStatusResult.passed ? "OK" : "FAIL"} chatCrud:${chatCrudResult.passed ? "OK" : "FAIL"} largeInput:${largeInputResult.passed ? "OK" : "FAIL"}`;
    const allPassed = chatHomeResult.passed && dbResult.passed && aiStatusResult.passed && chatCrudResult.passed && largeInputResult.passed;
    await logJob(jobId, allPassed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] result=${allPassed ? "PASS" : "FAIL"} checks=${summary}`);
  } else if (templateKey) {
    const projectsResult = await checkProjectsPage(effectiveUrl, templateKey);
    checks.push(projectsResult);
    await logJob(jobId, projectsResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] projectsPage ${projectsResult.passed ? "OK" : "FAIL"}: ${projectsResult.detail}`);

    const dbResult = await checkDbConnection(effectiveUrl);
    checks.push(dbResult);
    await logJob(jobId, dbResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] db-check ${dbResult.passed ? "OK" : "FAIL"}: ${dbResult.detail}`);

    const crudResult = await checkCrud(effectiveUrl);
    checks.push(crudResult);
    await logJob(jobId, crudResult.passed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] crud ${crudResult.passed ? "OK" : "FAIL"}: ${crudResult.detail}`);

    const summary = `projectsPage:${projectsResult.passed ? "OK" : "FAIL"} dbCheck:${dbResult.passed ? "OK" : "FAIL"} crud:${crudResult.passed ? "OK" : "FAIL"}`;
    const allTemplatePassed = projectsResult.passed && dbResult.passed && crudResult.passed;
    await logJob(jobId, allTemplatePassed ? "SUCCESS" : "ERROR",
      `[ACCEPTANCE] result=${allTemplatePassed ? "PASS" : "FAIL"} checks=${summary}`);
  }

  const passedCount = checks.filter((c) => c.passed).length;
  await logJob(jobId, "INFO", `[ACCEPTANCE] Result: ${passedCount}/${checks.length} checks passed`);

  return checks;
}

export async function runAcceptanceWithRetry(
  baseUrl: string,
  jobId: string,
  templateKey: string | null,
  maxAttempts = 3
): Promise<AcceptanceResult> {
  let lastChecks: CheckResult[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await logJob(jobId, "INFO", `[ACCEPTANCE] Attempt ${attempt}/${maxAttempts}`);

    if (attempt === 2) {
      await logJob(jobId, "INFO", "[ACCEPTANCE] Waiting 20s before retry...");
      await new Promise((r) => setTimeout(r, 20000));
    } else if (attempt > 2) {
      await logJob(jobId, "INFO", "[ACCEPTANCE] Waiting 40s before retry...");
      await new Promise((r) => setTimeout(r, 40000));
    }

    lastChecks = await runAcceptanceChecks(baseUrl, jobId, templateKey);
    const allPassed = lastChecks.every((c) => c.passed);

    if (allPassed) {
      await logJob(jobId, "SUCCESS", `[ACCEPTANCE] All checks passed on attempt ${attempt}`);
      return { passed: true, checks: lastChecks, attempts: attempt };
    }

    const failedNames = lastChecks.filter((c) => !c.passed).map((c) => c.name).join(", ");
    await logJob(jobId, "WARN", `[ACCEPTANCE] Failed checks: ${failedNames}`);
  }

  await logJob(jobId, "ERROR", `[ACCEPTANCE] All ${maxAttempts} attempts exhausted. Deployment NOT verified.`);
  return { passed: false, checks: lastChecks, attempts: maxAttempts };
}

export function formatAcceptanceReport(result: AcceptanceResult): string {
  const lines: string[] = [];
  lines.push(`\n=== Acceptance Check Report (${result.attempts} attempt${result.attempts > 1 ? "s" : ""}) ===`);
  for (const c of result.checks) {
    const icon = c.passed ? "PASS" : "FAIL";
    lines.push(`  [${icon}] ${c.name}: ${c.detail}`);
  }
  lines.push(`  Result: ${result.passed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  lines.push("===");
  return lines.join("\n");
}
