#!/usr/bin/env node
// Zelfde regressieproeven voor de expliciet gekozen huidige of kandidaatkern.
// Gebruik: node scripts/proef-werkmapregio.mjs kern.wasm [uitvoermap]
import * as xlsx from "@betteroffice/xlsx";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
const uitvoer = resolve(process.argv[3] ?? ".local/getalnotatie");
mkdirSync(uitvoer, { recursive: true });
const pad = process.argv[2];
if (!pad) throw new Error("Geef de te toetsen WASM expliciet mee.");
const wasm = readFileSync(pad);
await xlsx.initWasm(wasm);
const boeken = [];
const checks = [];
function boek(regio) {
  const h = xlsx.openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  h.applyOps([
    {
      type: "setDefinedName",
      name: "_OpenAEC_NumberLocale",
      refers_to: JSON.stringify(regio),
      scope: null,
      hidden: true,
    },
  ]);
  return h;
}
function lees(h, a1) {
  const r = h.readCells({
    ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }],
  });
  assert.equal(r.ok, true);
  return r.ranges[0].cells[0][0];
}
function proef(naam, f) {
  try {
    f();
    checks.push({ naam, geslaagd: true });
  } catch (e) {
    checks.push({ naam, geslaagd: false, fout: e.message });
  }
}
const nl = boek("nl-NL"),
  en = boek("en-US");
proef("Gescheiden getalregio met echte pakket-JS en WASM", () => {
  for (const h of [nl, en]) {
    h.applyEdits({
      expectVersion: h.version(),
      steps: [
        {
          op: "setCellInputs",
          target: {
            sheetId: h.sheetInfo().sheetIds[0],
            range: { kind: "a1", a1: "A1" },
          },
          inputs: [["1234.5"]],
        },
      ],
    });
    h.setNumberFormat(0, "A1", { type: "custom", pattern: "#,##0.00" });
  }
  assert.equal(lees(nl, "A1").displayText, "1.234,50");
  assert.equal(lees(en, "A1").displayText, "1,234.50");
});
proef("LCID-datumtaal en valuta behouden regionale cijfers", () => {
  nl.editCell(0, 1, 0, "1-1-2026");
  nl.setNumberFormat(0, "A2", {
    type: "custom",
    pattern: "[$-409]dddd d mmmm yyyy",
  });
  assert.equal(lees(nl, "A2").displayText, "Thursday 1 January 2026");
  nl.setNumberFormat(0, "A1", { type: "custom", pattern: "[$€-413] #,##0.00" });
  assert.equal(lees(nl, "A1").displayText, "€ 1.234,50");
});
proef(
  "Nederlandse LCID geeft Nederlandse datumwoorden in een Amerikaans bestand",
  () => {
    en.editCell(0, 1, 0, "01/01/2026");
    en.setNumberFormat(0, "A2", {
      type: "custom",
      pattern: "[$-413]dddd d mmmm yyyy",
    });
    assert.equal(lees(en, "A2").displayText, "donderdag 1 januari 2026");
  },
);
proef("Invoer, Undo/Redo en bewaring zijn één transactie", () => {
  for (const [raw, value, display] of [
    ["1.234", 1234, "1234"],
    ["12,5", 12.5, "12,5"],
    ["15%", 0.15, "15%"],
    ["1-1-2026", 46023, "01-01-2026"],
  ]) {
    const h = boek("nl-NL");
    h.editCell(0, 0, 0, raw);
    assert.deepEqual(lees(h, "A1").value, { kind: "number", value });
    assert.equal(lees(h, "A1").displayText, display);
    h.undo();
    assert.equal(lees(h, "A1").value.kind, "empty");
    h.redo();
    assert.equal(lees(h, "A1").displayText, display);
    const r = xlsx.openWorkbook(h.save());
    boeken.push(r);
    assert.equal(lees(r, "A1").displayText, display);
  }
});
proef("TEXT formule berekent opnieuw na regiowissel", () => {
  nl.editCell(0, 0, 1, '=TEXT(A1,"#,##0.00")');
  assert.equal(lees(nl, "B1").displayText, "1.234,50");
  nl.applyOps([
    {
      type: "setDefinedName",
      name: "_OpenAEC_NumberLocale",
      refers_to: '"fr-FR"',
      scope: null,
      hidden: true,
    },
  ]);
  assert.equal(lees(nl, "B1").displayText, "1\u202f234,50");
  nl.undo();
  assert.equal(lees(nl, "B1").displayText, "1.234,50");
});
proef(
  "Bestaande tekst zonder regio blijft tekst bij ongewijzigd vastleggen",
  () => {
    const h = xlsx.openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    boeken.push(h);
    h.editCell(0, 0, 0, "'1/15");
    const input = h.cell(0, 0, 0).input;
    h.editCell(0, 0, 0, input);
    assert.deepEqual(lees(h, "A1").value, { kind: "text", value: "1/15" });
    const heropend = xlsx.openWorkbook(h.save());
    boeken.push(heropend);
    assert.deepEqual(lees(heropend, "A1").value, {
      kind: "text",
      value: "1/15",
    });
  },
);
proef("Regionale batchvlag blijft behouden door de echte pakket-JS", () => {
  const h = boek("nl-NL");
  const target = { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1:C1" } };
  const voor = h.historyState().undoDepth;
  const r = h.applyEdits({ expectVersion: h.version(), steps: [{
    op: "setCellInputs", target, inputs: [["12,5", "1-1-2026", "15%"]], localized: true,
  }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(["A1", "B1", "C1"].map(a1 => lees(h, a1).value), [12.5, 46023, 0.15].map(value => ({ kind: "number", value })));
  assert.equal(lees(h, "B1").displayText, "01-01-2026");
  assert.equal(h.historyState().undoDepth, voor + 1);
  h.undo();
  assert.equal(lees(h, "B1").value.kind, "empty");
  assert.equal(lees(h, "B1").displayText, "");
  h.redo();
  assert.equal(lees(h, "B1").displayText, "01-01-2026");
  const opnieuw = xlsx.openWorkbook(h.save()); boeken.push(opnieuw);
  assert.equal(lees(opnieuw, "B1").displayText, "01-01-2026");
});
proef("Ingebouwde datum volgt regio, invoervolgorde en bewaren zonder id-wijziging", () => {
  const h = boek("nl-NL");
  const target = { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1" } };
  h.applyEdits({ expectVersion: h.version(), steps: [{ op: "setCellValues", target, values: [[{ kind: "number", value: 46023 }]] }, { op: "setNumberFormat", target, format: "date" }] });
  assert.equal(lees(h, "A1").displayText, "01-01-2026");
  h.editCell(0, 0, 0, "1-2-2026");
  assert.deepEqual(lees(h, "A1").value, { kind: "number", value: 46054 });
  assert.equal(lees(h, "A1").displayText, "01-02-2026");
  const opnieuw = xlsx.openWorkbook(h.save()); boeken.push(opnieuw);
  assert.equal(lees(opnieuw, "A1").displayText, "01-02-2026");
  assert.deepEqual(opnieuw.captureFormat(0, "A1").formats[0].numberFormat, { kind: "builtin", id: 14 });
});
function gewijzigdeStijlen(h, oud, nieuw) {
  const pakket = unzipSync(h.save());
  const xml = strFromU8(pakket["xl/styles.xml"]);
  assert(xml.includes(`numFmtId="${oud}"`));
  pakket["xl/styles.xml"] = strToU8(xml.replaceAll(`numFmtId="${oud}"`, `numFmtId="${nieuw}"`));
  const opnieuw = xlsx.openWorkbook(zipSync(pakket, { mtime: new Date("1980-01-01T00:00:00Z") })); boeken.push(opnieuw);
  return opnieuw;
}
proef("Geïmporteerde ingebouwde datumtijd behoudt id 22 en volgt regiowissel", () => {
  const bron = boek("nl-NL");
  const target = { sheetId: bron.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1" } };
  bron.applyEdits({ expectVersion: bron.version(), steps: [{ op: "setCellValues", target, values: [[{ kind: "number", value: 46023.625 }]] }, { op: "setNumberFormat", target, format: "date" }] });
  const h = gewijzigdeStijlen(bron, 14, 22);
  assert.equal(lees(h, "A1").displayText, "01-01-2026 15:00");
  h.applyOps([{ type: "setDefinedName", name: "_OpenAEC_NumberLocale", refers_to: '"en-US"', scope: null, hidden: true }]);
  assert.equal(lees(h, "A1").displayText, "01/01/2026 15:00");
  assert.deepEqual(h.captureFormat(0, "A1").formats[0].numberFormat, { kind: "builtin", id: 22 });
});
proef("Geïmporteerde lage valuta-id gebruikt de expliciete code", () => {
  const bron = boek("nl-NL");
  bron.editCell(0, 0, 0, "1234,5");
  bron.setNumberFormat(0, "A1", { type: "custom", pattern: '0.00" €"' });
  const h = gewijzigdeStijlen(bron, 164, 5);
  assert.equal(lees(h, "A1").displayText, "1234,50 €");
  assert.deepEqual(lees(h, "A1").value, { kind: "number", value: 1234.5 });
});
const result = {
  wasm: pad,
  wasmSha256: createHash("sha256").update(wasm).digest("hex"),
  checks,
};
writeFileSync(
  join(uitvoer, "wasm-regioproef.json"),
  JSON.stringify(result, null, 2) + "\n",
);
writeFileSync(join(uitvoer, "wasm-regioproef.xlsx"), nl.save());
boeken.forEach((h) => h.dispose());
console.log(JSON.stringify(result, null, 2));
assert(checks.every((c) => c.geslaagd));
