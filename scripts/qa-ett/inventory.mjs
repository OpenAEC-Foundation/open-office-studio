/** Immutable public source inventories, not a producer/oracle or format pass. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const config=JSON.parse(fs.readFileSync('scripts/qa-ett/source-search.json','utf8'));
const out='.local/ett-qa';fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const gh=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',maxBuffer:25*1024*1024,timeout:60_000}));
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  qualifiedSource:null,sourceGatePassed:false,sourceImportAcceptance:false,fullFormatAcceptance:false,
  method:'Case-insensitive .ett suffix search of complete immutable official GitHub tree API responses; public source search, not an Internet-wide absence claim.',inventories:[],unrelatedLead:null,
  limits:config.limits};
try {
  for(const source of config.inventories) {
    const endpoint=`repos/${source.repository}/git/trees/${source.ref}?recursive=1`,tree=gh(endpoint);
    assert.equal(tree.truncated,false,`Incomplete inventory ${source.repository}`);
    const matches=tree.tree.filter(e=>e.type==='blob'&&/\.ett$/i.test(e.path)).map(e=>({path:e.path,blob:e.sha,bytes:e.size}));
    report.inventories.push({...source,endpoint,responseTreeSha:tree.sha,truncated:false,entries:tree.tree.length,matches});
  }
  const lead=config.unrelatedLead;
  const meta=gh(`repos/${lead.repository}/contents/${lead.path}?ref=${lead.commit}`),bytes=Buffer.from(meta.content,'base64');
  assert.equal(meta.sha,lead.blob);assert.equal(bytes.length,lead.bytes);assert.equal(sha(bytes),lead.sha256);
  const xml=bytes.toString('utf8');assert.match(xml,/^<\?xml/);assert.match(xml,/<Project\b/);
  assert.match(xml,/<Prop\b[^>]*name="@STUDIO:PRODUCT"[^>]*>\s*<value>SC<\/value>/);
  report.unrelatedLead={...lead,observedXmlRoot:'Project',observedProductValue:'SC',classifiedAs:'Different software project template, not a WPS spreadsheet template',sourceBytesRetained:false};
  const pending=report.inventories.flatMap(s=>s.matches.map(m=>({repository:s.repository,ref:s.ref,...m})));
  report.newUninspectedCandidates=pending;
  assert.equal(pending.length,0,'ETT candidates require inspection before concluding a source gap');
  report.inventoryDiagnosticsPassed=true;
  console.log(JSON.stringify({inventories:report.inventories.length,truncated:false,ettPaths:pending.length,sourceGatePassed:false,unrelatedLead:'Project / SC'}));
} catch(error) {report.inventoryDiagnosticsPassed=false;report.error={name:error.name,message:error.message};throw error;}
finally {fs.writeFileSync(`${out}/source-search-report.json`,JSON.stringify(report,null,2));}
