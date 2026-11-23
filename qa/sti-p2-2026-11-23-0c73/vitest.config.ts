import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["qa/sti-p2-2026-11-23-0c73/sti.test.ts"],
    setupFiles: ["src/i18n/testopzet.ts"],
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
