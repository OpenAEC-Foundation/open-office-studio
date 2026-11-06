import { cp, mkdir } from "node:fs/promises";
import { controleerStudioIconen } from "./controleer-studio-iconen.mjs";
await controleerStudioIconen();
await mkdir("public/voorbeelden", { recursive: true });
for (const naam of [
  "Ontwerpnotitie.docx",
  "Materiaaloverzicht.xlsx",
  "Ontwerpvisie.pptx",
])
  await cp(`docs/voorbeelden/${naam}`, `public/voorbeelden/${naam}`);
await mkdir("public/fonts", { recursive: true });
await cp("node_modules/@betteroffice/fonts/assets", "public/fonts", {
  recursive: true,
});
await mkdir("public/licenses/fonts", { recursive: true });
await cp(
  "node_modules/@betteroffice/fonts/LICENSE",
  "public/licenses/fonts/LICENSE",
);
await cp(
  "node_modules/@betteroffice/fonts/LICENSES",
  "public/licenses/fonts/LICENSES",
  { recursive: true },
);
await cp("node_modules/@betteroffice/fonts-cjk/assets", "public/fonts", {
  recursive: true,
});
await mkdir("public/licenses/fonts-cjk", { recursive: true });
await cp(
  "node_modules/@betteroffice/fonts-cjk/LICENSE",
  "public/licenses/fonts-cjk/LICENSE",
);
await cp(
  "node_modules/@betteroffice/fonts-cjk/LICENSES",
  "public/licenses/fonts-cjk/LICENSES",
  { recursive: true },
);
// Extra open lettertypen (assets/lettertypen.json): uit de cache, anders downloaden.
{
  const { haalLettertypen, CACHE } = await import("./haal-lettertypen.mjs");
  const dev = process.env.npm_lifecycle_event === "predev";
  const offline = process.env.OOS_LETTERTYPEN_OFFLINE === "1";
  let resultaat;
  try {
    resultaat = await haalLettertypen({ netwerk: !offline });
  } catch (e) {
    resultaat = { ontbrekend: [String(e?.message ?? e)] };
  }
  if (resultaat.ontbrekend.length) {
    const uitleg = `Extra lettertypen ontbreken (${resultaat.ontbrekend.length}; eerste: ${resultaat.ontbrekend[0]}). Vul de cache ${CACHE} met "node scripts/haal-lettertypen.mjs" (netwerk naar github.com nodig) of zet een bewaarde cache terug.`;
    if (!dev) throw new Error(uitleg);
    console.warn(`Waarschuwing: ${uitleg} De app gebruikt nu alleen de meegeleverde lettertypen.`);
  }
}
// Spellingcontrole (#21): woordenboeken uit de cache of downloaden, en de WASM-module.
{
  const { haalWoordenboeken, CACHE } = await import("./haal-woordenboeken.mjs");
  const { bouwSpellingWasm } = await import("./bouw-spelling-wasm.mjs");
  const dev = process.env.npm_lifecycle_event === "predev";
  const problemen = [];
  try {
    const { ontbrekend } = await haalWoordenboeken({
      netwerk: process.env.OOS_WOORDENBOEKEN_OFFLINE !== "1",
    });
    if (ontbrekend.length)
      problemen.push(`Woordenboeken ontbreken (${ontbrekend[0]}…). Vul ${CACHE} met "node scripts/haal-woordenboeken.mjs".`);
  } catch (e) {
    problemen.push(String(e?.message ?? e));
  }
  try {
    await bouwSpellingWasm();
  } catch (e) {
    problemen.push(String(e?.message ?? e));
  }
  if (problemen.length) {
    if (!dev) throw new Error(problemen.join(" "));
    console.warn(`Waarschuwing: ${problemen.join(" ")} De spellingcontrole is dan niet beschikbaar.`);
  }
}
await import("./kopieer-licenties.mjs");
