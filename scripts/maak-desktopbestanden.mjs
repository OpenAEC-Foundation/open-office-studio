/**
 * Maakt de Linux-startmenu-items (.desktop-sjablonen voor de Tauri-bundel, deb/rpm/AppImage)
 * met vertaalde GenericName/Comment/Keywords uit `src/i18n/locales/<taal>/desktop.json`
 * (`launcher.*`). Zie docs/i18n.md, "Desktop".
 *
 * Gebruik: `node scripts/maak-desktopbestanden.mjs` (schrijven) of `--check` (alleen controleren;
 * afsluitcode 1 als een sjabloon verouderd is). `src/i18n/desktop.test.ts` draait de controle.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { leesTaalcodes } from "./controleer-i18n.mjs";

/**
 * De sjablonen per app; `naam` is de sleutel onder `launcher` in desktop.json. `bestanden`: de app
 * opent gekoppelde bestanden (MimeType uit bundle.fileAssociations in tauri.linux.conf.json), dus
 * krijgt Exec `%F`: elk geselecteerd bestand als eigen argument, ook met spaties in het pad.
 */
export const SJABLONEN = [
  { naam: "officeStudio", pad: "src-tauri/linux/open-office-studio.desktop.hbs", bestanden: true },
  { naam: "databaseStudio", pad: "apps/database-studio/src-tauri/linux/open-database-studio.desktop.hbs" },
];

/**
 * Talen van de installers en startmenu-items (Linux .desktop, macOS Info.plist, NSIS).
 * Alleen talen die ook in src/i18n/talen.ts staan worden gebruikt.
 */
export const DESKTOPTALEN = ["nl", "en", "de", "fr", "es", "it", "pt-BR", "zh-CN"];

/** Taalcode van de interface → localecode in een .desktop-bestand (freedesktop). */
export function desktopLocale(taal) {
  if (taal === "pt-PT") return "pt";
  return taal.replace("-", "_");
}

/** Waarde voor een .desktop-regel: geen regeleinden, backslash verdubbeld. */
function waarde(tekst) {
  return String(tekst).replace(/\\/g, "\\\\").replace(/[\r\n\t]+/g, " ").trim();
}

function trefwoorden(tekst) {
  const lijst = String(tekst)
    .split(";")
    .map((w) => w.trim())
    .filter(Boolean);
  return lijst.length ? `${waarde(lijst.join(";"))};` : "";
}

/** Bouwt de inhoud van één sjabloon (Handlebars-variabelen van Tauri blijven staan). */
export async function maakSjabloon(app, { wortel = ".", talenBestand } = {}) {
  const bestanden = SJABLONEN.find((s) => s.naam === app)?.bestanden === true;
  const talen = (await leesTaalcodes(talenBestand ?? join(wortel, "src/i18n/talen.ts"))).filter((t) => DESKTOPTALEN.includes(t));
  const lees = async (taal) =>
    JSON.parse(await readFile(join(wortel, "src/i18n/locales", taal, "desktop.json"), "utf8")).launcher[app];
  const engels = await lees("en");
  const vertaald = [];
  for (const taal of talen) if (taal !== "en") vertaald.push([desktopLocale(taal), await lees(taal)]);

  const regels = [
    "[Desktop Entry]",
    "Type=Application",
    "Name={{name}}",
    `GenericName=${waarde(engels.genericName)}`,
    ...vertaald.map(([code, t]) => `GenericName[${code}]=${waarde(t.genericName)}`),
    `Comment=${waarde(engels.comment)}`,
    ...vertaald.map(([code, t]) => `Comment[${code}]=${waarde(t.comment)}`),
    `Keywords=${trefwoorden(engels.keywords)}`,
    ...vertaald.map(([code, t]) => `Keywords[${code}]=${trefwoorden(t.keywords)}`),
    bestanden ? "Exec={{exec}} %F" : "Exec={{exec}}",
    "StartupWMClass={{exec}}",
    "Icon={{icon}}",
    "Terminal=false",
    "Categories={{categories}}",
    "{{#if mime_type}}",
    "MimeType={{mime_type}}",
    "{{/if}}",
  ];
  const kop = [
    "# Gemaakt door scripts/maak-desktopbestanden.mjs uit src/i18n/locales/*/desktop.json; niet met de hand bewerken.",
    "# Tauri vult de Handlebars-variabelen in (bundle.linux.deb/rpm.desktopTemplate in tauri.conf.json).",
  ];
  return `${regels[0]}\n${kop.join("\n")}\n${regels.slice(1).join("\n")}\n`;
}

/** Schrijft (of controleert) alle sjablonen; geeft de verouderde paden terug. */
export async function maakAlle({ wortel = ".", controleer = false } = {}) {
  const verouderd = [];
  for (const { naam, pad } of SJABLONEN) {
    const doel = join(wortel, pad);
    const inhoud = await maakSjabloon(naam, { wortel });
    // Regeleinden gelijkschakelen: Git kan op Windows CRLF uitchecken.
    const huidig = (await readFile(doel, "utf8").catch(() => null))?.replace(/\r\n/g, "\n");
    if (huidig === inhoud) continue;
    verouderd.push(pad);
    if (!controleer) {
      await mkdir(dirname(doel), { recursive: true });
      await writeFile(doel, inhoud);
    }
  }
  return verouderd;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const controleer = process.argv.includes("--check");
  const verouderd = await maakAlle({ controleer });
  if (controleer && verouderd.length) {
    console.error(`Verouderd: ${verouderd.join(", ")}. Draai node scripts/maak-desktopbestanden.mjs.`);
    process.exit(1);
  }
  console.log(verouderd.length ? `Geschreven: ${verouderd.join(", ")}` : "Desktopbestanden zijn actueel.");
}
