import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma, createTestUser, createTestProject, cleanupTestData,
} from "./helpers";
import { getMemory, setMemory, cleanupExpiredMemory } from "../apps/web/lib/memory";

let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectA: string;
let projectB: string;

beforeAll(async () => {
  userA = await createTestUser();
  userB = await createTestUser();
  projectA = await createTestProject(userA.id);
  projectB = await createTestProject(userA.id);
});

afterAll(async () => {
  await prisma.memoryItem.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Memory: setMemory and getMemory", () => {
  it("81 setMemory creates a MemoryItem record", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "preferred_stack",
      value: "Next.js + Prisma",
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "preferred_stack" },
    });
    expect(item).toBeTruthy();
    expect(item?.value).toBe("Next.js + Prisma");
  });

  it("82 setMemory sets expiresAt ~90 days from now", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "ttl_test",
      value: "val",
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "ttl_test" },
    });
    expect(item).toBeTruthy();
    const daysDiff = (item!.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(85);
    expect(daysDiff).toBeLessThan(95);
  });

  it("83 setMemory with custom ttlDays", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "custom_ttl",
      value: "v",
      ttlDays: 30,
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "custom_ttl" },
    });
    const daysDiff = (item!.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(25);
    expect(daysDiff).toBeLessThan(35);
  });

  it("84 getMemory returns stored value", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "get_test",
      value: "hello_world",
    });
    const mem = await getMemory({ userId: userA.id, projectId: projectA });
    expect(mem.get_test).toBe("hello_world");
  });

  it("85 getMemory returns empty for different user", async () => {
    const mem = await getMemory({ userId: userB.id, projectId: projectA });
    expect(Object.keys(mem).length).toBe(0);
  });

  it("86 setMemory upserts (updates existing key)", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "upsert_key",
      value: "v1",
    });
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "upsert_key",
      value: "v2",
    });
    const items = await prisma.memoryItem.findMany({
      where: { userId: userA.id, key: "upsert_key" },
    });
    expect(items.length).toBe(1);
    expect(items[0].value).toBe("v2");
  });

  it("87 user-scope memory (no projectId) is stored and retrieved", async () => {
    await setMemory({
      userId: userA.id,
      scope: "user",
      key: "global_pref",
      value: "dark_mode",
    });
    const mem = await getMemory({ userId: userA.id });
    expect(mem.global_pref).toBe("dark_mode");
  });

  it("88 user-scope memory is included in project-scoped getMemory", async () => {
    const mem = await getMemory({ userId: userA.id, projectId: projectA });
    expect(mem.global_pref).toBe("dark_mode");
  });

  it("89 different projects have isolated project-scope memory", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectB,
      scope: "project",
      key: "proj_b_key",
      value: "proj_b_val",
    });
    const memA = await getMemory({ userId: userA.id, projectId: projectA });
    const memB = await getMemory({ userId: userA.id, projectId: projectB });
    expect(memA.proj_b_key).toBeUndefined();
    expect(memB.proj_b_key).toBe("proj_b_val");
  });

  it("90 multiple keys can be stored for same user+project", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "key_a",
      value: "va",
    });
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "key_b",
      value: "vb",
    });
    const mem = await getMemory({ userId: userA.id, projectId: projectA });
    expect(mem.key_a).toBe("va");
    expect(mem.key_b).toBe("vb");
  });
});

describe("Memory: expiry and cleanup", () => {
  it("91 expired memory items are NOT returned by getMemory", async () => {
    await prisma.memoryItem.create({
      data: {
        userId: userA.id,
        projectId: projectA,
        scope: "project",
        key: "expired_key",
        value: "should_not_appear",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const mem = await getMemory({ userId: userA.id, projectId: projectA });
    expect(mem.expired_key).toBeUndefined();
  });

  it("92 cleanupExpiredMemory removes expired items", async () => {
    await prisma.memoryItem.create({
      data: {
        userId: userA.id,
        scope: "user",
        key: "cleanup_test_" + Date.now(),
        value: "old",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const count = await cleanupExpiredMemory();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("93 cleanupExpiredMemory does NOT remove future items", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "future_item",
      value: "keep_this",
    });
    await cleanupExpiredMemory();
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "future_item" },
    });
    expect(item).toBeTruthy();
  });

  it("94 MemoryItem has correct scope field", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "scope_check",
      value: "v",
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "scope_check" },
    });
    expect(item?.scope).toBe("project");
  });

  it("95 user-scope MemoryItem has null projectId", async () => {
    await setMemory({
      userId: userA.id,
      scope: "user",
      key: "user_scope_null_proj",
      value: "x",
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "user_scope_null_proj" },
    });
    expect(item?.projectId).toBeNull();
  });

  it("96 project-scope MemoryItem has projectId set", async () => {
    await setMemory({
      userId: userA.id,
      projectId: projectA,
      scope: "project",
      key: "proj_scope_has_id",
      value: "y",
    });
    const item = await prisma.memoryItem.findFirst({
      where: { userId: userA.id, key: "proj_scope_has_id" },
    });
    expect(item?.projectId).toBe(projectA);
  });

  it("97 setMemory enforces userId scoping", async () => {
    await setMemory({
      userId: userB.id,
      projectId: projectA,
      scope: "project",
      key: "userb_key",
      value: "userb_val",
    });
    const memA = await getMemory({ userId: userA.id, projectId: projectA });
    expect(memA.userb_key).toBeUndefined();
    const memB = await getMemory({ userId: userB.id, projectId: projectA });
    expect(memB.userb_key).toBe("userb_val");
  });

  it("98 large value can be stored", async () => {
    const bigVal = "x".repeat(10000);
    await setMemory({
      userId: userA.id,
      scope: "user",
      key: "big_value",
      value: bigVal,
    });
    const mem = await getMemory({ userId: userA.id });
    expect(mem.big_value?.length).toBe(10000);
  });

  it("99 memory keys are case-sensitive", async () => {
    await setMemory({ userId: userA.id, scope: "user", key: "CaseSensitive", value: "upper" });
    await setMemory({ userId: userA.id, scope: "user", key: "casesensitive", value: "lower" });
    const mem = await getMemory({ userId: userA.id });
    expect(mem.CaseSensitive).toBe("upper");
    expect(mem.casesensitive).toBe("lower");
  });

  it("100 getMemory with no projectId only returns user-scope items", async () => {
    const mem = await getMemory({ userId: userA.id });
    expect(mem.global_pref).toBe("dark_mode");
    expect(mem.preferred_stack).toBeUndefined();
  });
});
