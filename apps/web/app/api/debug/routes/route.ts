import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appDir = path.join(process.cwd(), "app/api/queue");

  const check = (rel: string) => {
    const full = path.join(process.cwd(), "app", rel);
    return fs.existsSync(full);
  };

  const routes = {
    "app/api/queue/[queueJobId]/stream/route.ts": check("api/queue/[queueJobId]/stream/route.ts"),
    "app/api/queue/[id]/stream/route.ts": check("api/queue/[id]/stream/route.ts"),
    "app/api/queue/status/route.ts": check("api/queue/status/route.ts"),
    "app/api/queue/build/route.ts": check("api/queue/build/route.ts"),
  };

  let queueDirTree: string[] = [];
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + "/" + entry.name;
      queueDirTree.push(rel);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    }
  };
  walk(appDir, "app/api/queue");

  return NextResponse.json({ routes, queueDirTree });
}
