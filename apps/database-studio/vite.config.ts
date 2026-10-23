import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  worker: { format: "es" },
  resolve: {
    alias: {
      stream: "stream-browserify",
      events: "events/",
      process: "process/browser.js",
    },
  },
  server: { host: "127.0.0.1", port: 1430, strictPort: true },
  build: { manifest: true },
});
