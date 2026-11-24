/** New Linux CI process/VM: open only the authenticated prior saved DOCX. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openProductieTekstkern} from '../tekstkern-productieproef.mjs';

assert.equal(process.platform,'linux');
assert.ok(!process.env.OOS_NOOT_WASM&&!process.env.OOS_NOOT_LAYOUT_WASM);
const out=path.resolve('.local/wri31-fresh');
const cfg=JSON.parse(fs.readFileSync('scripts/qa-wri31/fixture.json','utf8'));
const input=JSON.parse(fs.readFileSync(path.join(out,'fresh-input-report.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(out,'original-engine-report.json'),'utf8'));
const oracle=JSON.parse(fs.readFileSync(path.join(out,'source-oracle.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(execFileSync('git',['rev-parse',`${cfg.application.commit}^{tree}`],{encoding:'utf8'}).trim(),cfg.application.tree);
execFileSync('git',['diff','--exit-code',cfg.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts','scripts/tekstkern-productieproef.mjs','scripts/tekstkern-proef.ts','scripts/tekstengine-compatibiliteit.ts']);
const source=fs.readFileSync(path.join(out,'source.wri'));
assert.equal(sha(source),cfg.source.sha256);
const saved=fs.readFileSync(path.join(out,'saved.docx'));
assert.equal(sha(saved),input.savedDocxSha256);
const report={application:cfg.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),input,
  method:'Independent new CI VM/Node process reopens exact DOCX from the previous successful run; original SDK/session cannot persist across jobs',
  process:{pid:process.pid,ppid:process.ppid,node:process.version,platform:process.platform,startedAt:new Date(performance.timeOrigin).toISOString()},
  scope:cfg.source.coverageLimit,fullFormatAcceptance:false,newOfficeExecution:false,checks:[]};
let production,session;
try {
  production=await openProductieTekstkern(path.join(out,'vite-cache'));
  assert.equal(production.route,'productiekern');
  assert.deepEqual(production.kernen,prior.engine.kernels);
  assert.deepEqual(production.aansluiting,prior.engine.productionJSBindings);
  report.engine={route:production.route,kernels:production.kernen,productionJSBindings:production.aansluiting};
  session=await production.sdk.createYrsSession();session.openDocx(saved,true);
  const actual=session.paragraphs('body').slice(0,cfg.enginePrefixParagraphs).map(p=>p.text.replace(/\r\n?/g,'\n'));
  assert.deepEqual(actual,oracle.expected.editedTexts,'New-process document text differs from the original edited native oracle');
  report.checks.push('Exact original saved DOCX opens in a new production Word process; original first17 edited native paragraphs/empty paragraphs survive.');
  const resaved=(await production.sdk.saveYrsDocx(session)).bytes;
  fs.writeFileSync(path.join(out,'fresh-process-saved.docx'),resaved);
  execFileSync('python3',['-B','scripts/qa-wri31/oracle.py','docx','--out',out,'--docx',path.join(out,'fresh-process-saved.docx'),'--edited'],{stdio:'inherit'});
  const xml=JSON.parse(fs.readFileSync(path.join(out,'fresh-process-saved-xml-report.json'),'utf8'));
  assert.equal(xml.boundedSourceAcceptance,true);assert.equal(xml.checkedOrdinaryCases.length,25);assert.deepEqual(xml.mismatches,[]);
  assert.equal(sha(fs.readFileSync(path.join(out,'saved.docx'))),input.savedDocxSha256);
  assert.equal(sha(fs.readFileSync(path.join(out,'source.wri'))),cfg.source.sha256);
  report.checks.push('New-process resave passes all 25 original bounded text/font/justification cases in independent XML; original source and input save remain unchanged.');
  report.output={bytes:resaved.length,sha256:sha(resaved)};report.boundedSourceAcceptance=true;report.passed=true;
} catch(error){report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;}
finally {
  if(session)session.destroy();if(production)await production.sluit();
  report.cleanup={sessionDestroyed:!!session,productionLoaderClosed:!!production,localUserGuiOrCaptureUsed:false};
  fs.writeFileSync(path.join(out,'fresh-process-report.json'),JSON.stringify(report,null,2)+'\n');
}
