/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig, type Plugin } from "vite";

// De fontpakketten verwijzen naar hun bestanden via import.meta.url, waardoor
// Vite ze nogmaals in assets/ zet. De app laadt ze uit public/fonts/.
function fontsUitPublic(): Plugin {
  return {
    name: "fonts-uit-public",
    enforce: "pre",
    transform(code, id) {
      if (!/@betteroffice\/fonts(-cjk)?\/dist\/[^/]+\.js$/.test(id)) return;
      return code.replace(
        /new URL\("\.\.\/assets\/([^"]+)", import\.meta\.url\)/g,
        'new URL("/fonts/$1", globalThis.location?.href ?? "http://localhost/")',
      );
    },
  };
}

export default defineConfig({
  plugins: [fontsUitPublic()],
  // Worktrees van agents en lokale proefuitvoer niet dubbel meetellen.
  test: {
    exclude: [...configDefaults.exclude, ".claude/**", ".local/**"],
    // Tests in het Nederlands, ongeacht de systeemtaal (zie docs/i18n.md).
    setupFiles: ["src/i18n/testopzet.ts"],
  },
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        // Elke interfacetaal behalve nl/en is één chunk (zie docs/i18n.md).
        manualChunks(id) {
          const taal = /\/src\/i18n\/locales\/([^/]+)\//.exec(id)?.[1];
          if (taal && taal !== "nl" && taal !== "en") return `i18n-${taal}`;
          if (/\/src\/i18n\/engine\/([^/]+)\.ts$/.test(id))
            return `engine-${/\/engine\/([^/]+)\.ts$/.exec(id)![1]}`;
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      events: "events/",
      process: "process/browser.js",
    },
  },
  // De engines laden WASM relatief aan import.meta.url; prebundelen verbreekt die paden.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    exclude: [
      "@betteroffice/docx",
      "@betteroffice/xlsx",
      "@betteroffice/pptx",
      "@betteroffice/fonts",
      "@betteroffice/docx-react",
      "@betteroffice/xlsx-react",
      "@betteroffice/pptx-react",
      "@betteroffice/docx/layout",
      "@betteroffice/docx/wasm",
    ],
  },
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  clearScreen: false,
});
