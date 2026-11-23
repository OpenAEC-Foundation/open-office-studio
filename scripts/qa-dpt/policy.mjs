/** Real P2 predicate/negative capability; no qualified DPT import or positive mock. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

assert.equal(process.platform,'linux','Production execution restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-dpt/sources.json','utf8'));
const source=JSON.parse(fs.readFileSync('.local/dpt-qa/source-gate-report.json','utf8'));
assert.equal(source.sourceGatePassed,false);assert.equal(source.diagnosticsPassed,true);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts','scripts/presentatieengine-compatibiliteit.ts']);
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceGatePassed:false,sourceImportAcceptance:false,fullFormatAcceptance:false,
  method:'Actual unchanged P2 production functions in Linux Node/Vite SSR. No copied predicate, Tauri bridge or positive conversion mock.',checks:[],limits:config.limits};
const loader=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const original=globalThis.window;
try {
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  const formats=await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon}=await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  const catalog=JSON.parse(fs.readFileSync('src/formaten.json','utf8'));
  assert.ok(catalog.pptx.invoer.includes('dpt'));assert.ok(!catalog.pptx.uitvoer.dpt);
  assert.equal(formats.bestandssoort('dpt'),'pptx');
  report.classification={expectedTemplate:true,producerDefinition:config.templateDefinition,
    lowercase:isSjabloon('policy-only.dpt'),uppercase:isSjabloon('policy-only.DPT'),
    controls:{potx:isSjabloon('policy-control.potx'),otp:isSjabloon('policy-control.otp'),sti:isSjabloon('policy-control.sti'),pptx:isSjabloon('policy-control.pptx')}};
  assert.deepEqual(report.classification.controls,{potx:true,otp:true,sti:true,pptx:false});
  report.templateClassificationAcceptance=report.classification.lowercase&&report.classification.uppercase;
  report.checks.push('Actual DPT catalog input and filename template predicate recorded with existing presentation filename controls.');
  globalThis.window={};report.capability=await formats.conversieStatus();assert.equal(report.capability.gevonden,false);
  report.request={name:'policy-only.dpt',bytes:0,role:'Explicit synthetic empty negative request; not a DPT fixture/content acceptance'};
  let rejection;
  try {await bereidOpenen('policy-only.dpt',new Uint8Array(),{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
  catch(error){rejection=error;}
  assert.ok(rejection&&/\bDPT\b/.test(rejection.message)&&/PPTX/.test(rejection.message),rejection?.message);
  report.noDesktopPolicy={passed:true,error:rejection.message,hostedBrowserUI:false};
  const wasm=fs.readFileSync('node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm');
  const hash=createHash('sha256').update(wasm).digest('hex');
  assert.equal(hash,'3a4be9329de1bca77437137ce6417c7910e35c1c7c0e78571bb81f9fe16e5563');
  report.engineIdentityOnly={package:'@betteroffice/pptx',version:'0.5.1',bytes:wasm.length,sha256:hash,initialized:false,executed:false};
  report.inferredWrapperConsequence={basis:'Read-only bereidOpenen source: isSjabloon(filename) guards the new-document template wrapper',
    inference:'False DPT predicate would skip that wrapper after a successful import',actualDptImportOrSaveObserved:false,sourceOverwriteOrDataLossReproduced:false};
  report.checks.push('Actual negative no-desktop policy gives a concrete DPT limitation/PPTX alternative. WASM identity only, no initialization.');
  assert.equal(report.templateClassificationAcceptance,true,'DPT is a WPS presentation template, but the actual P2 predicate does not recognize it');
  report.strictPredicatePassed=true;
} catch(error){report.strictPredicatePassed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;}
finally {
  if(original===undefined)delete globalThis.window;else globalThis.window=original;
  await loader.close();fs.writeFileSync('.local/dpt-qa/policy-report.json',JSON.stringify(report,null,2)+'\n');
}
