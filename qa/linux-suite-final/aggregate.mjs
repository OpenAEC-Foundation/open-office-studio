import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const kind=process.argv[2];assert(['deb','appimage'].includes(kind));
const base='.local/linux-p2-native',reports={};
async function read(name,path){const bytes=await readFile(path),value=JSON.parse(bytes);reports[name]={path,sha256:createHash('sha256').update(bytes).digest('hex'),report:value};return value;}
if(kind==='deb'){
  const core=await read('core',base+'/suite-final-core/report.json');
  assert.match(core.issue368,/^passed/);assert.match(core.issue369,/^passed/);assert.equal(core.cleanup.ownedApplicationClosed,true);
  const fields=await read('field374',base+'/suite-final-deb-field374/report.json');assert.match(fields.status,/^passed bounded/);assert.equal(fields.cleanup.ownedApplicationClosed,true);
  const confirmation=await read('confirm378',base+'/suite-final-deb-confirm378-both/report.json');assert.match(confirmation.status,/^passed bounded/);assert.equal(confirmation.cleanup.ownedApplicationClosed,true);
}else{
  for(const mode of ['missing','present']){const r=await read('confirm378-'+mode,base+`/suite-final-appimage-confirm378-${mode}/report.json`);assert.match(r.status,/^passed bounded/);assert.equal(r.cleanup.ownedApplicationClosed,true);}
}
const sources=new Set(Object.values(reports).map(r=>r.report.source.commit));assert.equal(sources.size,1);
await writeFile(base+`/suite-final-${kind}-aggregate.json`,JSON.stringify({scope:kind==='deb'?'Tested Suite core/field/confirmation scopes':'Actual Suite AppImage preflight/confirmation scopes',status:'automated scoped checks passed; original native visual review remains required',fullNativeAcceptance:false,source:[...sources][0],reports:Object.fromEntries(Object.entries(reports).map(([name,r])=>[name,{path:r.path,sha256:r.sha256,status:r.report.status,limits:r.report.limits}])),limits:['No blanket platform, release, signed distribution or RPM verdict','Field title/native images need serial original-pixel review','Core genuine disabled-Delete reachability/unavailable states remain explicitly in the raw report; do not turn a partial module into a blanket native pass']},null,2)+'\n');
