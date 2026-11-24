/** Separate Linux Node process; no surviving original SDK/session. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openProductieTekstkern} from '../tekstkern-productieproef.mjs';
assert.equal(process.platform,'linux');
assert.ok(!process.env.OOS_NOOT_WASM&&!process.env.OOS_NOOT_LAYOUT_WASM);
const out=path.resolve('.local/lwp96-qa');
const cfg=JSON.parse(fs.readFileSync('scripts/qa-lwp96/fixture.json','utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(out,'engine-report.json'),'utf8'));
const oracle=JSON.parse(fs.readFileSync(path.join(out,'source-oracle.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
execFileSync('git',['diff','--exit-code',cfg.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts','scripts/tekstkern-productieproef.mjs','scripts/tekstkern-proef.ts','scripts/tekstengine-compatibiliteit.ts']);
const saved=fs.readFileSync(path.join(out,'saved.docx'));
const report={application:cfg.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputSavedSha256:sha(saved),method:'New Linux CI Node process opens exact saved DOCX after original process exited',process:{pid:process.pid,ppid:process.ppid,node:process.version,platform:process.platform,startedAt:new Date(performance.timeOrigin).toISOString()},fullFormatAcceptance:false};
let production,session;
try {
 production=await openProductieTekstkern(path.join(out,'vite-cache'));
 assert.equal(production.route,'productiekern');assert.deepEqual(production.kernen,prior.engine.kernels);assert.deepEqual(production.aansluiting,prior.engine.productionJSBindings);
 report.engine={route:production.route,kernels:production.kernen,productionJSBindings:production.aansluiting};
 session=await production.sdk.createYrsSession();session.openDocx(saved,true);
 const texts=session.paragraphs('body').slice(0,cfg.enginePrefixParagraphs).map(p=>p.text);assert.deepEqual(texts,oracle.expected.editedTexts);
 report.paragraphs=texts;
 const bytes=(await production.sdk.saveYrsDocx(session)).bytes;fs.writeFileSync(path.join(out,'fresh-process-saved.docx'),bytes);
 execFileSync('python3',['-B','scripts/qa-lwp96/oracle.py','docx','--out',out,'--docx',path.join(out,'fresh-process-saved.docx'),'--edited','--observe'],{stdio:'inherit'});
 const xml=JSON.parse(fs.readFileSync(path.join(out,'fresh-process-saved-xml-report.json'),'utf8'));
 report.boundedSourceAcceptance=xml.boundedSourceAcceptance;report.sourceMismatches=xml.mismatches;
 assert.equal(sha(fs.readFileSync(path.join(out,'source.lwp'))),cfg.source.sha256);assert.equal(sha(fs.readFileSync(path.join(out,'saved.docx'))),report.inputSavedSha256);
 report.downstreamEnginePassed=true;assert.equal(xml.boundedSourceAcceptance,true,'Strict native source XML differs after new-process reopen');report.passed=true;
} catch(e){report.passed=false;report.error={name:e.name,message:e.message};throw e;}
finally {
 if(session)session.destroy();if(production)await production.sluit();report.cleanup={sessionDestroyed:!!session,productionLoaderClosed:!!production,localGuiOrCaptureUsed:false};
 fs.writeFileSync(path.join(out,'fresh-process-report.json'),JSON.stringify(report,null,2)+'\n');
}
