/** Real old/new WASM compatibility for read-only HYPERLINK target expressions. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const reference = {
  commit: "10b9ac1c7634da666498d21de3258dd3573ad397",
  sha256: "ad3d40536ad80eaebfa4a06dc2099885a485d850160e65e23f6306ba99abbe1e",
};
const out = ".local/matrix/rekenbladen";
const sha = (b) => createHash("sha256").update(b).digest("hex");

if (process.argv[2] === "--engine") {
  const [, , , variant, path] = process.argv;
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  const { createServer } = await import("vite");
  const bytes = await readFile(path);
  await initWasm(bytes);
  const server = await createServer({
    configFile: false,
    cacheDir: `.local/vite-cache-link-query-${variant}`,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
    logLevel: "error",
  });
  let h;
  try {
    const { formuleKoppeling } = await server.ssrLoadModule(
      "/src/rekenblad/formuleKoppeling.ts",
    );
    const { Pakket } = await server.ssrLoadModule("/src/grafieken/pakket.ts");
    const p = new Pakket(await readFile("public/templates/nieuw.xlsx"));
    const names =
      '<definedNames><definedName name="LinkTarget">"https://example.com/global"</definedName><definedName name="LinkTarget" localSheetId="0">"https://example.com/local"</definedName></definedNames>';
    let xml = p.lees("xl/workbook.xml");
    if (/<definedNames\b[^>]*\/>/.test(xml))
      xml = xml.replace(/<definedNames\b[^>]*\/>/, names);
    else if (/<definedNames\b/.test(xml))
      xml = xml.replace(/<definedNames\b[^>]*>[\s\S]*?<\/definedNames>/, names);
    else xml = xml.replace(/<calcPr\b/, names + "<calcPr");
    assert(xml.includes('name="LinkTarget"'));
    p.schrijf("xl/workbook.xml", xml);
    p.schrijf(
      "custom/hyperlink-preserved.bin",
      new Uint8Array([3, 1, 4, 1, 5]),
    );
    h = openWorkbook(p.inpakken());
    h.editCell(0, 0, 1, "HTTPS://EXAMPLE.COM");
    h.editCell(0, 0, 2, "12");
    const capability = h.readCells.bind(h);
    let queries = false;
    try {
      queries = Array.isArray(
        capability({
          ranges: [],
          formulaQueries: [
            {
              sheetId: h.sheetInfo().sheetIds[0],
              origin: { row: 2, col: 0 },
              target: { row: 2, col: 0 },
              formula: '"probe"',
            },
          ],
        }).formulaResults,
      );
    } catch (e) {
      assert.match(e.message, /unknown field [`'"]formulaQueries/);
    }
    if (variant === "reference") {
      assert.equal(sha(bytes), reference.sha256);
      assert(queries);
    }
    const cases = [
      ['"#L20"', "#L20", false],
      ['"../Report.xlsx"', "../Report.xlsx", false],
      ['B1&"/"&C1', "HTTPS://EXAMPLE.COM/12", false],
      ["LOWER(B1)", "https://example.com", true],
      ['LOWER(B1)&"/"&C1', "https://example.com/12", true],
      ['IF(AND(ROW()=3,COLUMN()=1),"#L20","#A1")', "#L20", true],
      ["LinkTarget", "https://example.com/local", true],
      ['IF(1/0,"bad","also bad")', null, true],
      ["UNSUPPORTED_TARGET(1)", null, true],
      ["NOW()", null, true],
      ["B1:C1", null, false],
    ];
    const results = [];
    for (const [expression, expected, requiresQuery] of cases) {
      const formula = `=HYPERLINK(${expression},"Link label")`;
      h.editCell(0, 2, 0, formula);
      const version = h.version(),
        history = h.historyState(),
        before = h.save();
      const actual = formuleKoppeling(h, 0, 2, 0);
      assert.equal(
        actual,
        requiresQuery && !queries ? null : expected,
        `${variant}: ${expression}`,
      );
      assert.equal(h.version(), version);
      assert.deepEqual(h.historyState(), history);
      assert.equal(h.cell(0, 2, 0).input, formula);
      assert.deepEqual(h.save(), before);
      results.push({
        expression,
        expected: requiresQuery && !queries ? null : expected,
        actual,
        unchanged: true,
      });
    }
    const report = {
      variant,
      wasmSha256: sha(bytes),
      queries,
      reference: variant === "reference" ? reference : null,
      cases: results,
    };
    await mkdir(out, { recursive: true });
    await writeFile(
      `${out}/hyperlink-${variant}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify({ variant, queries, passed: results.length }));
  } finally {
    h?.dispose();
    await server.close();
  }
} else {
  const cache = resolve(".local/formula-query-compat/query-engine.wasm");
  await mkdir(resolve(".local/formula-query-compat"), { recursive: true });
  let data = await readFile(cache).catch(() => null);
  if (!data || sha(data) !== reference.sha256) {
    const response = await fetch(
      `https://raw.githubusercontent.com/OpenAEC-Foundation/open-office-studio/${reference.commit}/vendor/rekenbladengine/xlsx_wasm_bg.wasm`,
      { signal: AbortSignal.timeout(30000) },
    );
    assert(response.ok, `Reference download: ${response.status}`);
    data = new Uint8Array(await response.arrayBuffer());
    assert.equal(sha(data), reference.sha256);
    await writeFile(cache, data);
  }
  for (const [variant, path] of [
    ["current", resolve("vendor/rekenbladengine/xlsx_wasm_bg.wasm")],
    ["reference", cache],
  ]) {
    const r = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--engine", variant, path],
      { encoding: "utf8", timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    process.stdout.write(r.stdout ?? "");
    if (r.status !== 0) throw new Error(`${variant}: ${r.error ?? r.stderr}`);
  }
}
