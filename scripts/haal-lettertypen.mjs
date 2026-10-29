/**
 * Extra open lettertypen (assets/lettertypen.json) zonder binaire bestanden in Git.
 *
 * Elk bestand komt van een vaste bron (commit-SHA of release) en wordt met
 * sha256 gecontroleerd. Downloads gaan naar de cache .local/lettertypen-cache/
 * (genegeerd door Git; in CI bewaard met actions/cache), en van daaruit naar
 * public/fonts/extra/. Licentieteksten gaan naar public/licenses/fonts-extra/.
 *
 * Met een gevulde cache is geen netwerk nodig. Ontbreekt de cache en is er geen
 * netwerk, dan stopt een build met een duidelijke fout; `pnpm dev` waarschuwt
 * alleen (de app valt dan terug op de meegeleverde lettertypen).
 *
 * Gebruik:
 *   node scripts/haal-lettertypen.mjs            downloaden wat ontbreekt en kopiëren
 *   node scripts/haal-lettertypen.mjs --offline  alleen de cache gebruiken
 *   node scripts/haal-lettertypen.mjs --controleer  alleen de cache controleren
 * Omgeving: OOS_LETTERTYPEN_OFFLINE=1 verbiedt netwerk (zoals --offline).
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

export const MANIFEST = "assets/lettertypen.json";
export const CACHE = ".local/lettertypen-cache";
export const DOEL = "public/fonts/extra";
export const LICENTIES = "public/licenses/fonts-extra";
/** Alleen deze licenties zijn toegestaan. */
export const TOEGESTAAN = new Set(["OFL-1.1", "Apache-2.0"]);
/** Netwerk alleen naar GitHub (repositories en releases). */
const TOEGESTANE_HOSTS = new Set(["raw.githubusercontent.com", "github.com"]);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const slug = (familie) => familie.replace(/\s+/g, "");

export async function leesManifest(pad = MANIFEST) {
  const manifest = JSON.parse(await readFile(pad, "utf8"));
  for (const f of manifest.families) {
    if (!TOEGESTAAN.has(f.licentie))
      throw new Error(`${f.familie}: licentie ${f.licentie} is niet toegestaan (alleen OFL-1.1 of Apache-2.0).`);
    if (!f.licentiebestand?.url || !/^[0-9a-f]{64}$/.test(f.licentiebestand.sha256 ?? ""))
      throw new Error(`${f.familie}: licentiebestand of hash ontbreekt.`);
    for (const b of f.bestanden)
      if (!/^[0-9a-f]{64}$/.test(b.sha256 ?? "") || !/\.(ttf|otf)$/i.test(b.bestand))
        throw new Error(`${f.familie}: ${b.bestand} heeft geen geldige hash of geen TTF/OTF-naam.`);
  }
  return manifest;
}

async function download(url) {
  const host = new URL(url).hostname;
  if (!TOEGESTANE_HOSTS.has(host)) throw new Error(`Bron buiten GitHub geweigerd: ${url}`);
  let laatste;
  for (let poging = 0; poging < 3; poging++) {
    try {
      const antwoord = await fetch(url, { redirect: "follow" });
      if (antwoord.ok) return new Uint8Array(await antwoord.arrayBuffer());
      laatste = new Error(`HTTP ${antwoord.status} voor ${url}`);
      if (antwoord.status === 404) break;
    } catch (e) {
      laatste = e;
    }
  }
  throw laatste;
}

async function uitCache(pad, hash) {
  try {
    const data = await readFile(pad);
    return sha256(data) === hash ? data : null;
  } catch {
    return null;
  }
}

/**
 * Vult de cache (zo nodig met netwerk) en kopieert naar public/.
 * Geeft { ontbrekend, gedownload, bytes } terug; gooit alleen bij een
 * hash-fout van een download.
 */
export async function haalLettertypen({ netwerk = true, kopieer = true, log = console.log } = {}) {
  const manifest = await leesManifest();
  await mkdir(join(CACHE, "licenties"), { recursive: true });
  const archieven = new Map();
  const ontbrekend = [];
  let gedownload = 0;
  let bytes = 0;

  async function archief(url, hash) {
    if (!archieven.has(url)) {
      const pad = join(CACHE, "archieven", `${hash}.zip`);
      let data = await uitCache(pad, hash);
      if (!data && netwerk) {
        data = await download(url);
        if (sha256(data) !== hash) throw new Error(`Hash klopt niet voor ${url}`);
        await mkdir(join(CACHE, "archieven"), { recursive: true });
        await writeFile(pad, data);
      }
      archieven.set(url, data ? unzipSync(new Uint8Array(data)) : null);
    }
    return archieven.get(url);
  }

  for (const familie of manifest.families) {
    const licPad = join(CACHE, "licenties", `${slug(familie.familie)}.txt`);
    if (!(await uitCache(licPad, familie.licentiebestand.sha256))) {
      if (netwerk) {
        const data = await download(familie.licentiebestand.url);
        if (sha256(data) !== familie.licentiebestand.sha256)
          throw new Error(`Hash van de licentie klopt niet: ${familie.familie} (${familie.licentiebestand.url})`);
        await writeFile(licPad, data);
        gedownload++;
      } else ontbrekend.push(`${familie.familie}: licentie`);
    }
    for (const b of familie.bestanden) {
      const pad = join(CACHE, b.bestand);
      let data = await uitCache(pad, b.sha256);
      if (!data && netwerk) {
        if (b.archief) {
          const inhoud = await archief(b.url, b.archiefSha256);
          data = inhoud?.[b.archief] ?? null;
        } else data = await download(b.url);
        if (data && sha256(data) !== b.sha256)
          throw new Error(`Hash klopt niet: ${b.bestand} (${b.url})`);
        if (data) {
          await writeFile(pad, data);
          gedownload++;
        }
      }
      if (!data) ontbrekend.push(`${familie.familie}: ${b.bestand}`);
      else bytes += data.length;
    }
  }

  if (kopieer && !ontbrekend.length) {
    // Overschrijven en daarna opruimen (geen rm vooraf): een tweede build die
    // tegelijk loopt, ziet zo nooit een lege map.
    await mkdir(DOEL, { recursive: true });
    await mkdir(LICENTIES, { recursive: true });
    const gewenst = { [DOEL]: new Set(), [LICENTIES]: new Set(["BRONNEN.txt"]) };
    const bronnen = [];
    for (const familie of manifest.families) {
      for (const b of familie.bestanden) {
        await copyFile(join(CACHE, b.bestand), join(DOEL, b.bestand));
        gewenst[DOEL].add(b.bestand);
      }
      const licentie = `${slug(familie.familie)}-${familie.licentie}.txt`;
      await copyFile(join(CACHE, "licenties", `${slug(familie.familie)}.txt`), join(LICENTIES, licentie));
      gewenst[LICENTIES].add(licentie);
      bronnen.push(
        [
          `${familie.familie} — ${familie.licentie}`,
          `Bron: ${familie.bron}`,
          `Licentie: ${familie.licentiebestand.url}`,
          ...familie.bestanden.map((b) => `  ${b.bestand}  sha256 ${b.sha256}\n    ${b.url}${b.archief ? ` (${b.archief})` : ""}`),
        ].join("\n"),
      );
    }
    await writeFile(
      join(LICENTIES, "BRONNEN.txt"),
      `Extra lettertypen in public/fonts/extra (uit ${MANIFEST}).\n\n${bronnen.join("\n\n")}\n`,
    );
    for (const [map, namen] of Object.entries(gewenst))
      for (const naam of await readdir(map)) if (!namen.has(naam)) await rm(join(map, naam), { recursive: true, force: true });
  }
  log?.(
    ontbrekend.length
      ? `Lettertypen: ${ontbrekend.length} bestand(en) ontbreken in ${CACHE}.`
      : `Lettertypen: ${manifest.families.length} extra families (${(bytes / 1048576).toFixed(1)} MB)${gedownload ? `, ${gedownload} gedownload` : " uit de cache"}.`,
  );
  return { ontbrekend, gedownload, bytes, families: manifest.families.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const offline = process.argv.includes("--offline") || process.env.OOS_LETTERTYPEN_OFFLINE === "1";
  const alleenControle = process.argv.includes("--controleer");
  const r = await haalLettertypen({ netwerk: !offline && !alleenControle, kopieer: !alleenControle });
  if (r.ontbrekend.length) {
    console.error(`Ontbrekend:\n- ${r.ontbrekend.join("\n- ")}`);
    process.exit(1);
  }
}
