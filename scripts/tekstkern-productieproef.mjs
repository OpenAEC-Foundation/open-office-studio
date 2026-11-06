import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "vite";

/** Laad de productiecorrecties zonder het geïnstalleerde pakket te veranderen. */
export async function openProductieTekstkern(cacheDir) {
  const lader = await createServer({
    configFile: false, appType: "custom", cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null, preTransformRequests: false },
  });
  try {
    const { controleerNootKern } = await lader.ssrLoadModule("/scripts/tekstengine-compatibiliteit.ts");
    controleerNootKern();
    const { openTekstkernProef } = await lader.ssrLoadModule("/scripts/tekstkern-proef.ts");
    const paden = {
      edit: process.env.OOS_NOOT_WASM ?? "vendor/tekstengine/docx_edit_bg.wasm",
      layout: process.env.OOS_NOOT_LAYOUT_WASM ?? "vendor/tekstengine/docx_layout_bg.wasm",
    };
    const kernen = {};
    for (const [soort, pad] of Object.entries(paden)) {
      const bytes = await readFile(pad);
      kernen[soort] = { pad, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }
    const proef = await openTekstkernProef();
    let gesloten = false;
    return {
      ...proef, kernen,
      route: process.env.OOS_NOOT_WASM || process.env.OOS_NOOT_LAYOUT_WASM ? "expliciete tegenproef" : "productiekern",
      async sluit() {
        if (gesloten) return;
        gesloten = true;
        // De SDK importeert delen pas bij de eerste bewerking. De modulelader
        // blijft daarom tot na de laatste sessie beschikbaar.
        try { proef.sluit(); } finally { await lader.close(); }
      },
    };
  } catch (e) { await lader.close(); throw e; }
}
