import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/test-writer-formaten.ts"],
    setupFiles: ["src/i18n/testopzet.ts"],
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
