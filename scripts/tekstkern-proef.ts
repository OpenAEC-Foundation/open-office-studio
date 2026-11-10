import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { herstelCelBreedteBron, herstelNootverwijzingOpmaak, herstelVormOpslag } from "./tekstengine-compatibiliteit";

/**
 * De Node-proef laadt dezelfde broncorrectie als Vite, met een eigen kopie van
 * de volledige modulegraaf. Zo blijven interne sessiegegevens in één instantie
 * en blijft het gedeelde node_modules-pakket onaangeroerd.
 */
export async function openTekstkernProef() {
  const lokaal = resolve(".local");
  mkdirSync(lokaal, { recursive: true });
  const map = mkdtempSync(join(lokaal, "tekstkern-proef-"));
  const sluit = () => rmSync(map, { recursive: true, force: true });
  try {
    cpSync(resolve("node_modules/@betteroffice/docx/dist"), map, { recursive: true });
    const aansluiting = [];
    const som = (tekst: string) => createHash("sha256").update(tekst).digest("hex");
    for (const [naam, herstel] of [["chunk-N5NWITJ6.mjs", herstelCelBreedteBron],
      ["chunk-HAZBP3QT.mjs", herstelNootverwijzingOpmaak],
      ["chunk-VJFO26DF.mjs", (bron: string) => herstelVormOpslag(bron).replace("openaec-tekst-vormopslag", pathToFileURL(resolve("src/tekst/vormen/opslag.ts")).href)]] as const) {
      const pad = join(map, naam), bron = readFileSync(pad, "utf8"), uit = herstel(bron);
      writeFileSync(pad, uit);
      aansluiting.push({ naam, oorspronkelijkSha256: som(bron), sha256: som(uit) });
    }
    const laad = (pad: string) => import(/* @vite-ignore */ pathToFileURL(join(map, pad)).href);
    const edit = await laad("wasm-edit.mjs");
    await edit.preloadEditWasm(readFileSync(process.env.OOS_NOOT_WASM ?? "vendor/tekstengine/docx_edit_bg.wasm"));
    const layout = await laad("wasm-layout.mjs");
    await layout.preloadLayoutWasm(readFileSync(process.env.OOS_NOOT_LAYOUT_WASM ?? "vendor/tekstengine/docx_layout_bg.wasm"));
    return {
      sdk: await laad("yrs/index.mjs") as typeof import("@betteroffice/docx/yrs"),
      docx: await laad("docx/index.mjs") as typeof import("@betteroffice/docx/docx"),
      aansluiting,
      sluit,
    };
  } catch (e) {
    sluit();
    throw e;
  }
}
