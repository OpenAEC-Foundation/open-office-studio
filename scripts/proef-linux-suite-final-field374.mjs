import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSuiteNativeScenario} from './linux-suite-native-session.mjs';
import {preflight,saveAsDocx,typeShortFieldMarker,preserveWorkingCopy} from '../qa/linux-suite-final/scenarios.mjs';
import {fixture,prepareOracle,auditDocx,MARKER} from '../qa/linux-suite-final/field374/contract.mjs';

await runSuiteNativeScenario({packageType:'deb',scenarioName:'field374'},async s=>{
  await preflight(s);const oracle=await prepareOracle(s.out);
  async function audit(path,name,marker){
    const bytes=await readFile(path),result=await auditDocx(bytes,s.out,name,oracle,marker);
    (s.report.fieldAudits??=[]).push({name,inputSha256:s.hash(bytes),...result});return result;
  }
  for(const kind of ['windows','converted']){
    s.setPhase('field374-'+kind);
    const immutable=await fixture(kind==='windows'?'windows-resaved.docx':'converted.docx');
    const originalHash=s.hash(immutable),path=await preserveWorkingCopy(s,kind+'_control.docx',immutable);
    const beforeMarker=kind==='windows'?MARKER:'';
    await audit(path,kind+'_original',beforeMarker);
    await s.startDocument(path,null,0,0,beforeMarker);await s.canvasFocus();
    await s.captureStable(kind+'-before-edit');
    if(kind==='converted'){
      await s.nativeKey('End');await typeShortFieldMarker(s,MARKER);
      await s.waitFor(()=>s.inspectBody(MARKER),'Exact short adjacent native edit');
      await s.captureStable('converted-after-real-edit');
    }
    const target=await saveAsDocx(s,'field374_'+kind);
    await audit(target,kind+'_saved',MARKER);await s.canvasFocus();await s.captureStable(kind+'-saved');
    assert.equal(s.hash(await readFile(path)),originalHash,'Original control unchanged by Save As');
    const pid=s.current().pid;await s.normalQuit();
    const reopened=await s.startDocument(target,null,0,0,MARKER);assert.notEqual(reopened.pid,pid);
    await s.canvasFocus();await s.captureStable(kind+'-new-pid-reopen');await audit(target,kind+'_reopened',MARKER);
    await s.nativeKey('ctrl+s');await s.waitForCleanUI();await audit(target,kind+'_resaved',MARKER);await s.normalQuit();
    assert.equal(s.hash(await readFile(path)),originalHash);await fixture(kind==='windows'?'windows-resaved.docx':'converted.docx');
  }
  s.report.visualStatus='Original native PNGs retained for serial human title/marker overlap review; XML or stability alone is not visual acceptance';
});
