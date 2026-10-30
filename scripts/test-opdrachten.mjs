/** Voer dezelfde TypeScript-opdrachten uit als de app, met echte bestandsengines. */
import { createServer } from "vite";

const proeven = {
  tekst: "scripts/test-tekst-word.mjs",
  rekenblad: "scripts/test-rekenblad-opdrachten.mjs",
  presentatie: "scripts/test-presentatie-opdrachten.mjs",
};
const [gekozen, ...argumenten] = process.argv.slice(2);
if (gekozen && !proeven[gekozen])
  throw new Error(
    "Gebruik tekst, rekenblad of presentatie; zonder argumenten worden alle drie uitgevoerd.",
  );
const server = await createServer({
  configFile: false,
  // Alleen moduletransformatie; geen browser, luisterpoort of bestandsbewaking.
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const oorspronkelijkeArgumenten = process.argv;
try {
  const taal = await server.ssrLoadModule("/src/i18n/config.ts");
  await taal.zetTaal("nl");
  for (const [naam, bestand] of Object.entries(proeven)) {
    if (gekozen && gekozen !== naam) continue;
    // CI controleert de pakketinhoud; renderproeven met een externe runtime zijn apart.
    const extra = gekozen
      ? argumenten
      : naam === "tekst"
        ? ["--zonder-libreoffice"]
        : [];
    process.argv = [process.execPath, bestand, ...extra];
    await server.ssrLoadModule(`/${bestand}`);
  }
} finally {
  process.argv = oorspronkelijkeArgumenten;
  await server.close();
}
