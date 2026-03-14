import type { Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import expressStatic from "express";

function getRootDir(): string {
  try {
    if (typeof __dirname !== "undefined" && __dirname) {
      return path.resolve(__dirname, "..");
    }
  } catch {}
  try {
    if (import.meta.url) {
      return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    }
  } catch {}
  return process.cwd();
}

const ROOT_DIR = getRootDir();
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");
const DIST_DIR = path.resolve(ROOT_DIR, "dist", "public");

export async function setupVite(app: Express) {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: true, allowedHosts: true },
    appType: "spa",
    root: CLIENT_DIR,
  });

  app.use(vite.middlewares);

  app.use("/{*splat}", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(CLIENT_DIR, "index.html");
      let html = await fs.promises.readFile(clientTemplate, "utf-8");
      html = await vite.transformIndexHtml(url, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`dist directory not found: ${DIST_DIR}`);
  }

  app.use(expressStatic.static(DIST_DIR));

  app.use("/{*splat}", (_req, res) => {
    res.sendFile(path.resolve(DIST_DIR, "index.html"));
  });
}
