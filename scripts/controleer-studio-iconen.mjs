/** Weiger oude of gewijzigde platformiconen vóór de distributie-assets worden gekopieerd. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { studioConfig } from "./studio-config.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
export async function controleerStudioIconen(basis = repo) {
  const lees = async pad => JSON.parse(await readFile(join(basis, pad), "utf8"));
  const studios = await lees("assets/studios.json");
  const manifest = await lees("assets/studio-iconen.json");
  let aantal = 0;
  const controleer = async (pad, verwacht) => {
    const bytes = await readFile(join(basis, pad));
    if (createHash("sha256").update(bytes).digest("hex") !== verwacht)
      throw new Error(`Beeldmerk wijkt af: ${pad}`);
  };
  for (const studio of studios.filter(s => s.beeldmerk)) {
    const s = studio.sleutel, m = manifest.studios[s];
    if (!m || m.bronSha256 !== studio.beeldmerk.sha256)
      throw new Error(`Iconenmanifest hoort niet bij de goedgekeurde bron van ${s}`);
    await controleer(studio.beeldmerk.bronBestand, studio.beeldmerk.sha256);
    await controleer(`public/${studio.beeldmerk.bestand}`, studio.beeldmerk.sha256);
    await controleer(`public/studio-icons/${s}.png`, studio.beeldmerk.sha256);
    for (const naam of ["24x24.png", "32x32.png", "48x48.png", "128x128.png", "128x128@2x.png", "512x512.png", "icon.ico", "icon.icns"])
      if (!m.iconen[naam]) throw new Error(`Verplicht platformicoon ontbreekt: ${s}/${naam}`);
    for (const [naam, sha] of Object.entries(m.iconen)) {
      await controleer(`src-tauri/icons/${s}/${naam}`, sha);
      if (s === "office") await controleer(`src-tauri/icons/${naam}`, sha);
    }
    await controleer(`public/studios/${s}/favicon.ico`, m.faviconSha256);
    if (m.faviconSha256 !== m.iconen["icon.ico"]) throw new Error(`Favicon en installer verschillen: ${s}`);
    const verwacht = ["32x32.png", "128x128.png", "128x128@2x.png", "512x512.png", "icon.icns", "icon.ico"].map(n => `icons/${s}/${n}`);
    if (s === "office") {
      const svg = await readFile(join(basis, "assets/icon.svg"), "utf8");
      const raster = /\shref="data:image\/png;base64,([^"]+)"/.exec(svg);
      if (!raster || createHash("sha256").update(Buffer.from(raster[1], "base64")).digest("hex") !== studio.beeldmerk.sha256)
        throw new Error("De SVG-drager bevat niet het goedgekeurde Office-raster");
      const config = await lees("src-tauri/tauri.conf.json");
      if (JSON.stringify(config.bundle.icon) !== JSON.stringify(verwacht)) throw new Error("Office gebruikt niet zijn goedgekeurde platformiconen");
    } else for (const platform of ["linux", "win32", "darwin"])
      if (JSON.stringify((await studioConfig(s, platform)).bundle.icon) !== JSON.stringify(verwacht))
        throw new Error(`Verkeerde iconen voor ${s} op ${platform}`);
    aantal++;
  }
  if (aantal !== 6) throw new Error(`Zes goedgekeurde studio-identiteiten verwacht, ${aantal} gevonden`);
  return aantal;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(`${await controleerStudioIconen()} goedgekeurde studio-identiteiten gecontroleerd`);
