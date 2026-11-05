/** Speel vastgelegde bronupdates na op een replica van de beginhostbron. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createYrsSession } from "@betteroffice/docx/yrs";

const invoer = process.argv[2], uitvoer = process.argv[3];
assert.ok(invoer && uitvoer, "Geef workerbron.json en een nieuw rapportpad op");
const bytes = await readFile(invoer), bron = JSON.parse(bytes);
const rapport = { geslaagd: false, bron_sha256: createHash("sha256").update(bytes).digest("hex"), stappen: [],
  grens: "Updatevolgorde op replica's van de beginhostbron met de huidige SDK. Geen reconstructie van de oorspronkelijke workerheap, berichtplanner, lettertypen of renderer." };
const sessies = new Map();
function binair(waarde) {
  assert.ok(Array.isArray(waarde) && waarde.every(n => Number.isInteger(n) && n >= 0 && n <= 255), "Ongeldige bronbytes");
  return new Uint8Array(waarde);
}
try {
  assert.equal(bron.schema, 1, "Onbekend bronschema");
  assert.equal(bron.volledig, true, "Afgekapt bronbewijs niet naspelen als volledige reeks");
  const begin = binair(bron.begin);
  assert.ok(begin.length > 0 && begin.length <= 2 * 1024 * 1024, "Ongeldige beginbron");
  assert.ok(Array.isArray(bron.berichten) && bron.berichten.length <= 256, "Ongeldige berichtenreeks");
  const omvang = begin.length + bron.berichten.reduce((n, b) => n + (b.state?.length ?? 0) + (b.update?.length ?? 0), 0);
  assert.equal(omvang, bron.bytes, "Bronomvang wijkt af");
  assert.ok(omvang <= 2 * 1024 * 1024, "Bronbewijs te groot");
  for (const bericht of bron.berichten) {
    assert.ok(Number.isSafeInteger(bericht.worker) && bericht.worker > 0, "Workeridentiteit ontbreekt");
    if (!sessies.has(bericht.worker)) {
      const clientId = bron.berichten.find(b => b.worker === bericht.worker && b.clientId !== undefined)?.clientId ?? bron.clientId;
      const s = await createYrsSession({ clientId });
      sessies.set(bericht.worker, s);
      s.loadState(begin);
    }
    const s = sessies.get(bericht.worker);
    const stap = { worker: bericht.worker, id: bericht.id, type: bericht.type, geslaagd: false };
    rapport.stappen.push(stap);
    if (bericht.type === "destroy") continue;
    assert.ok(["bootstrap", "sync", "applyUpdate", "syncUpdate"].includes(bericht.type), "Onbekend updatebericht");
    const update = binair(bericht.state ?? bericht.update);
    if (bericht.type === "bootstrap") s.loadState(update);
    else s.applyUpdate(update);
    // Dezelfde brug wijst onbekende embeds af, ook zonder de dure paginalayout.
    const verhalen = s.storyIds();
    for (const story of verhalen) s.yrsBlocksForStory(story);
    Object.assign(stap, { geslaagd: true, verhalen: verhalen.length,
      alinea_aantal: s.paragraphs("body").length,
      hoofdtekst_sha256: createHash("sha256").update(JSON.stringify(s.paragraphs("body").map(p => p.text))).digest("hex") });
  }
  rapport.geslaagd = rapport.stappen.length > 0 && rapport.stappen.every(s => s.geslaagd || s.type === "destroy");
  assert.ok(rapport.geslaagd, "Geen volledige updateproef");
} catch (fout) {
  rapport.fout = String(fout);
  process.exitCode = 1;
} finally {
  for (const s of sessies.values()) s.destroy();
  await writeFile(uitvoer, JSON.stringify(rapport, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify({ geslaagd: rapport.geslaagd, stappen: rapport.stappen.length, fout: rapport.fout }));
