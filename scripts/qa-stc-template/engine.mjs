/** Linux-CI-only production open helper and real pinned XLSX engine. No app build/GUI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";

assert.equal(process.platform, "linux", "Runtime checks run only in Linux CI");
const config = JSON.parse(fs.readFileSync("scripts/qa-stc-template/fixture.json", "utf8"));
const out = path.resolve(process.env.OOS_STC_OUTPUT ?? ".local/stc-qa");
const sourcePath = path.join(out, "source.stc");
const source = fs.readFileSync(sourcePath);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(source), config.source.sha256);
assert.equal(execFileSync("git", ["rev-parse", `${config.application.commit}^{tree}`], {encoding:"utf8"}).trim(), config.application.tree);
execFileSync("git", ["diff", "--exit-code", config.application.commit, "--", "src", "src-tauri", "vendor", "packages", "assets", "public", "package.json", "pnpm-lock.yaml", "versie.json", "vite.config.ts"]);
const oracle = JSON.parse(fs.readFileSync(path.join(out, "source-oracle.json"), "utf8"));
const report = { application:config.application, harnessCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(), source:config.source, checks:[], limits:["CLI adapter and production helper/engine; no packaged native UI or Tauri IPC claim", "Negative browser capability/helper check, not a hosted browser UI test", "No Windows or macOS runtime tested by this probe"] };
const loader = await createServer({configFile:false,appType:"custom",server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const handles = [];
try {
  const { bereidOpenen } = await loader.ssrLoadModule("/src/import/openen.ts");
  const formats = await loader.ssrLoadModule("/src/formaten.ts");
  const { isSjabloon } = await loader.ssrLoadModule("/src/import/sjabloon.ts");
  const i18n = (await loader.ssrLoadModule("/src/i18n/config.ts")).default;
  await i18n.changeLanguage("en");
  assert.ok(isSjabloon(config.source.filename));
  const originalWindow = globalThis.window;
  try {
    // Test the real no-desktop guard. No Tauri bridge is supplied or mocked.
    globalThis.window = {};
    const status = await formats.conversieStatus();
    assert.equal(status.gevonden, false);
    let rejection;
    try {
      await bereidOpenen(config.source.filename, source, {converteer:formats.converteer,runtimeBeschikbaar:async()=>false});
    } catch (error) { rejection = error; }
    assert.ok(rejection && /STC/.test(rejection.message) && /XLSX/i.test(rejection.message), rejection?.message);
    report.browserLimit = {method:"production functions in Linux Node with an empty window object",status,error:rejection.message};
    report.checks.push("STC is a template; browser without a native bridge reports a concrete conversion limitation and XLSX alternative.");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
  if (!process.argv.includes("--route-only")) {
    assert.ok(process.env.OOS_STC_RUNTIME_BINDING, "Approved runtime binding is required");
    let conversionCount = 0;
    const opened = await bereidOpenen(config.source.filename, source, {
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes),config.source.sha256);
        assert.deepEqual([from,to,kind],["stc","xlsx","xlsx"]);
        conversionCount++;
        const value=JSON.parse(execFileSync("python3",["scripts/qa-stc-template/convert.py","--binding",process.env.OOS_STC_RUNTIME_BINDING,"--source",sourcePath,"--out",out],{encoding:"utf8",timeout:60_000}));
        return fs.readFileSync(value.output);
      },
    });
    assert.equal(conversionCount,1);
    assert.ok(opened?.alsNieuw && opened.gewijzigd);
    assert.equal(opened.soort,"xlsx");assert.equal(opened.exportFormaat,"xlsx");
    assert.ok(opened.naam.endsWith(".xlsx"));
    fs.writeFileSync(path.join(out,"open-result.json"),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    execFileSync("python3",["scripts/qa-stc-template/oracle.py","xlsx","--out",out,"--xlsx",path.join(out,"converted.xlsx")],{stdio:"inherit"});
    report.checks.push("Real private conversion passes the independent six-sheet/854-formula structure check; production helper opens as a new XLSX document.");
    const kernel=fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm");
    const pin=JSON.parse(fs.readFileSync("patches/rekenbladengine-lange-ketens.json","utf8"));
    assert.equal(sha(kernel),pin.wasmSha256);
    report.engineWasmSha256=sha(kernel);await initWasm(kernel);
    const book=openWorkbook(opened.bytes);handles.push(book);
    assert.deepEqual(book.sheetInfo().sheetNames,oracle.sheets.map(s=>s.name));
    const cfg=oracle.expected.edit, sheet=book.sheetInfo().sheetNames.indexOf(cfg.sheet),nameSheet=book.sheetInfo().sheetNames.indexOf(cfg.nameSheet);
    const coordinate=a=>{const m=/^([A-Z]+)(\d+)$/.exec(a);return {row:Number(m[2])-1,col:[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1};};
    book.editCells(sheet,Object.entries({...cfg.coefficients,...cfg.grades}).map(([a,v])=>({...coordinate(a),input:String(v)})));
    book.editCells(nameSheet,[{...coordinate(cfg.nameCell),input:cfg.nameValue}]);
    for(const [a,v] of Object.entries({...cfg.coefficients,...cfg.grades})){
      const {row,col}=coordinate(a);assert.equal(book.cell(sheet,row,col).input,String(v),`Input ${a} was not committed`);
    }
    const nameCoordinate=coordinate(cfg.nameCell);
    assert.equal(book.cell(nameSheet,nameCoordinate.row,nameCoordinate.col).input,cfg.nameValue,"Name edit was not committed");
    const snapshot=h=>{
      const info=h.sheetInfo();
      const value=h.readCells({ranges:[{sheetId:info.sheetIds[sheet],range:{kind:"a1",a1:"H5:I5"}},{sheetId:info.sheetIds[sheet],range:{kind:"a1",a1:"A5"}}]});
      assert.ok(value.ok);return value.ranges.flatMap(r=>r.cells.flat().map(c=>c.value));
    };
    const after=snapshot(book);report.editedValues=after;
    fs.writeFileSync(path.join(out,"edited.xlsx"),book.save());
    assert.equal(after[0].kind,"number");assert.ok(Math.abs(after[0].value-oracle.expected.weighted.value)<1e-10);
    assert.deepEqual(after[1],{kind:"number",value:oracle.expected.rounded.value});
    assert.deepEqual(after[2],{kind:"text",value:cfg.nameValue});
    book.undo();
    const sourceName=oracle.sheets[nameSheet].cells[cfg.nameCell].text;
    assert.deepEqual(snapshot(book)[2],{kind:"text",value:sourceName});
    book.redo();assert.deepEqual(snapshot(book),after);
    report.checks.push("Actual engine edits calculate source-derived weighted mean/quarter rounding and named-range text; Undo/Redo restores the text edit.");
    fs.writeFileSync(path.join(out,"saved.xlsx"),book.save());
    const reopened=openWorkbook(fs.readFileSync(path.join(out,"saved.xlsx")));handles.push(reopened);
    assert.deepEqual(snapshot(reopened),after);
    execFileSync("python3",["scripts/qa-stc-template/oracle.py","xlsx","--out",out,"--xlsx",path.join(out,"saved.xlsx"),"--edited"],{stdio:"inherit"});
    assert.equal(sha(fs.readFileSync(sourcePath)),config.source.sha256);
    report.checks.push("Modern engine XLSX save/reopen retains all source formula cells and expected edits; original STC bytes remain unchanged.");
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const h of handles)h.dispose();await loader.close();
  fs.writeFileSync(path.join(out,process.argv.includes("--route-only")?"route-report.json":"engine-report.json"),JSON.stringify(report,null,2));
}
