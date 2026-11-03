import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { maakWorkerConfig } from "../../scripts/workerconfig";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  worker: maakWorkerConfig(),
  // Zonder kantoorlettertypen in deze bundel (zie src/export/pdf/lettertypebron.ts).
  define: { "import.meta.env.VITE_DATABASE_APP": JSON.stringify("1") },
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
