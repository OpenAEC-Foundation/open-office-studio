/** Parametric caller of the unchanged, proven STW credential-bound GTK protocol. */
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createOwnedDialog,requireExactFocusedPath} from './linux-stw-dialog-input.mjs';
import {writer362ProcStartTime} from './linux-p2-ribbon-native.mjs';

assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');
const [pidText,startTime,elfSha,proofPath,targetPath,evidencePath,capturePath]=process.argv.slice(2);
const pid=Number(pidText),target=resolve(targetPath),here=dirname(fileURLToPath(import.meta.url));
assert.ok(target.startsWith(resolve('.local/standalone-linux-results/database')+'/'));
assert.match(elfSha,/^[0-9a-f]{64}$/);
const exec=promisify(execFile),env={...process.env},hash=b=>createHash('sha256').update(b).digest('hex');
const appExecutable=await realpath(`/proc/${pid}/exe`);
const report={status:'running',protocolPin:'9f321450ce9002dfd2bfbd8ed7baed63a212067e',correctedCallerPin:'3f4ddecd383e6a9fcb6a5f78ff456c08d772797a',appPid:pid,appStartTime:startTime,expectedAppElfSha256:elfSha,target};
const owner=async()=>{
  assert.equal(writer362ProcStartTime(await readFile(`/proc/${pid}/stat`,'utf8'),pid),startTime);
  assert.equal(await realpath(`/proc/${pid}/exe`),appExecutable);
  assert.equal(hash(await readFile(`/proc/${pid}/exe`)),elfSha);
};
const bus=async(method,name)=>{
  const raw=(await exec('gdbus',['call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.'+method,...(name?[name]:[])],{env,timeout:5000})).stdout.trim();
  if(method==='GetConnectionUnixProcessID'){assert.match(raw,/^\(uint32 \d+,\)$/);return Number(raw.match(/\d+(?=,\))/)[0]);}
  assert.match(raw,/^\('[^']+',\)$/);return raw.match(/^\('([^']+)',\)$/)[1];
};
const xdo=async args=>{await owner();return(await exec('xdotool',args,{env,timeout:5000})).stdout.trim();};
try{
  let proof;
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    await owner();proof=JSON.parse(await readFile(proofPath,'utf8'));
    assert.ok(!['blocked','failed'].includes(proof.status),JSON.stringify(proof));
    if(proof.status==='attributed')break;
    await pause(100);
  }
  assert.equal(proof.status,'attributed');assert.equal(proof.ownedPid,pid);assert.equal(proof.member,'SaveFile');
  assert.equal(proof.readyBeforeSave,true);
  const c=proof.correlation;
  assert.equal(await bus('GetId'),proof.busId);
  assert.equal(await bus('GetConnectionUnixProcessID',c.frontend.sender),pid);
  assert.equal(await bus('GetNameOwner','org.freedesktop.portal.Desktop'),c.brokerUniqueName);
  assert.equal(await bus('GetNameOwner','org.freedesktop.impl.portal.desktop.gtk'),c.backendUniqueName);
  assert.equal(await bus('GetConnectionUnixProcessID',c.backendUniqueName),c.backendPid);
  assert.equal((await realpath(`/proc/${c.backendPid}/exe`)).split('/').at(-1),'xdg-desktop-portal-gtk');
  report.attribution=proof;
  const input=await createOwnedDialog({pid:c.backendPid,expectedExecutable:proof.backendExecutable,expectedEnvironment:env,xdo});
  report.input=input.evidence;
  report.dialogTitle=await xdo(['getwindowname',input.evidence.xid]);
  await input.key('ctrl+l');await input.key('ctrl+a');await input.typePath(target);
  const anatomy=JSON.parse((await exec('/usr/bin/python3',[join(here,'linux-stw-gtk-anatomy.py'),String(c.backendPid)],{env,timeout:10000})).stdout);
  report.anatomy=anatomy;requireExactFocusedPath(anatomy,c.backendPid,target);
  const binding=input.evidence.binding;
  report.capture=JSON.parse((await exec('/usr/bin/python3',[join(here,'linux-p2-native-capture.py'),String(binding.pid),input.evidence.xid,binding.startTime,binding.executable,capturePath],{env,timeout:10000})).stdout);
  await input.submit();
  await pause(700);
  if(!(await stat(target).catch(()=>null))&&(await xdo(['getwindowfocus']))===input.evidence.xid){
    await input.verify('before explicit native Save');await xdo(['key','--clearmodifiers','alt+s']);report.explicitNativeSave=true;
  }
  const closeDeadline=Date.now()+30000;
  while(Date.now()<closeDeadline){
    const windows=await xdo(['search','--onlyvisible','--pid',String(c.backendPid)]).catch(error=>{if(error.code===1)return '';throw error;});
    if(!windows){report.ownedDialogClosed=true;break;}await pause(100);
  }
  assert.equal(report.ownedDialogClosed,true);assert.ok((await stat(target)).size>0);
  await owner();report.status='passed-credential-bound-native-save';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally{await writeFile(evidencePath,JSON.stringify(report,null,2)+'\n');}
