/** Converteruitvoer → productie-WASM → celbewerking → opgeslagen caches → heropenen. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { createServer } from "vite";
const map = process.env.OOS_FORMAAT_UIT ?? ".local/rekenbladformaten";
await initWasm(await readFile("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
const rapport = [];
function waarden(h, blad, bereik) {
  const r = h.readCells({
    ranges: [
      {
        sheetId: h.sheetInfo().sheetIds[blad],
        range: { kind: "a1", a1: bereik },
      },
    ],
  });
  assert(r.ok);
  return r.ranges[0].cells.map((row) => row.map((c) => c.value));
}
try {
  const bron = JSON.parse(
    await readFile(`${map}/report-checked.json`, "utf8").catch(() =>
      readFile(`${map}/report.json`, "utf8"),
    ),
  );
  for (const test of bron.cases) {
    assert(test.pass, `${test.format} prerequisite failed`);
    const p = new Pakket(new Uint8Array(await readFile(test.output)));
    p.schrijf("custom/engine-format-probe.bin", new Uint8Array([4, 5, 6]));
    const h = openWorkbook(p.inpakken());
    let saved;
    try {
      if (test.format !== "xlsb") {
        assert.deepEqual(
          waarden(h, 1, "A1:A3").flat(),
          [19.75, 19.75, 39.5].map((value) => ({ kind: "number", value })),
        );
        h.editCell(0, 1, 1, "20");
        assert.deepEqual(
          waarden(h, 1, "A1:A3").flat(),
          [27.25, 27.25, 54.5].map((value) => ({ kind: "number", value })),
        );
      } else {
        assert(
          waarden(h, 0, "A1:A30")
            .flat()
            .every((v) => v.kind === "number" && v.value === 3),
        );
        h.editCell(0, 0, 3, "Checked");
      }
      saved = h.save();
    } finally {
      h.dispose();
    }
    assert.deepEqual(
      new Pakket(saved).bytes("custom/engine-format-probe.bin"),
      new Uint8Array([4, 5, 6]),
    );
    const output = `${map}/engine-${test.format}-${test.dateSystem ?? "binary"}.xlsx`;
    await writeFile(output, saved);
    const terug = openWorkbook(saved);
    try {
      if (test.format !== "xlsb")
        assert.deepEqual(
          waarden(terug, 1, "A1:A3").flat(),
          [27.25, 27.25, 54.5].map((value) => ({ kind: "number", value })),
        );
      else
        assert(
          waarden(terug, 0, "A1:A30")
            .flat()
            .every((v) => v.kind === "number" && v.value === 3),
        );
    } finally {
      terug.dispose();
    }
    rapport.push({
      format: test.format,
      dateSystem: test.dateSystem ?? null,
      output,
      pass: true,
    });
    console.log(
      `${test.format}/${test.dateSystem ?? "binary"}: edit/save/reopen and unknown part retained`,
    );
  }
} finally {
  await writeFile(
    `${map}/engine-report.json`,
    JSON.stringify(rapport, null, 2),
  );
  await loader.close();
}
