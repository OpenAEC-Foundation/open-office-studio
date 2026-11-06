import { build } from "vite";
import { resolve } from "node:path";
await build({
  configFile: false,
  root: resolve(process.env.OOS_DOCX_REFERENTIE_UIT, "app"),
  esbuild: { jsxInject: 'import React from "react"' },
  build: {
    outDir: resolve(process.env.OOS_DOCX_REFERENTIE_UIT, "site"),
    emptyOutDir: true,
  },
  logLevel: "warn",
});
