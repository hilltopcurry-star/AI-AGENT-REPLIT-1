import express from "express";
import { setupAuth } from "./replit_integrations/auth";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { ensureTables } from "./db";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

async function main() {
  await ensureTables();
  await setupAuth(app);
  registerRoutes(app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    await setupVite(app);
  }

  const port = parseInt(process.env.PORT || "5000");
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.requestTimeout = 300000;
}

main().catch(console.error);
