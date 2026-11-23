/** Actual negative production functions in Linux CI; no qualified DPS import. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

assert.equal(process.platform,'linux','Production function execution restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-dps/sources.json','utf8'));
const source=JSON.parse(fs.readFileSync('.local/dps-qa/source-gate-report.json','utf8'));
assert.equal(source.sourceGatePassed,false);assert.equal(source.diagnosticsPassed,true);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts','scripts/presentatieengine-compatibiliteit.ts']);
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceGatePassed:false,sourceImportAcceptance:false,fullFormatAcceptance:false,
  method:'Actual P2 production functions in Linux Node/Vite SSR with an empty window; no Tauri bridge or positive conversion mock',checks:[],limits:config.limits};
const loader=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const original=globalThis.window;
try {
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  const formats=await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon}=await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  const catalog=JSON.parse(fs.readFileSync('src/formaten.json','utf8'));
  assert.ok(catalog.pptx.invoer.includes('dps'));assert.ok(!catalog.pptx.uitvoer.dps);
  assert.equal(formats.bestandssoort('dps'),'pptx');
  assert.equal(isSjabloon('policy-only.dps'),false);assert.equal(isSjabloon('policy-only.DPS'),false);
  report.classification={catalogInput:true,kind:'pptx',dpsExportDeclared:false,templateLowercase:false,templateUppercase:false};
  globalThis.window={};report.capability=await formats.conversieStatus();assert.equal(report.capability.gevonden,false);
  const bytes=new Uint8Array();
  report.request={name:'policy-only.dps',bytes:bytes.length,role:'Explicitly synthetic empty negative routing request; not a DPS file or content test'};
  let rejection;
  try {await bereidOpenen('policy-only.dps',bytes,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
  catch(error){rejection=error;}
  assert.ok(rejection&&/\bDPS\b/.test(rejection.message)&&/PPTX/.test(rejection.message),rejection?.message);
  report.noDesktopPolicy={passed:true,error:rejection.message,hostedBrowserUI:false};
  const wasm=fs.readFileSync('node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm');
  const hash=createHash('sha256').update(wasm).digest('hex');
  assert.equal(hash,'3a4be9329de1bca77437137ce6417c7910e35c1c7c0e78571bb81f9fe16e5563');
  report.engineIdentityOnly={package:'@betteroffice/pptx',version:'0.5.1',bytes:wasm.length,sha256:hash,initialized:false,executed:false};
  report.checks.push('Unchanged P2 product source/tree, DPS presentation input, ordinary-document predicate and no DPS export declaration verified.',
    'Actual negative no-desktop policy rejects DPS with a concrete PPTX alternative; no source bytes or positive conversion callback output used.',
    'Installed pinned presentation WASM identity checked only; no initialization, edit or save acceptance.');
  report.policyChecksPassed=true;
} catch(error){report.policyChecksPassed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;}
finally {
  if(original===undefined)delete globalThis.window;else globalThis.window=original;
  await loader.close();fs.writeFileSync('.local/dps-qa/policy-report.json',JSON.stringify(report,null,2)+'\n');
}
