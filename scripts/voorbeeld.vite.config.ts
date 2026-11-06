import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { tekstengineCompatibiliteit } from "./tekstengine-compatibiliteit";
import { rekenbladengineCompatibiliteit } from "./rekenbladengine-compatibiliteit";

// Deze aansluiting is uitsluitend bouwgereedschap. Het distributiepakket is zelfstandig.
export default defineConfig({
  root: fileURLToPath(new URL("../packages/voorbeeld/frame", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [tekstengineCompatibiliteit(), rekenbladengineCompatibiliteit()],
  worker: {
    format: "es",
    plugins: () => [
      tekstengineCompatibiliteit(),
      rekenbladengineCompatibiliteit(),
    ],
  },
  build: {
    outDir: "../dist/frame",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // De drie imports in start.ts blijven aparte, luie documentroutes.
    rollupOptions: { output: { manualChunks: undefined } },
  },
});
