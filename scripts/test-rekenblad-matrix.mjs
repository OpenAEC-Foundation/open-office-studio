/** De matrix gebruikt dezelfde TypeScript- en vertaalimports als de applicatie. */
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const taal = await server.ssrLoadModule("/src/i18n/config.ts");
  await taal.zetTaal("nl");
  await server.ssrLoadModule("/scripts/test-matrix-rekenbladen.mjs");
} finally {
  await server.close();
}
