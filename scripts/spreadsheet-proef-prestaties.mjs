import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/** 100.000 getallen en 10.000 SUM-formules, zonder engine-opbouwkosten per cel. */
export function maakWerkmap(bestand = ".local/performance.xlsx") {
  const zip = unzipSync(fs.readFileSync("public/templates/nieuw.xlsx"));
  let sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  const rows = Array.from({ length: 10000 }, (_, i) => {
    const r = i + 1;
    const values = Array.from(
      { length: 10 },
      (_, c) => `<c r="${String.fromCharCode(65 + c)}${r}"><v>${r + c}</v></c>`,
    ).join("");
    return `<row r="${r}">${values}<c r="K${r}"><f>SUM(A${r}:J${r})</f><v>${10 * r + 45}</v></c></row>`;
  }).join("");
  const body = /<sheetData(?:\s[^>]*)?>[\s\S]*?<\/sheetData>|<sheetData\s*\/>/;
  if (!body.test(sheet)) throw Error("Template has no sheetData");
  sheet = sheet
    .replace(body, `<sheetData>${rows}</sheetData>`)
    .replace(/<dimension\b[^>]*\/>/, '<dimension ref="A1:K10000"/>');
  zip["xl/worksheets/sheet1.xml"] = strToU8(sheet);
  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(bestand, zipSync(zip));
}

/** Heropen de meetuitvoer met de echte engine en controleer elke waarde en formule. */
export async function controleerWerkmap(bestand, a1 = 999) {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
  const h = openWorkbook(fs.readFileSync(bestand));
  try {
    const sheetId = h.sheetInfo().sheetIds[0];
    let checked = 0;
    for (let row = 0; row < 10000; row += 100) {
      const r = h.readCells({
        ranges: [
          {
            sheetId,
            range: {
              kind: "rowCol",
              start: { row, col: 0 },
              end: { row: row + 99, col: 10 },
            },
          },
        ],
      });
      if (!r.ok) throw Error("Read refused after reopening");
      r.ranges[0].cells.forEach((cells, i) =>
        cells.forEach((cell, c) => {
          const n = row + i + 1;
          const expected =
            c === 10
              ? 10 * n + 45 + (n === 1 ? a1 - 1 : 0)
              : n === 1 && c === 0
                ? a1
                : n + c;
          if (cell.value.kind !== "number" || cell.value.value !== expected)
            throw Error(`Changed value at row ${n}, column ${c}`);
          if (c === 10 && cell.formula !== `SUM(A${n}:J${n})`)
            throw Error(`Changed formula at row ${n}`);
          checked++;
        }),
      );
    }
    return checked;
  } finally {
    h.dispose();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  maakWerkmap();
  console.log(
    "Created .local/performance.xlsx (100.000 values, 10.000 formulas)",
  );
}
