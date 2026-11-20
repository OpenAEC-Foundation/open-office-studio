import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const root=path.resolve('..'), reportFile=path.resolve('.local/327-acceptance-session.json');
const points={A:'93fcc6194904f70fa12d0a3546c23dac9c673ee5',B:'e5db41f2aa02fbca50a7170a064af4a292ae1f9d'};
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const cpu=()=>os.cpus().reduce((a,c)=>{a.idle+=c.times.idle;a.total+=Object.values(c.times).reduce((x,y)=>x+y,0);return a;},{idle:0,total:0});
const report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{
  createdAt:new Date().toISOString(),host:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalMemory:os.totalmem(),node:process.version},
  sourcePoints:points,instrumentation:JSON.parse(fs.readFileSync('.local/327-acceptance-instrumentation.json','utf8')),runs:[]};
for(const test of process.argv.slice(2)){
  assert.match(test,/^[AB][1-9]$/);
  const variant=test[0],cwd=path.join(root,`oos-writer-language-acceptance-${variant}-2026-11-16-6f92`);
  const label=`327_20261116_${test}`;
  assert(!report.runs.some(r=>r.label===label),'Keep all original attempts; choose a new label');
  assert.equal(git(cwd,'rev-parse','HEAD'),points[variant]);
  assert.equal(git(cwd,'status','--porcelain'),'');
  for(const [file,expected]of Object.entries(report.instrumentation)) assert.equal(hash(path.join(cwd,file)),expected,file);
  console.log('Starting',test,new Date().toISOString());
  await new Promise(r=>setTimeout(r,10000));
  const begin=cpu(),startedAt=new Date().toISOString(),freeBefore=os.freemem();
  const args=[path.join(cwd,'.local/acceptance-meet.mjs'),'.local/327-measurement',label,'4','--diagnostic','--native-diagnostic','--language-status-checks','--range-cache-checks','--check-warmup'];
  const stream=fs.createWriteStream(path.join(cwd,`.local/${label}.log`));
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,PLAYWRIGHT_MODULE:path.join(cwd,'node_modules/playwright/index.mjs'),PLAYWRIGHT_BROWSERS_PATH:path.join(root,'oos-presentation-sdk-performance-6f92/.local/327-browsers')},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream);child.stderr.pipe(stream);
  const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  stream.end();
  const end=cpu(),resultFile=path.join(cwd,`.local/perf-${label}.json`);
  const result=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):null;
  const run={label,variant,source:points[variant],tree:git(cwd,'rev-parse','HEAD^{tree}'),startedAt,endedAt:new Date().toISOString(),exit,
    hostBusyPercent:100*(1-(end.idle-begin.idle)/(end.total-begin.total)),freeBefore,freeAfter:os.freemem(),
    sourceCleanAfter:git(cwd,'status','--porcelain')==='',resultFile,result};
  report.runs.push(run);fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log('Finished',test,JSON.stringify({exit,phases:result?.phases.map(p=>({name:p.name,wallMs:p.wallMs,subphaseMs:p.subphaseMs,language:p.calls['languageStatus.selectie']})),geometry:result?.viewportChecks?.length,saved:result?.savedExact,hostBusyPercent:run.hostBusyPercent}));
  if(exit!==0){process.exitCode=1;break;}
}
