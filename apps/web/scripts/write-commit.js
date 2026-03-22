const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { timeout: 3000 }).toString().trim();
} catch {
  commit = process.env.RAILWAY_GIT_COMMIT_SHA || "unknown";
}

const outDir = path.join(__dirname, "..", "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "__commit.txt"), commit, "utf8");
console.log(`[write-commit] Wrote commit: ${commit}`);
