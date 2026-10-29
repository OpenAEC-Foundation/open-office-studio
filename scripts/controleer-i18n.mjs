/**
 * Controle van de vertalingen (zoals check-i18n.py in de OpenAEC-template).
 * Gebruik: `pnpm i18n:check` of `node scripts/controleer-i18n.mjs [map]`.
 *
 * Voor elke taal uit src/i18n/talen.ts en elke namespace van de brontaal (nl):
 * - het bestand bestaat en is geldige JSON;
 * - elke sleutel van de brontaal bestaat, er zijn geen onbekende sleutels;
 * - geen lege waarden en geen andere soorten (tekst tegenover groep);
 * - dezelfde interpolatievariabelen ({{naam}}) en Trans-tags (<0>, <strong>);
 * - meervoud: elke vorm die de taal volgens CLDR nodig heeft (_one, _few, …)
 *   is aanwezig; overbodige vormen geven een waarschuwing.
 * Afsluitcode 1 bij fouten. Beperken: `--ns common,settings` en/of `--talen de,fr`.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MEERVOUD = /^(.*)_(zero|one|two|few|many|other)$/;
const BRONTAAL = "nl";

/** Leest de taalcodes uit src/i18n/talen.ts (één bron van waarheid). */
export async function leesTaalcodes(talenBestand = "src/i18n/talen.ts") {
  const bron = await readFile(talenBestand, "utf8");
  // De aangeboden talen; zonder INTERFACETALEN alle TAALCODES.
  const lijst =
    /INTERFACETALEN\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(bron) ??
    /TAALCODES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(bron);
  if (!lijst) throw new Error(`TAALCODES niet gevonden in ${talenBestand}`);
  return [...lijst[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Platte lijst van sleutel → waarde ("a.b.c"). */
export function maakPlat(boom, voorvoegsel = "", uit = new Map()) {
  for (const [sleutel, waarde] of Object.entries(boom ?? {})) {
    const pad = voorvoegsel ? `${voorvoegsel}.${sleutel}` : sleutel;
    if (waarde && typeof waarde === "object" && !Array.isArray(waarde)) maakPlat(waarde, pad, uit);
    else uit.set(pad, waarde);
  }
  return uit;
}

/** Variabelen ({{naam}}, {{naam, opmaak}}) en Trans-tags in een tekst. */
export function plaatshouders(tekst) {
  if (typeof tekst !== "string") return [];
  const namen = [...tekst.matchAll(/\{\{\s*([^,}\s]+)[^}]*\}\}/g)].map((m) => `{{${m[1]}}}`);
  const tags = [...tekst.matchAll(/<\/?([A-Za-z0-9]+)\s*\/?>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...namen, ...tags])].sort();
}

/** Deelt sleutels op in gewone sleutels en meervoudsgroepen (basis → vormen). */
function groepeer(plat) {
  const gewoon = new Map();
  const meervoud = new Map();
  for (const [sleutel, waarde] of plat) {
    const m = MEERVOUD.exec(sleutel);
    if (m) {
      if (!meervoud.has(m[1])) meervoud.set(m[1], new Map());
      meervoud.get(m[1]).set(m[2], waarde);
    } else gewoon.set(sleutel, waarde);
  }
  return { gewoon, meervoud };
}

const isLeeg = (w) => typeof w !== "string" || w.trim() === "";
const gelijk = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Controleert alle vertalingen in `map` (standaard src/i18n/locales).
 * Geeft { fouten, waarschuwingen, talen, namespaces, sleutels } terug.
 */
export async function controleerVertalingen({
  map = "src/i18n/locales",
  talen,
  alleenNamespaces,
  talenBestand = "src/i18n/talen.ts",
} = {}) {
  const fouten = [];
  const waarschuwingen = [];
  const alleCodes = await leesTaalcodes(talenBestand);
  const codes = talen ?? alleCodes;
  const leesJson = async (taal, ns) => JSON.parse(await readFile(join(map, taal, `${ns}.json`), "utf8"));

  let namespaces;
  try {
    namespaces = (await readdir(join(map, BRONTAAL)))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .filter((ns) => !alleenNamespaces || alleenNamespaces.includes(ns))
      .sort();
  } catch {
    return { fouten: [`Brontaal ${BRONTAAL} ontbreekt in ${map}`], waarschuwingen, talen: codes, namespaces: [], sleutels: 0 };
  }
  const aanwezig = new Set(await readdir(map));
  for (const map_ of aanwezig)
    if (!alleCodes.includes(map_)) waarschuwingen.push(`Map ${map_} hoort niet bij een taal uit talen.ts`);

  let sleutels = 0;
  for (const ns of namespaces) {
    let bron;
    try {
      bron = groepeer(maakPlat(await leesJson(BRONTAAL, ns)));
    } catch (e) {
      fouten.push(`${BRONTAAL}/${ns}.json: ongeldige JSON (${e.message})`);
      continue;
    }
    sleutels += bron.gewoon.size + bron.meervoud.size;
    for (const taal of codes) {
      const plek = `${taal}/${ns}.json`;
      if (!aanwezig.has(taal)) {
        fouten.push(`${plek}: taalmap ontbreekt`);
        continue;
      }
      let doel;
      try {
        doel = groepeer(maakPlat(await leesJson(taal, ns)));
      } catch (e) {
        fouten.push(`${plek}: ${e.code === "ENOENT" ? "bestand ontbreekt" : `ongeldige JSON (${e.message})`}`);
        continue;
      }
      // Gewone sleutels.
      for (const [sleutel, waarde] of bron.gewoon) {
        if (!doel.gewoon.has(sleutel)) {
          fouten.push(`${plek}: ontbreekt "${sleutel}"`);
          continue;
        }
        const vertaald = doel.gewoon.get(sleutel);
        if (isLeeg(vertaald)) fouten.push(`${plek}: lege waarde "${sleutel}"`);
        else if (!gelijk(plaatshouders(waarde), plaatshouders(vertaald)))
          fouten.push(
            `${plek}: andere variabelen in "${sleutel}" (${plaatshouders(vertaald).join(" ") || "geen"} i.p.v. ${plaatshouders(waarde).join(" ") || "geen"})`,
          );
      }
      for (const sleutel of doel.gewoon.keys())
        if (!bron.gewoon.has(sleutel) && !bron.meervoud.has(sleutel))
          fouten.push(`${plek}: onbekende sleutel "${sleutel}"`);
      // Meervoud: de vormen die deze taal nodig heeft.
      let nodig;
      try {
        nodig = new Intl.PluralRules(taal).resolvedOptions().pluralCategories;
      } catch {
        nodig = ["one", "other"];
      }
      for (const [basis, vormen] of bron.meervoud) {
        const bronVars = plaatshouders(vormen.get("other") ?? [...vormen.values()][0]);
        const vertaald = doel.meervoud.get(basis) ?? new Map();
        if (!vertaald.size && doel.gewoon.has(basis)) {
          fouten.push(`${plek}: "${basis}" moet meervoudsvormen hebben (${nodig.map((v) => `_${v}`).join(", ")})`);
          continue;
        }
        for (const vorm of nodig)
          if (!vertaald.has(vorm)) fouten.push(`${plek}: meervoudsvorm ontbreekt "${basis}_${vorm}"`);
        for (const [vorm, tekst] of vertaald) {
          if (!nodig.includes(vorm)) waarschuwingen.push(`${plek}: overbodige meervoudsvorm "${basis}_${vorm}"`);
          if (isLeeg(tekst)) fouten.push(`${plek}: lege waarde "${basis}_${vorm}"`);
          // {{count}} mag in een enkelvoudsvorm ontbreken ("één woord"); de rest niet.
          const vars = plaatshouders(tekst).filter((v) => v !== "{{count}}");
          const verwacht = bronVars.filter((v) => v !== "{{count}}");
          if (!gelijk(vars, verwacht))
            fouten.push(`${plek}: andere variabelen in "${basis}_${vorm}" (${vars.join(" ") || "geen"} i.p.v. ${verwacht.join(" ") || "geen"})`);
        }
      }
      for (const basis of doel.meervoud.keys())
        if (!bron.meervoud.has(basis)) fouten.push(`${plek}: onbekende meervoudssleutel "${basis}"`);
    }
  }
  return { fouten, waarschuwingen, talen: codes, namespaces, sleutels };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  // node scripts/controleer-i18n.mjs [map] [--ns common,settings] [--talen de,fr]
  const args = process.argv.slice(2);
  const optie = (naam) => {
    const i = args.indexOf(naam);
    if (i < 0) return undefined;
    const [waarde] = args.splice(i, 2).slice(1);
    return waarde?.split(",").filter(Boolean);
  };
  const alleenNamespaces = optie("--ns");
  const talen = optie("--talen");
  const map = args[0];
  const { fouten, waarschuwingen, talen: gecontroleerd, namespaces, sleutels } = await controleerVertalingen({
    ...(map ? { map } : {}),
    alleenNamespaces,
    talen,
  });
  for (const w of waarschuwingen) console.warn(`waarschuwing: ${w}`);
  for (const f of fouten) console.error(`fout: ${f}`);
  console.log(
    `${gecontroleerd.length} talen × ${namespaces.length} namespaces (${namespaces.join(", ")}), ${sleutels} sleutels in de brontaal: ` +
      (fouten.length ? `${fouten.length} fouten` : "in orde") +
      (waarschuwingen.length ? `, ${waarschuwingen.length} waarschuwingen` : ""),
  );
  process.exit(fouten.length ? 1 : 0);
}
