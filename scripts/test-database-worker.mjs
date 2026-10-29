import { Worker } from "node:worker_threads";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Controleert de gebouwde browserparser met een berichtadapter; geen vervanging voor een GUI-proef.
const uitvoermap = process.env.DATABASE_DIST ?? "dist";
const naam = (await readdir(`${uitvoermap}/assets`)).find((n) =>
  /^database-worker-.*\.js$/.test(n),
);
assert.ok(naam, "Bouw eerst de productieversie.");
const moduleUrl = pathToFileURL(resolve(uitvoermap, "assets", naam)).href;
for (const pad of process.argv.slice(2)) {
  const worker = new Worker(
    new URL(
      "data:text/javascript," +
        encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    // De productiebundel moet zijn eigen browserhulpmiddelen leveren.
    globalThis.Buffer = undefined;
    globalThis.process = undefined;
    globalThis.global = undefined;
    globalThis.setImmediate = undefined;
    globalThis.self = { postMessage: (bericht) => parentPort.postMessage(bericht) };
    // De controles hieronder lezen de Nederlandse rapportteksten; los van de systeemtaal van de runner.
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'nl-NL', languages: ['nl-NL'] }, configurable: true });
    await import(${JSON.stringify(moduleUrl)});
    parentPort.on('message', (data) => self.onmessage({data}));
    parentPort.postMessage({id: 0});
  `),
    ),
    { type: "module" },
  );
  let nummer = 0;
  const vraag = (bericht, id = ++nummer) =>
    new Promise((klaar, fout) => {
      const timer = setTimeout(() => {
        worker.terminate();
        fout(new Error("De databaseproef overschreed 15 seconden."));
      }, 15000);
      const luister = (antwoord) => {
        if (antwoord.id !== id) return;
        clearTimeout(timer);
        worker.off("message", luister);
        if (antwoord.fout) fout(new Error(antwoord.fout));
        else klaar(antwoord.resultaat);
      };
      worker.on("message", luister);
      worker.once("error", fout);
      if (bericht) worker.postMessage({ id, ...bericht });
    });
  try {
    await vraag(null, 0);
    const bytes = await readFile(pad);
    const hashVoor = createHash("sha256").update(bytes).digest("hex");
    const { objecten, rapport } = await vraag({
      type: "open",
      naam: pad.split("/").pop(),
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    });
    assert.equal(
      rapport.sha256,
      hashVoor,
      "Rapporthash wijkt af van het bestand.",
    );
    assert.ok(
      rapport.regels.some(
        (r) => r.onderdeel === "Uitvoering" && r.status === "niet uitgevoerd",
      ),
    );
    for (const onderdeel of [
      "Tabellen",
      "Opgeslagen query’s",
      "Relaties",
      "VBA-modules",
    ])
      assert.ok(
        rapport.regels.some((r) => r.onderdeel === onderdeel),
        `Rapportregel ${onderdeel} ontbreekt.`,
      );
    const tabellen = objecten.filter((o) => o.soort === "Tabel");
    let rijen = 0;
    for (const tabel of tabellen) {
      const pagina = await vraag({ type: "tabel", naam: tabel.naam, start: 0 });
      assert.ok(pagina.rijen.length <= 200);
      assert.equal(pagina.kolommen.length, pagina.kolomtypen.length);
      rijen += pagina.rijen.length;
      if (pagina.totaalRijen > 200) {
        const tweede = await vraag({
          type: "tabel",
          naam: tabel.naam,
          start: 200,
        });
        assert.ok(tweede.rijen.length > 0 && tweede.rijen.length <= 200);
      }
    }
    const hashNa = createHash("sha256")
      .update(await readFile(pad))
      .digest("hex");
    assert.equal(hashNa, hashVoor, "Het originele bestand is gewijzigd.");
    const tel = (soort) => objecten.filter((o) => o.soort === soort).length;
    console.log(
      `${pad}: ${tabellen.length} tabellen, ${rijen} rijen, ${tel("Query")} query’s, ${tel("Relatie")} relaties, ${tel("VBA")} VBA-modules via de productieparser gelezen; SHA-256 voor en na gelijk.`,
    );
  } finally {
    await worker.terminate();
  }
}
