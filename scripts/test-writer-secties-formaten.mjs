// Real Writer section round trips. Requires LibreOffice; uses a private temporary profile.
// node scripts/test-writer-secties-formaten.mjs --soffice /path/to/soffice
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, join, dirname, sep, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2),
  i = args.indexOf("--soffice");
const office = i >= 0 ? args[i + 1] : process.env.OOS_LIBREOFFICE;
if (!office) throw new Error("Pass --soffice or OOS_LIBREOFFICE.");
const UIT = join(ROOT, ".local", "writer-secties-formaten");
for (const naam of ["docx", "odt", "terug", "native", "pdf", "odt-pdf"])
  mkdirSync(join(UIT, naam), { recursive: true });
const profiel = mkdtempSync(join(tmpdir(), "oos-s55-"));
const log = [];
function voer(programma, args, env = {}) {
  const r = spawnSync(programma, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  log.push({
    programma,
    args,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  });
  if (r.status !== 0)
    throw (
      r.error ??
      new Error((r.stderr || r.stdout || "Command failed").slice(-3000))
    );
  return r;
}
function converteer(van, naar, filter) {
  const ext = van === "docx" ? ".docx" : ".odt",
    files = readdirSync(join(UIT, van))
      .filter((f) => f.endsWith(ext))
      .map((f) => join(UIT, van, f));
  assert.equal(files.length, 8);
  voer(
    office,
    [
      "-env:UserInstallation=" + pathToFileURL(profiel).href,
      "--headless",
      "--convert-to",
      filter,
      "--outdir",
      join(UIT, naar),
      ...files,
    ],
    { SAL_DISABLE_DEFAULTPRINTER: "1", SAL_DISABLE_PRINTERLIST: "1" },
  );
  assert.equal(
    readdirSync(join(UIT, naar)).filter((f) =>
      f.endsWith("." + filter.split(":")[0]),
    ).length,
    8,
  );
  console.log(`${van} → ${naar}: eight files`);
}
let vite;
try {
  voer(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--configLoader",
      "runner",
      "--maxWorkers",
      "2",
      "src/tekst/pagina/secties-formaten-engine.test.ts",
    ],
    { OOS_SECTIES_UITVOER: join(UIT, "docx") },
  );
  vite = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { bewaarOdtSecties, herstelOdtSecties } = await vite.ssrLoadModule(
    "/src/tekst/pagina/odtSecties.ts",
  );
  const { leesSecties } = await vite.ssrLoadModule(
    "/src/tekst/pagina/secties.ts",
  );
  const { Pakket } = await vite.ssrLoadModule("/src/grafieken/pakket.ts");
  const semantiek = (bytes) => {
    const ids = new Map();
    return leesSecties(bytes).map(({ verwijzingen, ...s }) => ({
      ...s,
      verwijzingen: [...verwijzingen]
        .sort((a, b) =>
          (a.soort + "/" + a.type).localeCompare(b.soort + "/" + b.type),
        )
        .map((r) => {
          const key = r.soort + "/" + r.rid;
          if (!ids.has(key)) ids.set(key, ids.size);
          return { soort: r.soort, type: r.type, groep: ids.get(key) };
        }),
    }));
  };
  converteer("docx", "odt", "odt");
  const namen = readdirSync(join(UIT, "docx"))
    .filter((f) => f.endsWith(".docx"))
    .sort();
  for (const naam of namen) {
    const odt = join(UIT, "odt", naam.replace(/\.docx$/, ".odt"));
    writeFileSync(
      odt,
      await bewaarOdtSecties(
        readFileSync(join(UIT, "docx", naam)),
        readFileSync(odt),
      ),
    );
  }
  converteer("odt", "terug", "docx:Office Open XML Text");
  const { preloadEditWasm } = await import(
    pathToFileURL(
      join(ROOT, "node_modules/@betteroffice/docx/dist/wasm-edit.mjs"),
    ).href
  );
  await preloadEditWasm(
    readFileSync(join(ROOT, "vendor/tekstengine/docx_edit_bg.wasm")),
  );
  const { preloadLayoutWasm } = await import(
    pathToFileURL(
      join(ROOT, "node_modules/@betteroffice/docx/dist/wasm-layout.mjs"),
    ).href
  );
  await preloadLayoutWasm(
    readFileSync(join(ROOT, "vendor/tekstengine/docx_layout_bg.wasm")),
  );
  const resultaten = [];
  for (const naam of namen) {
    const source = readFileSync(join(UIT, "docx", naam)),
      odt = readFileSync(join(UIT, "odt", naam.replace(/\.docx$/, ".odt"))),
      verwacht = semantiek(source);
    let bytes = await herstelOdtSecties(
      odt,
      readFileSync(join(UIT, "terug", naam)),
    );
    assert.deepEqual(semantiek(bytes), verwacht);
    for (let ronde = 0; ronde < 2; ronde++) {
      const s = await createYrsSession();
      try {
        s.openDocx(bytes, true);
        const p = s
          .paragraphs("body")
          .find((p) => p.text.startsWith("Section 3"));
        assert.ok(p);
        s.insertText(
          { story: "body", paraId: p.paraId, offset: p.text.length },
          " Round-trip edit.",
        );
        bytes = (await saveYrsDocx(s)).bytes;
      } finally {
        s.destroy();
      }
      assert.deepEqual(semantiek(bytes), verwacht);
      const p = new Pakket(bytes);
      assert.match(p.lees("word/document.xml"), /<w:br\b[^>]*w:type="column"/);
      const xml = p
        .namen()
        .filter((n) => /^word\/(header|footer).*\.xml$/.test(n))
        .map((n) => p.lees(n))
        .join("");
      assert.match(xml, /\bPAGE\b/);
      assert.match(xml, /\bNUMPAGES\b/);
    }
    writeFileSync(join(UIT, "native", naam), bytes);
    resultaten.push({
      naam,
      secties: verwacht.length,
      kolommen: verwacht[1].kolommen.aantal,
      begin: verwacht[1].begin,
      roundTrips: 2,
    });
    console.log(
      `${naam}: exact section semantics and two native save/reopen cycles`,
    );
  }
  const pdf =
    'pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}';
  converteer("docx", "pdf", pdf);
  converteer("odt", "odt-pdf", pdf);
  writeFileSync(
    join(UIT, "resultaten.json"),
    JSON.stringify({ resultaten, conversies: log }, null, 2),
  );
  console.log(`PASS: ${resultaten.length} real ODF round trips. ${UIT}`);
} finally {
  await vite?.close();
  writeFileSync(join(UIT, "commando-log.json"), JSON.stringify(log, null, 2));
  const doel = resolve(profiel),
    temp = resolve(tmpdir()) + sep;
  if (!doel.startsWith(temp) || !basename(doel).startsWith("oos-s55-"))
    throw new Error("Unexpected temporary profile path");
  rmSync(doel, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
