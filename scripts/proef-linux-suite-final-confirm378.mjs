import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,realpath,stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {runSuiteNativeScenario} from './linux-suite-native-session.mjs';
import {preflight,discardOwnedDirtyAndQuit} from '../qa/linux-suite-final/scenarios.mjs';

const [packageType,mode='both']=process.argv.slice(2);
assert(['deb','appimage'].includes(packageType));assert(['both','missing','present'].includes(mode));
await runSuiteNativeScenario({packageType,scenarioName:'confirm378-'+mode},async s=>{
  if(mode!=='present') await preflight(s);
  else {
    const previousBytes=await readFile(join(s.out,'../suite-final-appimage-confirm378-missing/report.json'));
    const previous=JSON.parse(previousBytes);
    assert.equal(previous.preflight?.status,'passed');assert.equal(previous.source.commit,s.identity.sourceCommit);
    assert.equal(previous.origin.packageSha256,s.identity.packageSha256);assert.equal(previous.origin.executableSha256,s.identity.executableSha256);
    assert.equal(previous.harnessSha256,s.report.harnessSha256);assert.equal(previous.source.tree,s.identity.sourceTree);
    assert.match(previous.status,/^passed bounded/);s.report.reusedPreflight={reportSha256:s.hash(previousBytes),source:previous.source,packageSha256:previous.origin.packageSha256,note:'Same actual AppImage and source on this own host; declared Zenity installed between negative and positive cases.'};
  }
  async function conflict(name){
    const path=await s.fixture(name);await s.startDocument(path);await s.canvasFocus();await s.type('Q');
    const cells=['Qalpha',...s.baseline.slice(1)];await s.grid('Owned native working edit before external change',cells);
    const original=await readFile(path),parts=unzipSync(original);
    const xml=strFromU8(parts['word/document.xml']);assert(xml.includes('beta'));
    parts['word/document.xml']=strToU8(xml.replace('beta','external_beta'));
    const external=Buffer.from(zipSync(parts,{mtime:new Date('2026-11-23T00:00:00Z')}));
    await writeFile(path,external);assert.equal(s.savedGrid(external).cells[1],'external_beta');
    const receipt={name,path,fixtureSha256:s.hash(original),preActionTargetSha256:s.hash(external),nativeWorkingCells:cells,externalChange:'Independent mutation of this owned test copy before the action/hash baseline; immutable original template is untouched.'};
    (s.report.conflicts??=[]).push(receipt);return {...receipt,cells};
  }
  async function ownedZenity(){
    const app=s.current();await s.requireAppOwner(app);
    const executable=await realpath((await s.exec('which',['zenity'],{env:s.env})).stdout.trim());
    assert.equal(executable,'/usr/bin/zenity');
    assert.match((await s.exec('dpkg-query',['-S',executable],{env:s.env})).stdout,/zenity:/);
    const found=await s.waitFor(async()=>{
      const matches=[];
      for(const name of await readdir('/proc')){
        if(!/^\d+$/.test(name))continue;
        try{const state=await readFile('/proc/'+name+'/stat','utf8'),fields=state.slice(state.lastIndexOf(')')+2).split(/\s+/);
          if(Number(fields[1])===app.pid&&(await realpath('/proc/'+name+'/exe'))===executable)matches.push(Number(name));
        }catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}
      }assert(matches.length<=1,'One exact Office-owned Zenity child');return matches[0];
    },'Real confirmation child of the owned Office PID');
    const xdo=async args=>{await s.requireAppOwner(app);return s.xdo(args);};
    const dialog=await s.createOwnedDialog({pid:found,expectedExecutable:executable,expectedEnvironment:s.env,xdo});
    const anatomy=JSON.parse((await s.exec('/usr/bin/python3',[join(s.here,'linux-suite-native-anatomy.py'),String(found)],{env:s.env,timeout:15000})).stdout);
    assert.equal(anatomy.pid,found);assert(anatomy.nodes.some(n=>n.showing&&n.name==='Overwrite'),'Actual custom Overwrite button');
    assert(anatomy.nodes.some(n=>n.showing&&n.name==='Cancel'),'Actual Cancel button');
    const proof={officePid:app.pid,pid:found,executable,executableSha256:s.hash(await readFile(executable)),input:dialog.evidence,anatomy};
    (s.report.confirmations??=[]).push(proof);
    const file=join(s.out,'confirmation-'+s.report.confirmations.length+'.png');
    const image=JSON.parse((await s.exec('/usr/bin/python3',[join(s.here,'linux-p2-native-capture.py'),String(found),dialog.evidence.xid,dialog.evidence.binding.startTime,executable,file],{env:s.env,timeout:10000})).stdout);
    assert.equal(s.hash(await readFile(file)),image.sha256);proof.capture=image;
    return {app,dialog,proof};
  }
  async function modalReturned(value){
    await s.waitFor(()=>stat('/proc/'+value.proof.pid).then(()=>false).catch(e=>{if(e.code==='ENOENT')return true;throw e;}),'Same owned confirmation child exited');
    value.proof.mainWindowReturn=await s.reenter();
  }
  if(mode!=='missing'){
    s.setPhase('378-present-runtime');const c=await conflict('confirm_present');
    await s.modalKey('ctrl+s');let native=await ownedZenity();
    await native.dialog.verify('before native Escape cancellation');await s.xdo(['key','--clearmodifiers','Escape']);
    await modalReturned(native);assert.equal(s.hash(await readFile(c.path)),c.preActionTargetSha256);
    await s.grid('Real native Cancel preserves unsaved working contents',c.cells);
    await s.captureStable('after-native-cancel');
    s.report.checks.push({label:'Actual user Cancel is not a missing-runtime error',targetSha256:c.preActionTargetSha256});
    await s.modalKey('ctrl+s');native=await ownedZenity();
    const controls=native.proof.anatomy.nodes.filter(n=>n.showing&&n.name==='Overwrite'&&n.role==='push button'&&n.bounds?.width>0&&n.bounds?.height>0);
    assert.equal(controls.length,1,'One exact native Overwrite control with real bounds');
    const b=controls[0].bounds,point={x:Math.floor(b.x+b.width/2),y:Math.floor(b.y+b.height/2)};
    await native.dialog.verify('before native pointer Overwrite');
    native.proof.overwritePointer=point;await s.xdo(['mousemove','--sync',String(point.x),String(point.y),'click','1']);
    await modalReturned(native);
    const saved=await s.waitFor(async()=>{const bytes=await readFile(c.path);return JSON.stringify(s.savedGrid(bytes).cells)===JSON.stringify(c.cells)?bytes:null;},'Native Overwrite saved the actual working data');
    assert.notEqual(s.hash(saved),c.preActionTargetSha256);await s.waitForCleanUI();await s.captureStable('after-native-overwrite');
    const pid=s.current().pid;await s.normalQuit();const reopened=await s.startDocument(c.path,c.cells);assert.notEqual(reopened.pid,pid);
    await s.grid('Confirmed overwrite normal full quit/fresh PID retains XML data',c.cells);await s.captureStable('positive-new-pid-reopen');await s.normalQuit();
    s.report.confirmationPositive={status:'passed',savedSha256:s.hash(saved),cells:c.cells};
  }
  if(mode!=='present'){
    s.setPhase('378-missing-runtime');
    // Even on a host with declared Zenity installed, only the owned application
    // child gets a private PATH without the helper. AppImage remains the actual
    // original package launcher; no host/global PATH or payload is modified.
    const initialHelper=await s.exec('which',['zenity'],{env:s.env}).then(r=>r.stdout.trim()).catch(e=>{if(e.code===1)return null;throw e;});
    const childOnlyPath=Boolean(initialHelper);
    if(childOnlyPath)await s.setMissingHelper(true);
    const c=await conflict('confirm_missing');
    await s.nativeKey('ctrl+s');
    const error=await s.waitFor(()=>s.evaluate(()=>[...document.querySelectorAll('.office-meldingen [role="alert"],.office-meldingen')].map(e=>e.textContent).find(t=>t?.includes('Install the zenity package'))),'Visible actionable native missing-Zenity error');
    assert.equal(s.hash(await readFile(c.path)),c.preActionTargetSha256);await s.grid('Missing runtime retains native unsaved contents',c.cells);
    await s.captureStable('missing-helper-error');s.report.missingRequirement={status:'passed bounded actual package missing-helper negative',error,targetSha256:c.preActionTargetSha256,packageType,initialHostHelper:initialHelper,environment:childOnlyPath?'Only app child PATH cannot resolve helper; host unchanged':'Actual host has no Zenity before documented runtime installation'};
    await discardOwnedDirtyAndQuit(s);assert.equal(s.hash(await readFile(c.path)),c.preActionTargetSha256);
    if(childOnlyPath)await s.setMissingHelper(false);
  }
});
