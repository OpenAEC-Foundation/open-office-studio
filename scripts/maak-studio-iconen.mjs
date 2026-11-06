/** Platformiconen uit de exact goedgekeurde rasterbronnen in de studiocatalogus. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { helderePngHoeken, heldereIcoHoeken, vasteIcnsVolgorde } from "./normaliseer-studio-iconen.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const studios = JSON.parse(await readFile(join(repo, "assets/studios.json"), "utf8"));
const keuzes = process.argv.slice(2);
const versie = JSON.parse(await readFile(join(repo, "node_modules/@tauri-apps/cli/package.json"), "utf8")).version;
const manifestPad = join(repo, "assets/studio-iconen.json");
let manifest;
try { manifest = JSON.parse(await readFile(manifestPad, "utf8")); }
catch (e) { if (e.code !== "ENOENT") throw e; manifest = { gereedschap: "@tauri-apps/cli", versie, studios: {} }; }
if (keuzes.length && manifest.versie !== versie)
  throw new Error("Bouw alle studio-iconen opnieuw bij een andere versie van het gereedschap");
manifest.versie = versie;
for (const keuze of keuzes)
  if (!studios.some(s => s.sleutel === keuze && s.beeldmerk))
    throw new Error(`Geen goedgekeurde rasterbron voor studio ${keuze}`);

const lokaal = join(repo, ".local");
await mkdir(lokaal, { recursive: true });
for (const studio of studios.filter(s => s.beeldmerk && (!keuzes.length || keuzes.includes(s.sleutel)))) {
  const bron = join(repo, studio.beeldmerk.bronBestand);
  const bytes = await readFile(bron);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== studio.beeldmerk.sha256)
    throw new Error(`Bronbestand van ${studio.sleutel} wijkt af van de goedgekeurde checksum`);
  // Beide bestaande webingangen gebruiken dezelfde ongewijzigde bronbytes.
  for (const pad of [join(repo, "public", studio.beeldmerk.bestand), join(repo, "public/studio-icons", studio.sleutel + ".png")]) {
    await mkdir(dirname(pad), { recursive: true });
    await copyFile(bron, pad);
  }
  const tijdelijk = await mkdtemp(join(lokaal, `iconen-${studio.sleutel}-`));
  try {
    const voerUit = (extra = []) => {
      const r = spawnSync(process.execPath, [
        join(repo, "node_modules/@tauri-apps/cli/tauri.js"), "icon", bron, "--output", tijdelijk, ...extra,
      ], { cwd: repo, encoding: "utf8" });
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(r.stderr || r.stdout || `Iconenbouw mislukt: ${r.status}`);
    };
    voerUit();
    // Extra maten voor de titelbalk, visuele controle en Linux. De tweede
    // aanroep voegt alleen PNG's toe; de standaard ICO/ICNS blijven behouden.
    voerUit(["--png", "24", "--png", "48", "--png", "512"]);
    const doel = join(repo, "src-tauri/icons", studio.sleutel);
    await mkdir(doel, { recursive: true });
    for (const naam of await readdir(tijdelijk)) {
      if (!/\.(png|ico|icns)$/.test(naam)) continue;
      const bytes = await readFile(join(tijdelijk, naam));
      const normaliseer = naam.endsWith(".png") ? helderePngHoeken : naam.endsWith(".ico") ? heldereIcoHoeken : vasteIcnsVolgorde;
      await writeFile(join(doel, naam), normaliseer(bytes));
    }
    if (studio.sleutel === "office") {
      // De oude hoofdmap blijft een expliciete compatibiliteitskopie van Office.
      for (const naam of await readdir(doel))
        if (/\.(png|ico|icns)$/.test(naam)) await copyFile(join(doel, naam), join(repo, "src-tauri/icons", naam));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Rasterbeeldmerk Open Office Studio</title><image width="512" height="512" href="data:image/png;base64,${bytes.toString("base64")}"/></svg>\n`;
      await writeFile(join(repo, "assets/icon.svg"), svg);
    }
    // De browseringang krijgt dezelfde identiteit als de bijbehorende installer.
    const favicon = join(repo, "public/studios", studio.sleutel, "favicon.ico");
    await mkdir(dirname(favicon), { recursive: true });
    await copyFile(join(doel, "icon.ico"), favicon);
    const shaVan = async pad => createHash("sha256").update(await readFile(pad)).digest("hex");
    const iconen = {};
    for (const naam of (await readdir(doel)).sort())
      if (/\.(png|ico|icns)$/.test(naam)) iconen[naam] = await shaVan(join(doel, naam));
    manifest.studios[studio.sleutel] = { bronSha256: sha, iconen, faviconSha256: await shaVan(favicon) };
    console.log(`Iconen van ${studio.naam}: ${sha}`);
  } finally {
    await rm(tijdelijk, { recursive: true, force: true });
  }
}
await writeFile(manifestPad, JSON.stringify(manifest, null, 2) + "\n");
// De bestaande bronadministratie van de samengevoegde ronde blijft leesbaar.
const bronnen = [];
for (const s of studios.filter(s => s.beeldmerk)) {
  const namen = Object.keys(manifest.studios[s.sleutel].iconen);
  const paden = [...namen.map(naam => `src-tauri/icons/${s.sleutel}/${naam}`),
    `public/${s.beeldmerk.bestand}`, `public/studio-icons/${s.sleutel}.png`, `public/studios/${s.sleutel}/favicon.ico`];
  if (s.sleutel === "office") paden.push(...namen.map(naam => `src-tauri/icons/${naam}`), "assets/icon.svg");
  const outputs = [];
  for (const path of paden) {
    if (path.endsWith(".png")) {
      const bytes = await readFile(join(repo, path));
      outputs.push({ path, size: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] });
    } else outputs.push({ path });
  }
  bronnen.push({ name: s.naam, source: s.beeldmerk.bronBestand, sha256: s.beeldmerk.sha256, source_url: s.beeldmerk.bron, outputs });
}
await writeFile(join(repo, "docs/branding/icons.json"), JSON.stringify(bronnen, null, 2) + "\n");
