/** Linux CI: production opening policy, private converter adapter and real pinned WASM. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createServer} from "vite";
import {initWasm, openWorkbook} from "@betteroffice/xlsx";

assert.equal(process.platform, "linux", "Runtime checks run only in Linux CI");
const config = JSON.parse(fs.readFileSync("scripts/qa-uos/fixture.json", "utf8"));
const out = path.resolve(process.env.OOS_UOS_OUTPUT ?? ".local/uos-qa");
const sourcePath = path.join(out, "source.uos"), source = fs.readFileSync(sourcePath);
const sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(sha(source), config.source.sha256);
assert.equal(execFileSync("git", ["rev-parse", `${config.application.commit}^{tree}`], {encoding:"utf8"}).trim(), config.application.tree);
execFileSync("git", ["diff", "--exit-code", config.application.commit, "--", "src", "src-tauri", "vendor", "packages", "assets", "public", "package.json", "pnpm-lock.yaml", "versie.json", "vite.config.ts"]);
const oracle = JSON.parse(fs.readFileSync(path.join(out, "source-oracle.json"), "utf8"));
const report = {application:config.application, harnessCommit:execFileSync("git", ["rev-parse","HEAD"], {encoding:"utf8"}).trim(), source:config.source, checks:[], limits:[config.source.coverageLimit, "Private CLI adapter, production helper and WASM; no packaged native UI or Tauri IPC acceptance", "Browser negative capability/helper check in Node, not a real hosted browser UI test", "No Windows or macOS runtime tested by this probe", "No UOS export, visual fidelity, chart or macro acceptance claim"]};
const loader = await createServer({configFile:false, appType:"custom", server:{middlewareMode:true, hmr:false, watch:null}, optimizeDeps:{noDiscovery:true,include:[]}});
const handles = [];
const coordinate = a => {const m=/^([A-Z]+)(\d+)$/.exec(a);return {row:Number(m[2])-1,col:[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1};};
try {
  const {bereidOpenen} = await loader.ssrLoadModule("/src/import/openen.ts");
  const formats = await loader.ssrLoadModule("/src/formaten.ts");
  const {isSjabloon} = await loader.ssrLoadModule("/src/import/sjabloon.ts");
  const i18n = (await loader.ssrLoadModule("/src/i18n/config.ts")).default;
  await i18n.changeLanguage("en");
  assert.equal(isSjabloon(config.source.filename), false);
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {};
    const status = await formats.conversieStatus();
    assert.equal(status.gevonden, false);
    let rejection;
    try {await bereidOpenen(config.source.filename, source, {converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
    catch(error) {rejection=error;}
    assert.ok(rejection && /UOS/.test(rejection.message) && /XLSX/i.test(rejection.message), rejection?.message);
    report.browserLimit = {method:"Production functions in Linux Node with an empty window; no Tauri bridge mock", status, error:rejection.message};
    report.checks.push("No-desktop UOS conversion produces a concrete limitation and XLSX alternative.");
  } finally {
    if(originalWindow===undefined) delete globalThis.window;
    else globalThis.window=originalWindow;
  }
  if (!process.argv.includes("--route-only")) {
    assert.ok(process.env.OOS_UOS_RUNTIME_BINDING);
    let count=0;
    const opened=await bereidOpenen(config.source.filename,source,{
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes), config.source.sha256);
        assert.deepEqual([from,to,kind],["uos","xlsx","xlsx"]);count++;
        const result=JSON.parse(execFileSync("python3",["scripts/qa-uos/convert.py","--binding",process.env.OOS_UOS_RUNTIME_BINDING,"--source",sourcePath,"--out",out],{encoding:"utf8",timeout:60_000}));
        return fs.readFileSync(result.output);
      }
    });
    assert.equal(count,1);assert.ok(opened);
    assert.equal(opened.soort,"xlsx");assert.equal(opened.naam,"ffc_1.xlsx");
    assert.equal(opened.gewijzigd,true);assert.ok(!opened.alsNieuw);
    assert.equal(opened.exportFormaat ?? opened.soort,"xlsx");
    fs.writeFileSync(path.join(out,"open-result.json"),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    execFileSync("python3",["scripts/qa-uos/oracle.py","xlsx","--out",out,"--xlsx",path.join(out,"converted.xlsx")],{stdio:"inherit"});
    report.checks.push("Verified private converter preserves all 156 source values and three sheet names/order under the production XLSX opening policy.");
    const wasm=fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm");
    const pin=JSON.parse(fs.readFileSync("patches/rekenbladengine-lange-ketens.json","utf8"));
    assert.equal(sha(wasm),pin.wasmSha256);report.engineWasmSha256=sha(wasm);
    await initWasm(wasm);
    const book=openWorkbook(opened.bytes);handles.push(book);
    const verifySource=(h,edited)=>{
      const info=h.sheetInfo();assert.deepEqual(info.sheetNames,oracle.sheets.map(s=>s.name));
      let checked=0;
      for(const [sheetIndex,sheet] of oracle.sheets.entries()) {
        if(!Object.keys(sheet.cells).length) continue;
        const r=h.readCells({ranges:[{sheetId:info.sheetIds[sheetIndex],range:{kind:"a1",a1:"A1:D39"}}]});assert.ok(r.ok);
        for(const [a,c] of Object.entries(sheet.cells)){
          const {row,col}=coordinate(a), got=r.ranges[0].cells[row][col].value;
          const value=edited && a===config.edit.cell && sheet.name===config.edit.sheet ? config.edit.value : c.value;
          assert.deepEqual(got,c.kind==="number"?{kind:"number",value:Number(value)}:{kind:"text",value},`Source content ${sheet.name}!${a}`);checked++;
        }
      }
      assert.equal(checked,156);return checked;
    };
    verifySource(book,false);
    const cfg=oracle.expected.edit, sheet=book.sheetInfo().sheetNames.indexOf(cfg.sheet), textSheet=book.sheetInfo().sheetNames.indexOf(cfg.textSheet);
    const read=(h,s,a)=>{const r=h.readCells({ranges:[{sheetId:h.sheetInfo().sheetIds[s],range:{kind:"a1",a1:a}}]});assert.ok(r.ok);return r.ranges[0].cells[0][0].value;};
    book.editCells(sheet,[{...coordinate(cfg.formulaCell),input:cfg.formula}]);
    assert.deepEqual(read(book,sheet,cfg.formulaCell),{kind:"number",value:Number(oracle.expected.before)});
    book.editCells(sheet,[{...coordinate(cfg.cell),input:String(cfg.value)}]);
    assert.equal(book.cell(sheet,coordinate(cfg.cell).row,coordinate(cfg.cell).col).input,String(cfg.value));
    assert.deepEqual(read(book,sheet,cfg.formulaCell),{kind:"number",value:Number(oracle.expected.after)});
    book.undo();assert.deepEqual(read(book,sheet,cfg.formulaCell),{kind:"number",value:Number(oracle.expected.before)});
    book.redo();assert.deepEqual(read(book,sheet,cfg.formulaCell),{kind:"number",value:Number(oracle.expected.after)});
    book.editCells(textSheet,[{...coordinate(cfg.textCell),input:cfg.textValue}]);
    assert.deepEqual(read(book,textSheet,cfg.textCell),{kind:"text",value:cfg.textValue});
    verifySource(book,true);
    report.editedValues={before:Number(oracle.expected.before),after:read(book,sheet,cfg.formulaCell),text:read(book,textSheet,cfg.textCell)};
    report.checks.push("Real WASM preserves source values; added SUM recalculates 2 to 9 after A2 edit, Undo to 2, Redo to 9; text edit on Sheet2 is committed.");
    const saved=book.save();fs.writeFileSync(path.join(out,"saved.xlsx"),saved);
    const reopened=openWorkbook(saved);handles.push(reopened);
    verifySource(reopened,true);
    assert.deepEqual(read(reopened,sheet,cfg.formulaCell),{kind:"number",value:Number(oracle.expected.after)});
    assert.deepEqual(read(reopened,textSheet,cfg.textCell),{kind:"text",value:cfg.textValue});
    execFileSync("python3",["scripts/qa-uos/oracle.py","xlsx","--out",out,"--xlsx",path.join(out,"saved.xlsx"),"--edited"],{stdio:"inherit"});
    assert.equal(sha(fs.readFileSync(sourcePath)),config.source.sha256);
    report.checks.push("Recommended modern XLSX save/fresh engine reopen and independent XML verification pass for all 158 populated cells, including formula/cache; source UOS stays unchanged.");
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const h of handles) h.dispose();await loader.close();
  fs.writeFileSync(path.join(out,process.argv.includes("--route-only")?"route-report.json":"engine-report.json"),JSON.stringify(report,null,2));
}
