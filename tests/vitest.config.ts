import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  cacheDir: path.resolve(__dirname, "../.tmp-vitest/.vitest-cache"),
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 15_000,
    teardownTimeout: 5_000,
    sequence: { concurrent: false },
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../apps/web"),
      "@/lib": path.resolve(__dirname, "../apps/web/lib"),
    },
  },
});
