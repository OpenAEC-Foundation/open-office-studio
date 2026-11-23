/** Linux CI: real pinned presentation SDK, source acceptance kept separate from edit checks. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createServer} from "vite";
import {initWasm, openPresentation} from "@betteroffice/pptx";

assert.equal(process.platform,"linux","Runtime checks run only in Linux CI");
const config=JSON.parse(fs.readFileSync("scripts/qa-uop/fixture.json","utf8"));
const out=path.resolve(process.env.OOS_UOP_OUTPUT ?? ".local/uop-qa");
const sourcePath=path.join(out,"source.uop"), source=fs.readFileSync(sourcePath);
const sha=b=>createHash("sha256").update(b).digest("hex");
assert.equal(sha(source),config.source.sha256);
assert.equal(execFileSync("git",["rev-parse",`${config.application.commit}^{tree}`],{encoding:"utf8"}).trim(),config.application.tree);
execFileSync("git",["diff","--exit-code",config.application.commit,"--","src","src-tauri","vendor","packages","assets","public","patches","package.json","pnpm-lock.yaml","versie.json","vite.config.ts","scripts/presentatieengine-compatibiliteit.ts"]);
const oracle=JSON.parse(fs.readFileSync(path.join(out,"source-oracle.json"),"utf8"));
const report={application:config.application,harnessCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),source:config.source,checks:[],limits:[config.coverageLimit,"Private CLI adapter/production open helper/core SDK, not Tauri IPC, installer, standalone or native GUI acceptance","Browser boundary is a negative production function check in Node, not hosted browser UI","No Windows/macOS runtime, rendering or pptx-react snapshot hook acceptance"]};
const loader=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const handles=[];
const textOf=shape=>(shape.textStories??[]).flatMap(s=>s.paragraphs).map(p=>p.runs.map(r=>r.text).join(""));
try {
  const {bereidOpenen}=await loader.ssrLoadModule("/src/import/openen.ts");
  const formats=await loader.ssrLoadModule("/src/formaten.ts");
  const {isSjabloon}=await loader.ssrLoadModule("/src/import/sjabloon.ts");
  const i18n=(await loader.ssrLoadModule("/src/i18n/config.ts")).default;
  await i18n.changeLanguage("en");assert.equal(isSjabloon(config.source.filename),false);
  const priorWindow=globalThis.window;
  try {
    globalThis.window={};
    const status=await formats.conversieStatus();assert.equal(status.gevonden,false);
    let rejection;
    try {await bereidOpenen(config.source.filename,source,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
    catch(e){rejection=e;}
    assert.ok(rejection && /UOP/.test(rejection.message) && /PPTX/i.test(rejection.message),rejection?.message);
    report.browserLimit={method:"Real production functions in Linux Node with empty window, no Tauri mock",status,error:rejection.message};
    report.checks.push("UOP without desktop conversion bridge rejects with a concrete limitation and PPTX alternative.");
  } finally {if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;}
  if(!process.argv.includes("--route-only")) {
    report.engineFunctionalPassed=false;
    assert.ok(process.env.OOS_UOP_RUNTIME_BINDING);
    let count=0;
    const opened=await bereidOpenen(config.source.filename,source,{
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes),config.source.sha256);assert.deepEqual([from,to,kind],["uop","pptx","pptx"]);count++;
        const r=JSON.parse(execFileSync("python3",["scripts/qa-uop/convert.py","--binding",process.env.OOS_UOP_RUNTIME_BINDING,"--source",sourcePath,"--out",out],{encoding:"utf8",timeout:60_000}));
        return fs.readFileSync(r.output);
      }
    });
    assert.equal(count,1);assert.ok(opened);
    assert.equal(opened.soort,"pptx");assert.equal(opened.naam,"sample-presentation.pptx");
    assert.equal(opened.gewijzigd,true);assert.ok(!opened.alsNieuw);assert.equal(opened.exportFormaat??opened.soort,"pptx");
    assert.ok(!opened.rapport?.regels.some(r=>r.id==="empty-conversion"));
    fs.writeFileSync(path.join(out,"open-result.json"),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    const independent=(file,edited=false)=>{
      execFileSync("python3",["scripts/qa-uop/oracle.py","pptx","--out",out,"--pptx",path.join(out,file),"--record-only",...(edited?["--edited"]:[])],{stdio:"inherit"});
      return JSON.parse(fs.readFileSync(path.join(out,file.replace(/\.pptx$/,"-independent.json")),"utf8"));
    };
    const imported=independent("converted.pptx");
    report.sourceImportPassed=imported.passed;
    report.importFailures=imported.failures;
    const wasmPath="node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm";
    const wasm=fs.readFileSync(wasmPath);
    const pin=config.engine.entries.find(p=>p.path.endsWith("pptx_wasm_bg.wasm"));
    assert.equal(sha(wasm),pin.sha256);assert.equal(wasm.length,pin.bytes);
    assert.ok(fs.readFileSync("pnpm-lock.yaml","utf8").includes(config.engine.integrity));
    assert.equal(JSON.parse(fs.readFileSync("node_modules/@betteroffice/pptx/package.json","utf8")).version,config.engine.version);
    report.engine={package:config.engine.package,version:config.engine.version,integrity:config.engine.integrity,wasmSha256:sha(wasm),wasmBytes:wasm.length};
    await initWasm(wasm);
    const deck=openPresentation(opened.bytes);handles.push(deck);
    fs.writeFileSync(path.join(out,"engine-import-snapshot.json"),JSON.stringify(deck.snapshot(),null,2));
    const first=deck.snapshot();assert.equal(first.slides.length,oracle.slides.length);
    report.engineSourceChecks=[];
    for(const [i,slide] of first.slides.entries()) {
      const own=slide.shapes.filter(s=>!s.inherited);
      const texts=own.map(s=>{const p=textOf(s);return p.some(Boolean)?p:[];});
      const expected=oracle.slides[i].shapes.map(s=>s.texts);
      report.engineSourceChecks.push({slide:i,check:"own-shape text/paragraphs",passed:JSON.stringify(texts)===JSON.stringify(expected),expected,actual:texts});
    }
    const title=oracle.slides[config.edit.slide].shapes[config.edit.shape].texts[0];
    const selected=first.slides[config.edit.slide].shapes.filter(s=>textOf(s).join("\n")===title).flatMap(s=>s.textStories);
    assert.equal(selected.length,1,"Source title must identify one real editable story");
    const storyId=selected[0].id;
    const contents=h=>h.readContent().stories.map(s=>({text:s.text}));
    const baseline=contents(deck);
    deck.insertText(storyId,0,config.edit.text);
    const edited=contents(deck);
    assert.ok(edited.some(s=>s.text===config.edit.text+title),"Title edit was not committed");
    assert.equal(deck.undo().applied,true);assert.deepEqual(contents(deck),baseline);
    assert.equal(deck.redo().applied,true);assert.deepEqual(contents(deck),edited);
    report.checks.push("Actual pinned presentation engine commits source-title text edit; Undo restores all baseline stories and Redo restores the complete edited stories.");
    fs.writeFileSync(path.join(out,"saved.pptx"),deck.save());
    const savedCheck=independent("saved.pptx",true);
    const fresh=openPresentation(fs.readFileSync(path.join(out,"saved.pptx")));handles.push(fresh);
    assert.deepEqual(contents(fresh),edited,"Fresh reopened engine content differs");
    fs.writeFileSync(path.join(out,"reopened-saved.pptx"),fresh.save());
    const reopenedCheck=independent("reopened-saved.pptx",true);
    assert.equal(sha(fs.readFileSync(sourcePath)),config.source.sha256);
    report.engineFunctionalPassed=true;
    report.savedSourceAcceptancePassed=savedCheck.passed;
    report.reopenedSourceAcceptancePassed=reopenedCheck.passed;
    report.savedFailures=savedCheck.failures;report.reopenedFailures=reopenedCheck.failures;
    report.checks.push("PPTX save/fresh engine reopen/second save preserve edited engine stories; independent source-derived structure/style/geometry/notes observations retained separately; original UOP unchanged.");
    report.passed=imported.passed && report.engineSourceChecks.every(c=>c.passed) && savedCheck.passed && reopenedCheck.passed;
    assert.ok(report.passed,"Strict source acceptance failed; retain independent failures and any successful engine diagnostics without promoting the format");
  } else report.passed=true;
} catch(error) {
  report.passed=false;report.error={message:error.message,stack:error.stack};throw error;
} finally {
  for(const h of handles)h.dispose();await loader.close();
  fs.writeFileSync(path.join(out,process.argv.includes("--route-only")?"route-report.json":"engine-report.json"),JSON.stringify(report,null,2));
}
