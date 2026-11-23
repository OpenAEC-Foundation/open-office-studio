/** Read-only P2 capability checks; candidate qualification and ET import stay false. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

assert.equal(process.platform,'linux','Function-level runtime check restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-et/fixture-gate.json','utf8'));
const gate=JSON.parse(fs.readFileSync('.local/et-qa/source-gate-report.json','utf8'));
assert.equal(gate.sourceGatePassed,false);assert.equal(config.candidate.authenticETConfirmed,false);
const bytes=fs.readFileSync('.local/et-qa/unqualified-candidate.et');
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),config.candidate.sha256);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts']);
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceGatePassed:false,sourceImportAcceptance:false,fullFormatAcceptance:false,
  inputRole:'Unqualified published ET-named candidate, not an accepted authentic ET fixture',
  method:'Actual P2 production capability/open functions in Linux Node with an empty window; no Tauri bridge mock',
  checks:[],limits:['No hosted browser UI/native GUI/Tauri IPC test.','No converter, actual spreadsheet WASM, ET edit/UndoRedo/save/freshreopen executed.',
    'This verifies the negative no-desktop policy, not ET content compatibility.']};
const loader=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const original=globalThis.window;
try {
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  const formats=await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon}=await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  const catalog=JSON.parse(fs.readFileSync('src/formaten.json','utf8'));
  assert.ok(catalog.xlsx.invoer.includes('et'));assert.ok(!catalog.xlsx.uitvoer.et);
  assert.equal(formats.bestandssoort('et'),'xlsx');assert.equal(isSjabloon('test.et'),false);
  report.checks.push('P2 catalog recognizes ET as spreadsheet runtime input; ET export is not declared; ET is not a template.');
  globalThis.window={};report.capability=await formats.conversieStatus();assert.equal(report.capability.gevonden,false);
  let rejection;
  try {await bereidOpenen('test.et',bytes,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
  catch(e){rejection=e;}
  assert.ok(rejection&&/\bET\b/.test(rejection.message)&&/XLSX/.test(rejection.message),rejection?.message);
  report.error=rejection.message;
  const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm');
  assert.equal(sha(wasm),JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json','utf8')).wasmSha256);
  report.engineIdentityOnly={sha256:sha(wasm),bytes:wasm.length,initialized:false,executed:false};
  assert.equal(sha(fs.readFileSync('.local/et-qa/unqualified-candidate.et')),config.candidate.sha256);
  report.checks.push('Actual production no-desktop open policy rejects ET with a concrete XLSX alternative; candidate bytes unchanged.');
  report.policyChecksPassed=true;
} catch(e) {report.policyChecksPassed=false;report.errorDetail={name:e.name,message:e.message,stack:e.stack};throw e;}
finally {
  if(original===undefined)delete globalThis.window;else globalThis.window=original;
  await loader.close();
  fs.writeFileSync('.local/et-qa/browser-limit-report.json',JSON.stringify(report,null,2));
}
