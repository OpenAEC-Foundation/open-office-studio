/** Linux CI only: P2 production opening policy and its real patched Word engine. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createServer} from "vite";
import {openProductieTekstkern} from "../tekstkern-productieproef.mjs";

assert.equal(process.platform,"linux","Runtime execution is restricted to Linux CI");
assert.ok(!process.env.OOS_NOOT_WASM && !process.env.OOS_NOOT_LAYOUT_WASM,"No alternate Word kernel permitted");
const cfg=JSON.parse(fs.readFileSync("scripts/qa-sdw31/fixture.json","utf8"));
const out=path.resolve(process.env.OOS_SDW31_OUTPUT ?? ".local/sdw31-qa");
const sourcePath=path.join(out,"source.sdw"), source=fs.readFileSync(sourcePath);
const sha=b=>createHash("sha256").update(b).digest("hex");
assert.equal(sha(source),cfg.source.sha256);
assert.equal(execFileSync("git",["rev-parse",`${cfg.application.commit}^{tree}`],{encoding:"utf8"}).trim(),cfg.application.tree);
execFileSync("git",["diff","--exit-code",cfg.application.commit,"--","src","src-tauri","vendor","packages","assets","public","patches","package.json","pnpm-lock.yaml","versie.json","vite.config.ts","scripts/tekstkern-productieproef.mjs","scripts/tekstkern-proef.ts","scripts/tekstengine-compatibiliteit.ts"]);
const oracle=JSON.parse(fs.readFileSync(path.join(out,"source-oracle.json"),"utf8"));
const report={fullFormatAcceptance:false,application:cfg.application,harnessCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),source:cfg.source,checks:[],limits:[cfg.source.coverageLimit,"Private converter adapter + production opening helper/Word engine, not native GUI/Tauri IPC or installer acceptance","Browser boundary is a negative production-function check in Node, not hosted UI","No Windows/macOS runtime, font rendering or visual fidelity acceptance"]};
const loader=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
let production;
const sessions=[];
try {
  const {bereidOpenen}=await loader.ssrLoadModule("/src/import/openen.ts");
  const formats=await loader.ssrLoadModule("/src/formaten.ts");
  const {isSjabloon}=await loader.ssrLoadModule("/src/import/sjabloon.ts");
  const i18n=(await loader.ssrLoadModule("/src/i18n/config.ts")).default;
  await i18n.changeLanguage("en");
  assert.equal(isSjabloon(cfg.source.filename),false);
  const oldWindow=globalThis.window;
  try {
    globalThis.window={};
    const status=await formats.conversieStatus();assert.equal(status.gevonden,false);
    let rejection;
    try {await bereidOpenen(cfg.source.filename,source,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
    catch(e) {rejection=e;}
    assert.ok(rejection && /SDW/.test(rejection.message) && /DOCX/i.test(rejection.message),rejection?.message);
    report.browserLimit={method:"Real production functions in Linux Node with empty window, no Tauri bridge mock",status,error:rejection.message};
    report.checks.push("No-desktop SDW opening rejects with a concrete conversion limitation and DOCX alternative.");
  } finally {
    if(oldWindow===undefined) delete globalThis.window;else globalThis.window=oldWindow;
  }
  if(!process.argv.includes("--route-only")) {
    assert.ok(process.env.OOS_SDW31_RUNTIME_BINDING);
    let conversions=0;
    const opened=await bereidOpenen(cfg.source.filename,source,{
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes),cfg.source.sha256);assert.deepEqual([from,to,kind],["sdw","docx","docx"]);conversions++;
        const r=JSON.parse(execFileSync("python3",["scripts/qa-sdw31/convert.py","--binding",process.env.OOS_SDW31_RUNTIME_BINDING,"--source",sourcePath,"--out",out],{encoding:"utf8",timeout:60_000}));
        return fs.readFileSync(r.output);
      }
    });
    assert.equal(conversions,1);assert.ok(opened);
    assert.equal(opened.soort,"docx");assert.equal(opened.naam,"Writer_3.1.docx");
    assert.equal(opened.gewijzigd,true);assert.ok(!opened.alsNieuw);
    assert.equal(opened.exportFormaat ?? opened.soort,"docx");
    assert.ok(!opened.rapport?.regels.some(r=>r.id==="empty-conversion"));
    fs.writeFileSync(path.join(out,"open-result.json"),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    const independent=(file,edited=false)=>execFileSync("python3",["scripts/qa-sdw31/oracle.py","docx","--out",out,"--docx",path.join(out,file),...(edited?["--edited"]:[])],{stdio:"inherit"});
    independent("converted.docx");
    report.checks.push("Real private converter/production open policy preserve all original paragraph text/empty paragraphs, zero tables and eleven explicit native list levels.");
    production=await openProductieTekstkern(path.join(out,"vite-cache"));
    assert.equal(production.route,"productiekern");
    const pins=JSON.parse(fs.readFileSync("patches/tekstengine-nootnummering.json","utf8"));
    assert.equal(production.kernen.edit.sha256,pins.wasmSha256);
    assert.equal(production.kernen.layout.sha256,pins.layoutWasmSha256);
    report.engine={route:production.route,kernels:production.kernen,productionJSBindings:production.aansluiting};
    const s=await production.sdk.createYrsSession();sessions.push(s);s.openDocx(opened.bytes,true);
    const texts=h=>h.paragraphs("body").map(p=>p.text.replace(/\r\n?/g,"\n"));
    fs.writeFileSync(path.join(out,"engine-import.json"),JSON.stringify({stories:s.storyIds(),paragraphs:s.paragraphs("body")},null,2));
    assert.deepEqual(texts(s),oracle.expected.texts,"Initial Word engine text differs from independent source oracle");
    s.beginUndoCapture();s.setUndoCaptureMode("manual");s.addUndoBoundary();
    const edit=oracle.expected.edit, para=s.paragraphs("body")[edit.paragraph];
    s.insertText({story:"body",paraId:para.paraId,offset:edit.offset},edit.text);s.addUndoBoundary();
    assert.deepEqual(texts(s),oracle.expected.editedTexts,"Edit was not committed");
    assert.equal(s.undo(),true);assert.deepEqual(texts(s),oracle.expected.texts);
    assert.equal(s.redo(),true);assert.deepEqual(texts(s),oracle.expected.editedTexts);
    report.editedParagraphs=texts(s);
    report.checks.push("Actual production-patched Word engine opens source-derived text, inserts a test prefix and restores exact text through Undo/Redo.");
    const saved=(await production.sdk.saveYrsDocx(s)).bytes;
    fs.writeFileSync(path.join(out,"saved.docx"),saved);
    independent("saved.docx",true);
    const again=await production.sdk.createYrsSession();sessions.push(again);
    again.openDocx(fs.readFileSync(path.join(out,"saved.docx")),true);
    assert.deepEqual(texts(again),oracle.expected.editedTexts);
    const resaved=(await production.sdk.saveYrsDocx(again)).bytes;
    fs.writeFileSync(path.join(out,"reopened-saved.docx"),resaved);
    independent("reopened-saved.docx",true);
    assert.equal(sha(fs.readFileSync(sourcePath)),cfg.source.sha256);
    report.checks.push("Modern DOCX save, fresh engine reopen, second save and independent XML verification preserve exact edited paragraph sequence/empty paragraphs and eleven explicit native list levels; original SDW bytes unchanged.");
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const s of sessions)s.destroy();
  if(production)await production.sluit();await loader.close();
  fs.writeFileSync(path.join(out,process.argv.includes("--route-only")?"route-report.json":"engine-report.json"),JSON.stringify(report,null,2));
}
