import { prisma } from "./prisma";

export async function getMemory({
  userId,
  projectId,
}: {
  userId: string;
  projectId?: string;
}): Promise<Record<string, string>> {
  const now = new Date();
  const items = await prisma.memoryItem.findMany({
    where: {
      userId,
      expiresAt: { gt: now },
      OR: [
        { projectId: projectId || undefined },
        { projectId: null },
      ],
    },
    select: { key: true, value: true },
  });

  const result: Record<string, string> = {};
  for (const item of items) {
    result[item.key] = item.value;
  }
  return result;
}

export async function setMemory({
  userId,
  projectId,
  scope,
  key,
  value,
  ttlDays = 90,
}: {
  userId: string;
  projectId?: string;
  scope: "user" | "project";
  key: string;
  value: string;
  ttlDays?: number;
}): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const effectiveProjectId = projectId || "";

  const existing = await prisma.memoryItem.findFirst({
    where: { userId, projectId: effectiveProjectId || undefined, scope, key },
  });

  if (existing) {
    await prisma.memoryItem.update({
      where: { id: existing.id },
      data: { value, expiresAt },
    });
  } else {
    await prisma.memoryItem.create({
      data: {
        userId,
        projectId: projectId || null,
        scope,
        key,
        value,
        expiresAt,
      },
    });
  }
}

export async function cleanupExpiredMemory(): Promise<number> {
  const result = await prisma.memoryItem.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
