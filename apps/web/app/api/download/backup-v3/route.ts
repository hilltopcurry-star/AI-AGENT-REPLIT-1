import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filePath = path.resolve(process.cwd(), "../../ai-workspace-full-backup-v3.tar.gz");

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Backup v3 file not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": "attachment; filename=\"ai-workspace-full-backup-v3.tar.gz\"",
      "Content-Length": String(stat.size),
    },
  });
}
