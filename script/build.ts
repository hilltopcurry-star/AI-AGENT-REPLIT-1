import { execSync } from "child_process";
import path from "path";

const rootDir = path.resolve(import.meta.dirname, "..");

console.log("Building client...");
execSync("npx vite build", { cwd: rootDir, stdio: "inherit" });

console.log("Building server...");
const externals = [
  "better-sqlite3",
  "@neondatabase/serverless",
  "pg",
  "pg-pool",
  "connect-pg-simple",
  "express-session",
  "passport",
  "passport-openidconnect",
  "openai",
  "lightningcss",
  "vite",
  "esbuild",
].map((e) => `--external:${e}`).join(" ");

execSync(
  `npx esbuild server/index.ts --bundle --platform=node --outfile=dist/index.cjs --format=cjs ${externals}`,
  { cwd: rootDir, stdio: "inherit" }
);

console.log("Build complete!");
