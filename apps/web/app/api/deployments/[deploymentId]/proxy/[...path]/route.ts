import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDeploymentPort, relaunchDeployment } from "@/lib/deployer";
import { rateLimit, getEnvLimit } from "@/lib/rate-limit";
import { isValidAcceptanceToken } from "@/lib/acceptance-token";

const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "transfer-encoding",
  "cookie",
  "authorization",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "proxy-authorization",
  "proxy-connection",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "set-cookie",
  "www-authenticate",
  "proxy-authenticate",
]);

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; path: string[] }> }
) {
  const internalToken = req.headers.get("x-internal-acceptance-token");
  const isInternalAcceptance = internalToken ? isValidAcceptanceToken(internalToken) : false;

  let userId: string | null = null;

  if (isInternalAcceptance) {
    userId = "__acceptance__";
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;

    const rl = await rateLimit({
      userId,
      key: "proxy_get",
      windowSec: 60,
      limit: getEnvLimit("PROXY_REQ_LIMIT_PER_MIN", 120),
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", key: "proxy_get", resetAt: rl.resetAt.toISOString(), limit: rl.limit },
        { status: 429 }
      );
    }
  }

  const { deploymentId, path: pathSegments } = await params;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isInternalAcceptance && deployment.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deployment.status !== "SUCCESS") {
    return NextResponse.json(
      { error: "Deployment not available", status: deployment.status },
      { status: 503 }
    );
  }

  let port = getDeploymentPort(deploymentId);

  if (!port) {
    port = await relaunchDeployment(deploymentId);
  }

  if (!port) {
    return NextResponse.json(
      { error: "[DEPLOY] process not running and relaunch failed", deploymentId, internalPort: deployment.internalPort },
      { status: 503 }
    );
  }

  const targetPath = "/" + (pathSegments?.join("/") || "");
  const url = new URL(req.url);
  const targetUrl = `http://127.0.0.1:${port}${targetPath}${url.search}`;

  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      redirect: "manual",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = await req.text();
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Proxy error", details: msg },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
