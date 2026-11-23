import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

export async function preflight(s){
  s.setPhase('preflight');
  const initial=await s.startDocument(s.preflight);
  await s.canvasFocus();await s.grid('preflight exact fixture',s.baseline);
  await s.type('P');const cells=['Palpha',...s.baseline.slice(1)];
  await s.grid('actual native typing',cells);await s.nativeKey('ctrl+z');
  await s.grid('actual native CtrlZ',s.baseline);await s.nativeKey('ctrl+y');
  await s.grid('actual native CtrlY',cells);await s.save(s.preflight,cells,3);
  await s.captureStable('preflight-saved');await s.normalQuit();
  const reopened=await s.startDocument(s.preflight,cells);assert.notEqual(reopened.pid,initial.pid);
  await s.grid('normal quit new PID exact saved fixture',cells);
  await s.captureStable('preflight-reopened');await s.normalQuit();
  s.report.preflight={status:'passed',source:s.identity.sourceCommit,packageSha256:s.identity.packageSha256,executableSha256:s.identity.executableSha256,normalFullQuitAndNewPid:true};
}

export async function saveAsDocx(s,name){
  assert.match(name,/^[a-z0-9_]+$/);
  await s.nativeKey('ctrl+shift+s');
  await s.waitFor(()=>s.evaluate(()=>document.querySelector('.opslaanals-naam input')),'Actual Save As dialog');
  await s.clickElement(await s.evaluate(()=>document.querySelector('.opslaanals-naam input')));
  await s.nativeKey('ctrl+a');await s.type(name);
  await s.clickElement(await s.evaluate(()=>document.querySelector('.opslaanals-formaten input[value="docx"]')));
  const selected=await s.evaluate(()=>({name:document.querySelector('.opslaanals-naam input')?.value,format:document.querySelector('.opslaanals-formaten input:checked')?.value}));
  assert.deepEqual(selected,{name,format:'docx'});
  await s.captureStable(name+'-save-as-selection');
  const target=join(s.out,name+'.docx'),observer=await s.observer('SaveFile',name+'.docx');
  await s.clickElement(await s.evaluate(()=>document.querySelector('.opslaanals-naam')?.closest('[role=dialog]')?.querySelector('.office-dialoogdoorgaan')));
  await s.nativePicker(observer,target);await s.waitFor(()=>stat(target).then(v=>v.size>0),'Native Save As target');
  await s.waitForCleanUI();return target;
}

export async function typeShortFieldMarker(s,marker){
  assert.equal(marker,' -- STW30 EDIT 2026-11-23');
  for(const piece of marker.match(/-|[A-Za-z0-9_ ]+/g)) {
    if(piece==='-') await s.nativeKey('minus'); else await s.type(piece);
  }
}

export async function discardOwnedDirtyAndQuit(s){
  await s.requireAppOwner(s.current());
  await s.xdo(['key','--clearmodifiers','alt+F4']);
  const button=await s.waitFor(()=>s.evaluate(()=>[...document.querySelectorAll('[role="alertdialog"] button')].find(e=>['Don’t save','Discard changes'].includes(e.textContent.trim()))),'Actual owned unsaved-document discard choice');
  // This native click intentionally destroys the app; no post-click DOM focus
  // assertion is possible. The exact owned process/window is checked beforehand.
  await s.requireAppOwner(s.current());
  await s.clickClosingElement(button);
  await s.waitFor(async()=>!(await s.ownedApplicationResources()).length,'Native discard closes app/AppImage resources',20000);
  await s.releaseClosedSession();
  s.report.checks.push({label:'Own synthetic dirty test discarded via real UI and closed',sourceTargetUnchanged:true});
}

export async function preserveWorkingCopy(s,name,bytes){
  const path=join(s.out,name);await writeFile(path,bytes,{flag:'wx'});return path;
}
