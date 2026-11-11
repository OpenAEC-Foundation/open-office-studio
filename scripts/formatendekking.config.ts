import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/test-formatendekking.ts"],
    setupFiles: ["src/i18n/testopzet.ts"],
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
