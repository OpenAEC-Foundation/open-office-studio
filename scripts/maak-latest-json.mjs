/**
 * Maakt het updatemanifest `latest.json` voor de Tauri-updater (#26, docs/updates.md) uit de
 * ondertekende pakketten van een uitgave. Draait in de release-workflow (job `publiceren`) na het
 * hernoemen van de bestanden (spaties → punten), zodat de adressen gelijk zijn aan de downloadnamen.
 *
 * Gebruik: `node scripts/maak-latest-json.mjs <map> <versie> <tag> [notities]`
 * Schrijft `<map>/latest.json` als er handtekeningen (`*.sig`) van Open Office Studio zijn;
 * zonder handtekeningen (geen updatergeheim) gebeurt er niets en is de afsluitcode 0.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = "OpenAEC-Foundation/open-office-studio";
/** Alleen pakketten van Office Studio; Database Studio heeft (nog) geen updater. */
const PRODUCT = /^Open[ ._]Office[ ._]Studio/;

/**
 * Platformsleutels per pakketsoort. De updater zoekt eerst `<os>-<arch>-<installer>` en dan
 * `<os>-<arch>`. Linux krijgt geen algemene sleutel: een DEB-installatie mag nooit een AppImage
 * proberen te installeren (die meldt dan "handmatig bijwerken").
 */
export function platformen(naam, { macArch = "aarch64" } = {}) {
  if (/-setup\.exe$/i.test(naam)) return ["windows-x86_64-nsis", "windows-x86_64"];
  if (/\.app\.tar\.gz$/i.test(naam)) return [`darwin-${macArch}-app`, `darwin-${macArch}`];
  if (/\.AppImage$/i.test(naam)) return ["linux-x86_64-appimage"];
  if (/\.deb$/i.test(naam)) return ["linux-x86_64-deb"];
  if (/\.rpm$/i.test(naam)) return ["linux-x86_64-rpm"];
  return [];
}

/** Bouwt het manifest uit [bestandsnaam, handtekening]-paren. */
export function maakManifest(handtekeningen, { versie, tag, notities = "", datum = new Date(), macArch } = {}) {
  const platforms = {};
  for (const [naam, handtekening] of handtekeningen) {
    if (!PRODUCT.test(naam)) continue;
    const url = `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(naam)}`;
    for (const sleutel of platformen(naam, { macArch }))
      platforms[sleutel] = { signature: String(handtekening).trim(), url };
  }
  if (!Object.keys(platforms).length) return null;
  return { version: versie, notes: notities, pub_date: datum.toISOString(), platforms };
}

export async function maakLatestJson(map, versie, tag, notities = "") {
  const namen = await readdir(map);
  const paren = [];
  for (const naam of namen.filter((n) => n.endsWith(".sig"))) {
    const pakket = naam.slice(0, -4);
    if (!namen.includes(pakket)) throw new Error(`Handtekening zonder pakket: ${naam}`);
    paren.push([pakket, await readFile(join(map, naam), "utf8")]);
  }
  const manifest = maakManifest(paren, { versie, tag, notities });
  if (manifest) await writeFile(join(map, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const [map, versie, tag, notities = ""] = process.argv.slice(2);
  if (!map || !versie || !tag) {
    console.error("Gebruik: node scripts/maak-latest-json.mjs <map> <versie> <tag> [notities]");
    process.exit(2);
  }
  const manifest = await maakLatestJson(map, versie, tag, notities);
  console.log(
    manifest
      ? `latest.json: ${Object.keys(manifest.platforms).join(", ")}`
      : "Geen updaterhandtekeningen; geen latest.json (updates blijven uit voor deze uitgave).",
  );
}
