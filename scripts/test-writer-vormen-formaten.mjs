// Real ODF round trips and native shape edits. Requires LibreOffice.
// node scripts/test-writer-vormen-formaten.mjs --soffice /path/to/soffice
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2),
  i = args.indexOf("--soffice");
const office = i >= 0 ? args[i + 1] : process.env.OOS_LIBREOFFICE;
if (!office) throw new Error("Pass --soffice or OOS_LIBREOFFICE.");
const UIT = join(ROOT, ".local", "writer-vormen-formaten");
for (const n of [
  "docx",
  "odt",
  "terug",
  "native",
  "pdf",
  "odt-pdf",
  "native-pdf",
])
  mkdirSync(join(UIT, n), { recursive: true });
const profiel = mkdtempSync(join(tmpdir(), "oos-s56-"));
const log = [];
function voer(programma, argumenten, env = {}) {
  const r = spawnSync(programma, argumenten, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  log.push({
    programma,
    argumenten,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  });
  writeFileSync(join(UIT, "commands.json"), JSON.stringify(log, null, 2));
  if (r.status !== 0)
    throw (
      r.error ??
      new Error((r.stderr || r.stdout || "Command failed").slice(-3000))
    );
}
function converteer(van, naar, filter) {
  const ext = van === "odt" ? ".odt" : ".docx";
  const files = readdirSync(join(UIT, van))
    .filter((f) => f.endsWith(ext))
    .map((f) => join(UIT, van, f));
  assert.equal(files.length, 9);
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
  const doel = "." + filter.split(":")[0];
  assert.equal(
    readdirSync(join(UIT, naar)).filter((f) => f.endsWith(doel)).length,
    9,
  );
  console.log(`${van} → ${naar}: nine files`);
}
let vite, kern;
try {
  if (!args.includes("--reuse-fixtures")) {
    voer(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--configLoader",
        "runner",
        "--maxWorkers",
        "2",
        "src/tekst/vormen/vormen-engine.test.ts",
        "src/tekst/vormen/effecten.test.ts",
      ],
      { OOS_VORMEN_UITVOER: join(UIT, "docx") },
    );
    converteer("docx", "odt", "odt");
    converteer("odt", "terug", "docx:Office Open XML Text");
  }
  vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true, watch: { ignored: ["**/.local/**"] } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  kern = await (
    await vite.ssrLoadModule("/scripts/tekstkern-proef.ts")
  ).openTekstkernProef();
  const { vormenLijst, optiesVanVorm, wijzigVormInSessie, vormUitOpties } =
    await vite.ssrLoadModule("/src/tekst/vormen/model.ts");
  const { vormBewerkbaar } = await vite.ssrLoadModule(
    "/src/tekst/vormen/groep.ts",
  );
  // ODF can convert a preset into an equivalent editable custom path. Empty
  // effect lists and omitted effects are also equivalent, without paint loss.
  const semantiek = (v) => ({
    geometry: v.geometryPath?.length ? v.geometryPath : v.shapeType,
    size: v.size,
    offset: v.offset,
    transform: v.transform,
    text: optiesVanVorm(v).tekst,
    fill: v.fill,
    outline: v.outline,
    fillPaint: v.fillPaint,
    strokePaint: v.strokePaint,
    effects: v.effects ?? [],
    children: v.children?.map(semantiek),
  });
  const resultaten = [];
  for (const naam of readdirSync(join(UIT, "docx"))
    .filter((f) => f.endsWith(".docx"))
    .sort()) {
    let bytes = readFileSync(join(UIT, "terug", naam));
    let verwacht;
    for (let ronde = 0; ronde < 3; ronde++) {
      const s = await kern.sdk.createYrsSession();
      try {
        s.openDocx(bytes, true);
        const lijst = vormenLijst(s);
        assert.equal(
          lijst.length,
          1,
          naam + ": expected one native shape/group",
        );
        const plek = lijst[0];
        assert.ok(
          vormBewerkbaar(plek.vorm),
          naam + ": converted shape is editable",
        );
        if (verwacht)
          assert.deepEqual(
            semantiek(plek.vorm),
            verwacht,
            naam + ": native save/reopen semantics",
          );
        if (ronde === 0) {
          let gewijzigd;
          if (plek.vorm.children?.length) {
            const child = plek.vorm.children.findIndex(
              (c) => optiesVanVorm(c).tekst,
            );
            assert.ok(child >= 0);
            gewijzigd = {
              ...plek.vorm,
              children: plek.vorm.children.map((c, j) =>
                j === child
                  ? vormUitOpties(
                      {
                        ...optiesVanVorm(c),
                        tekst: optiesVanVorm(c).tekst + " Edited.",
                      },
                      c,
                    )
                  : c,
              ),
            };
          } else
            gewijzigd = vormUitOpties(
              {
                ...optiesVanVorm(plek.vorm),
                tekst: "Shape edited after ODF conversion.",
              },
              plek.vorm,
            );
          wijzigVormInSessie(s, plek, gewijzigd);
          verwacht = semantiek(vormenLijst(s)[0].vorm);
        }
        if (ronde < 2) bytes = (await kern.sdk.saveYrsDocx(s)).bytes;
      } finally {
        s.destroy();
      }
    }
    writeFileSync(join(UIT, "native", naam), bytes);
    resultaten.push({
      naam,
      nativeEditAndTwoSaveReopenCycles: true,
      shape: verwacht,
    });
    console.log(naam + ": native edit and two save/reopen cycles pass");
  }
  writeFileSync(
    join(UIT, "resultaten.json"),
    JSON.stringify(resultaten, null, 2),
  );
  converteer("docx", "pdf", "pdf:writer_pdf_Export");
  converteer("odt", "odt-pdf", "pdf:writer_pdf_Export");
  converteer("native", "native-pdf", "pdf:writer_pdf_Export");
} finally {
  kern?.sluit();
  await vite?.close();
  const doel = resolve(profiel),
    basis = resolve(tmpdir()) + sep;
  if (
    !doel.startsWith(basis) ||
    !doel.slice(basis.length).startsWith("oos-s56-")
  )
    throw new Error("Unexpected temporary profile path");
  rmSync(doel, { recursive: true, force: true });
}
