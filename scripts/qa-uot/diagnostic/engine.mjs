/** Complete only missing editor stages; retain the strict import discrepancy. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {openProductieTekstkern} from "../../tekstkern-productieproef.mjs";

assert.equal(process.platform,"linux");
assert.ok(!process.env.OOS_NOOT_WASM && !process.env.OOS_NOOT_LAYOUT_WASM);
const cfg=JSON.parse(fs.readFileSync("scripts/qa-uot/fixture.json","utf8"));
const pin=JSON.parse(fs.readFileSync("scripts/qa-uot/diagnostic/input.json","utf8"));
const out=path.resolve(".local/uot-engine");
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),"utf8"));
const sha=b=>createHash("sha256").update(b).digest("hex");
assert.equal(execFileSync("git",["rev-parse",`${cfg.application.commit}^{tree}`],{encoding:"utf8"}).trim(),cfg.application.tree);
execFileSync("git",["diff","--exit-code",cfg.application.commit,"--","src","src-tauri","vendor","packages","assets","public","patches","package.json","pnpm-lock.yaml","versie.json","vite.config.ts","scripts/tekstkern-productieproef.mjs","scripts/tekstkern-proef.ts","scripts/tekstengine-compatibiliteit.ts"]);
const input=fs.readFileSync(path.join(out,"input/converted.docx"));
assert.equal(sha(input),pin.convertedSha256);
assert.equal(read("input-artifact-verification.json").status,"verified");
const source=read("input/source-oracle.json");
const converted=read("input/converted-observation.json");
const baseline=converted.paragraphs.map(p=>p.text);
assert.notDeepEqual(baseline,source.expected.texts,"Strict source mismatch must remain visible");
const report={application:cfg.application,harnessCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),input:pin,sourceImportAcceptance:false,overallFormatAcceptance:false,downstreamOnly:true,checks:[],limits:[cfg.source.coverageLimit,"Strict original CR/reference whitespace comparison failed before Word engine; normative UOF1 whitespace/line-break semantics remain unconfirmed","Converted DOCX is used only as the downstream baseline, never substituted for the independent source oracle","No native/Tauri IPC/UI/installer/standalone acceptance, Windows/macOS or hosted-browser UI test","No new Office execution or runtime download in this stage"]};
let production;
const sessions=[];
try {
  production=await openProductieTekstkern(path.join(out,"vite-cache"));
  const wp=JSON.parse(fs.readFileSync("patches/tekstengine-nootnummering.json","utf8"));
  assert.equal(production.route,"productiekern");
  assert.equal(production.kernen.edit.sha256,wp.wasmSha256);
  assert.equal(production.kernen.layout.sha256,wp.layoutWasmSha256);
  report.engine={route:production.route,kernels:production.kernen,productionJSBindings:production.aansluiting};
  const session=await production.sdk.createYrsSession();sessions.push(session);
  session.openDocx(input,true);
  const texts=s=>s.paragraphs("body").map(p=>p.text.replace(/\r\n?/g,"\n"));
  fs.writeFileSync(path.join(out,"engine-import.json"),JSON.stringify({stories:session.storyIds(),paragraphs:session.paragraphs("body")},null,2));
  assert.deepEqual(texts(session),baseline,"Engine opening differs from independent converted-DOCX observation");
  report.checks.push("Real production-patched Word engine opens the exact verified converter DOCX without further text change; strict UOT source mismatch remains separate.");
  session.beginUndoCapture();session.setUndoCaptureMode("manual");session.addUndoBoundary();
  const e=cfg.edit, paragraph=session.paragraphs("body")[e.paragraph];
  session.insertText({story:"body",paraId:paragraph.paraId,offset:e.offset},e.text);session.addUndoBoundary();
  const edited=baseline.map((p,i)=>i===e.paragraph?e.text+p:p);
  assert.deepEqual(texts(session),edited);
  assert.equal(session.undo(),true);assert.deepEqual(texts(session),baseline);
  assert.equal(session.redo(),true);assert.deepEqual(texts(session),edited);
  report.checks.push("Text insertion, Undo and Redo retain every downstream baseline character, including its trailing space.");
  const independent=file=>execFileSync("python3",["scripts/qa-uot/diagnostic/compare.py",path.join(out,file)],{stdio:"inherit"});
  fs.writeFileSync(path.join(out,"saved.docx"),(await production.sdk.saveYrsDocx(session)).bytes);
  independent("saved.docx");
  const fresh=await production.sdk.createYrsSession();sessions.push(fresh);
  fresh.openDocx(fs.readFileSync(path.join(out,"saved.docx")),true);
  assert.deepEqual(texts(fresh),edited);
  fs.writeFileSync(path.join(out,"reopened-saved.docx"),(await production.sdk.saveYrsDocx(fresh)).bytes);
  independent("reopened-saved.docx");
  assert.equal(sha(fs.readFileSync(path.join(out,"input/source.uot"))),cfg.source.sha256);
  assert.equal(sha(fs.readFileSync(path.join(out,"input/converted.docx"))),pin.convertedSha256);
  report.checks.push("DOCX save/fresh engine reopen/second save and independent OOXML checks preserve downstream edited text, one ordinary paragraph, zero tables and source single line spacing; original UOT and converter DOCX unchanged.");
  report.sourceComparison={sourceDecodedText:source.paragraphs[0].decodedXmlText,sourceLogicalText:source.expected.texts[0],convertedText:baseline[0],sourceCharacters:source.paragraphs[0].decodedXmlText.length,convertedCharacters:baseline[0].length,sourceCRPositions:[...source.paragraphs[0].decodedXmlText].flatMap((c,i)=>c==="\r"?[i]:[]),observation:"Converted text matches source whitespace runs collapsed to spaces; this is recorded as an observation, not used to pass source import"};
  report.downstreamPassed=true;
} catch(error) {
  report.downstreamPassed=false;report.error={message:error.message,stack:error.stack};throw error;
} finally {
  for(const s of sessions)s.destroy();if(production)await production.sluit();
  fs.writeFileSync(path.join(out,"diagnostic-engine-report.json"),JSON.stringify(report,null,2));
}
