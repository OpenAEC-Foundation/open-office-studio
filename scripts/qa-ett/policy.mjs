/** Actual production predicate, not an authentic ETT conversion/engine/GUI test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

assert.equal(process.platform,'linux','Production function execution restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-ett/source-search.json','utf8'));
const source=JSON.parse(fs.readFileSync('.local/ett-qa/source-search-report.json','utf8'));
assert.equal(source.sourceGatePassed,false);assert.equal(source.inventoryDiagnosticsPassed,true);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts']);
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceGatePassed:false,sourceImportAcceptance:false,fullFormatAcceptance:false,
  method:'Actual P2 functions in Linux Node. No conversion callback output fabricated; no real ETT content/engine/GUI test.',
  checks:[],limits:config.limits};
const loader=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const original=globalThis.window;
try {
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  const formats=await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon}=await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  const catalog=JSON.parse(fs.readFileSync('src/formaten.json','utf8'));
  assert.ok(catalog.xlsx.invoer.includes('ett'));assert.equal(formats.bestandssoort('ett'),'xlsx');
  assert.ok(!catalog.xlsx.uitvoer.ett);
  report.classification={expectedTemplate:true,publisher:config.templateMeaning,
    lowercase:isSjabloon('policy-only.ett'),uppercase:isSjabloon('policy-only.ETT'),
    existingPredicateControls:{stc:isSjabloon('policy-control.stc'),xlt:isSjabloon('policy-control.xlt'),ots:isSjabloon('policy-control.ots')},
    controlsRole:'Filename predicate controls only, no other format file/conversion scope'};
  assert.deepEqual(report.classification.existingPredicateControls,{stc:true,xlt:true,ots:true});
  report.templateClassificationAcceptance=report.classification.lowercase&&report.classification.uppercase;
  report.checks.push('Production catalog recognizes ETT spreadsheet input; actual filename template predicate and existing controls recorded.');
  globalThis.window={};report.capability=await formats.conversieStatus();assert.equal(report.capability.gevonden,false);
  const synthetic=new Uint8Array();
  report.negativeRequest={filename:'policy-only.ett',bytes:synthetic.length,role:'Explicitly synthetic empty request for negative no-desktop routing only; not an ETT fixture'};
  let rejection;
  try {await bereidOpenen('policy-only.ett',synthetic,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
  catch(e){rejection=e;}
  assert.ok(rejection&&/\bETT\b/.test(rejection.message)&&/XLSX/.test(rejection.message),rejection?.message);
  report.noDesktopPolicy={passed:true,error:rejection.message,method:'Empty window, no Tauri mock; actual production functions, not a hosted browser UI'};
  const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm'),hash=createHash('sha256').update(wasm).digest('hex');
  assert.equal(hash,JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json','utf8')).wasmSha256);
  report.engineIdentityOnly={sha256:hash,initialized:false,executed:false};
  report.checks.push('Actual no-desktop policy gives concrete ETT limitation/XLSX alternative; no Office/WASM or synthetic positive conversion used.');
  report.inferredWrapperConsequence={basis:'Read-only bereidOpenen source checks isSjabloon(filename) before its new-document wrapper',
    inference:'False ETT predicate means the generic template wrapper is skipped after a successful import',
    actualETTImportOrSaveObserved:false,sourceOverwriteOrDataLossReproduced:false};
  assert.equal(report.templateClassificationAcceptance,true,'ETT is a WPS spreadsheet template, but the actual P2 predicate does not recognize it as one');
  report.passed=true;
} catch(error) {report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;}
finally {
  if(original===undefined)delete globalThis.window;else globalThis.window=original;
  await loader.close();fs.writeFileSync('.local/ett-qa/policy-report.json',JSON.stringify(report,null,2));
}
