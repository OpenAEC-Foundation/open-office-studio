/** Install and operate one untouched standalone NSIS on a fresh hosted Windows VM. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, writeFile, rm, stat } from 'node:fs/promises';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { hwp3Case } from './hwp3-case.mjs';

assert.equal(process.platform,'win32'); assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','Never start native QA on the user PC');
assert.equal(process.env.OPENAEC_CONVERSIE_PROGRAMMA,undefined); assert.equal(process.env.OPENAEC_CONVERSIE_PROFIEL,undefined);
const [packageDir,outputDir]=process.argv.slice(2); assert(packageDir && outputDir);
const root=resolve(outputDir); await mkdir(root); const driver=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);
async function ps(name,args=[]) { return (await run('pwsh',['-NoProfile','-File',join(driver,name),...args],{windowsHide:true,timeout:40000,maxBuffer:2*1024*1024})).stdout.trim(); }
const receipt=JSON.parse(await readFile(join(packageDir,'package.json'),'utf8')), app=receipt.application;
const caseMode='hwp3';assert.equal(app.key,'writer');assert.equal(process.env.OOS_QA_CASE,'hwp3');
const approvedPath=process.env.OOS_QA_APPROVED_CONFIG||'.github/hwp3-windows-consumer.json';
assert(['.github/hwp3-windows-consumer.json'].includes(approvedPath));
const approved=JSON.parse(await readFile(approvedPath,'utf8'));
assert.equal(approved.ready,true);assert.equal(approved.officialMetadataGo,true);
assert.equal(receipt.preflightOnly,undefined,'No old/public preflight package in final P5');
assert.equal(receipt.applicationCommit,'b696ab86bd1c128729a079b68c0082e6df3d36a5');
assert.equal(receipt.applicationTree,'e30879fd772871e690847c061ef66e6b81808a05');
assert.equal(receipt.version,'2026.48.1');assert.equal(receipt.artifactRun,45177730188);assert.equal(receipt.platformJobId,137703365803);assert.equal(receipt.sourceAttempt,1);
assert.equal(receipt.artifactId,approved.artifactId);assert.equal(receipt.archiveSha256,approved.archiveSha256);
assert.equal(receipt.archiveBytes,approved.archiveBytes);
assert.equal(receipt.preparerRun,Number(process.env.OOS_QA_PREPARER_RUN));assert.equal(receipt.preparerHarness,process.env.OOS_QA_PREPARER_HARNESS);
assert.equal(app.signature,'valid');assert.equal(app.timestampRequired,true);
assert.equal(app.key,process.env.OOS_QA_APP); assert.match(receipt.applicationCommit,/^[a-f0-9]{40}$/); assert.match(receipt.applicationTree,/^[a-f0-9]{40}$/);
assert.equal(app.executable,`open-${app.key}-studio.exe`); assert.equal(app.identifier,`org.openaec.${app.key}-studio`);
const installer=resolve(packageDir,receipt.installer); assert.equal(dirname(installer),resolve(packageDir));
const installerBytes=await readFile(installer); assert.equal(installerBytes.length,app.bytes); assert.equal(hash(installerBytes),app.sha256);
const require=createRequire(resolve('.local/hwp3-windows-driver/package.json'));
const {chromium}=require('playwright');
const temporary=await mkdtemp(join(tmpdir(),'oos-standalone23-'));
const install=join(temporary,'installed'), profile=join(temporary,'webview-profile'), policy=join(root,'webview-policy-before.json');
const report={schemaVersion:1,applicationCommit:receipt.applicationCommit,applicationTree:receipt.applicationTree,
 version:receipt.version,harnessCommit:process.env.OOS_QA_HARNESS,package:receipt,scope:'Only native Windows HWP3 via unchanged standalone Writer P5;Two native paragraphs, exact modern Johab Unicode/NFC and CR semantics; not full format',
 status:'failed',steps:[],phases:[],cleanup:{},limitations:[]};
report.caseMode=caseMode;
report.visualAcceptance='Requires separate review of actual completed native screenshots';
let child,browser,page,port,installed=false,policyChanged=false,firstPid,primaryError,mailChild,mail;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const record=entry=>report.steps.push(entry);
async function action(name,extra=[]) {
 const target=join(root,`${report.phases.length}-${name}-${report.steps.length}.json`);
 await ps('windows-actions.ps1',['-Action',name,'-OwnedPid',String(child.pid),'-ReportPath',target,...extra]);
 record(JSON.parse((await readFile(target,'utf8')).replace(/^\uFEFF/,'')));
}
async function focus(locator,label,physicalTarget=locator) {
 await action('Focus'); await physicalTarget.click();
 await checkFocus(locator,label);
}
async function checkFocus(locator,label) {
 record({focusProbe:label,actual:await focusSnapshot()});
 assert(await locator.evaluate(el=>el===document.activeElement || el.contains(document.activeElement)),`Actual ${label} input must own renderer focus`);
 record({focus:label,osAndRenderer:true,keys:'Windows Control'});
}
async function focusSnapshot() {
 return page.evaluate(()=>{
  const chain=[];let el=document.activeElement;
  while(el&&chain.length<8) {
   const bounds=el.getBoundingClientRect();
   chain.push({tag:el.tagName,id:el.id,role:el.getAttribute('role'),label:el.getAttribute('aria-label'),className:String(el.className),connected:el.isConnected,contentEditable:el.isContentEditable,readOnly:el.readOnly,disabled:el.disabled,bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}});
   el=el.shadowRoot?.activeElement;
  }
  const selection=document.getSelection();
  return {documentHasFocus:document.hasFocus(),activeElementChain:chain,domSelection:selection?{rangeCount:selection.rangeCount,collapsed:selection.isCollapsed,anchorTag:selection.anchorNode?.parentElement?.tagName,focusTag:selection.focusNode?.parentElement?.tagName}:null,scope:'Read-only focus/DOM selection observation; no canvas caret or input acceptance inferred'};
 });
}
async function fileReady(path) {
 let previous=-1,stable=0; const deadline=Date.now()+20000;
 while(Date.now()<deadline) {
   try { const bytes=await readFile(path); if(bytes.length>0 && bytes.length===previous)stable++;else stable=0;previous=bytes.length;if(stable>=3)return; }catch{}
   await sleep(250);
 }
 throw Error('Native Save did not produce a stable real filesystem output');
}
async function saveNative(filename,expectedName) {
 const path=join(root,filename);
 const expectation=expectedName instanceof RegExp?['-ExpectedPattern',expectedName.source]:['-ExpectedName',expectedName];
 await action('SaveDialog',['-Target',path,...expectation]); await fileReady(path); return path;
}
async function oracle(kind,file) { execFileSync('python',['-B',join(driver,'oracle.py'),kind,file,file+'.oracle.json'],{stdio:'inherit',timeout:20000}); }
async function saveOffice(filename) {
 const button=page.locator('.office-snelknop:has(.lucide-save-all)'); await button.waitFor();
 await page.waitForFunction(()=>{const b=document.querySelector('.office-snelknop:has(.lucide-save-all)');return b&&!b.disabled;});
 await action('Focus');
 await page.keyboard.press('Control+Shift+s');
 const dialog=page.getByRole('dialog',{name:/^(Save as|Opslaan als)$/i}); await dialog.waitFor();
 const proposed=await dialog.locator('input[type="radio"]:checked').inputValue();assert.equal(proposed,filename.split('.').at(-1));record({actualDefaultSaveProposal:proposed});
 // The real product chooses its output type; setting a synthetic user filename is ordinary UI.
 const name=dialog.locator('input').first(); await name.fill(basename(filename));
 const click=dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click(); void click.catch(()=>{});
 const file=await saveNative(filename,basename(filename)); await click;
 execFileSync('python',['-B',join(driver,'source-oracle/oracle.py'),'docx','--out',join(root,'hwp3-source'),'--docx',file,...(['imported.docx','undo.docx'].includes(filename)?[]:['--edited'])],{stdio:'inherit',timeout:20000});
 record({phase:report.phases.at(-1).phase,actualNativeSave:file,oracle:'passed'}); return file;
}
async function stopNormally() {
 await action('Close'); const deadline=Date.now()+15000;
 while(child.exitCode===null && Date.now()<deadline) await sleep(200);
 assert.notEqual(child.exitCode,null,'BLOCKED: app did not fully exit normally; no new-process reopen claim');
 report.phases.at(-1).normalFullExit=true;
 await browser?.close().catch(()=>{}); browser=undefined; page=undefined;
 const deadlineWebview=Date.now()+5000; let residual;
 do{residual=JSON.parse(await ps('inspect.ps1',['-Action','Residual','-Path',profile]));if(!residual.processes.length)break;await sleep(200);}while(Date.now()<deadlineWebview);
 assert.deepEqual(residual.processes,[],'BLOCKED: old owned WebView process remained before restart');
 report.phases.at(-1).ownedWebviewsExited=true;
}
async function launch(input,phase) {
 const owned=spawn(join(install,app.executable),input?[input]:[],{cwd:install,windowsHide:false,env:{...process.env,
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,WEBVIEW2_USER_DATA_FOLDER:profile},stdio:['ignore','pipe','pipe']});
 child=owned; child.stdout.pipe(createWriteStream(join(root,phase+'.stdout.txt'))); child.stderr.pipe(createWriteStream(join(root,phase+'.stderr.txt')));
 let launchError; child.on('error',e=>launchError=e);
 const result={phase,pid:child.pid,input,started:new Date().toISOString(),status:'running'}; report.phases.push(result);
 const deadline=Date.now()+75000;
 while(Date.now()<deadline) {
  if(launchError)throw launchError;
  if(child.exitCode!==null)throw Error(`Actual app exited before native readiness: ${child.exitCode}`);
  try { browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1500});break;}catch{await sleep(400);}
 }
 assert(browser,'BLOCKED: actual installed WebView2 CDP unavailable; startup is not acceptance');
 for(let n=0;n<60;n++) {page=browser.contexts().flatMap(c=>c.pages()).find(p=>/^(https?:\/\/tauri\.localhost|tauri:|http:\/\/localhost)/.test(p.url()));if(page)break;await sleep(200);}
 assert(page,'BLOCKED: no attributable Tauri page in owned native WebView'); page.setDefaultTimeout(20000);
 result.pageUrl=page.url(); result.pageErrors=[]; page.on('pageerror',error=>result.pageErrors.push(String(error)));
 await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
 if(input && app.key!=='database') {
  const inputTab=page.locator('.office-tabnaam').filter({hasText:basename(input)});await inputTab.waitFor();await inputTab.click();
  await page.waitForFunction(expected=>[...document.querySelectorAll('.office-tab[aria-selected="true"] .office-tabnaam')].some(e=>e.textContent?.trim()===expected),basename(input));
  result.expectedInputTabVisible=basename(input);
  result.exactInputTabActivated=true;
 }
 result.nativeMetadata=app.key==='database'?{
  identifier:report.osIdentity.identifier,version:report.executable.productVersion,name:report.executable.productName,
  source:'Actual NSIS-created Windows shortcut AppUserModelID + installed signed PE VersionInfo',osIdentity:report.osIdentity
 }:await page.evaluate(async()=>({
  identifier:await window.__TAURI_INTERNALS__.invoke('plugin:app|identifier'),
  version:await window.__TAURI_INTERNALS__.invoke('plugin:app|version'),
  name:await window.__TAURI_INTERNALS__.invoke('plugin:app|name')
 }));
 assert.equal(result.nativeMetadata.identifier,app.identifier); assert.equal(result.nativeMetadata.version,receipt.version);assert.equal(result.nativeMetadata.name,app.title);
 await access(profile);const profileEntries=await readdir(profile);assert(profileEntries.length,'Native WebView must actually create its own isolated profile');
 result.ownWebviewProfile={path:profile,createdByNativeWebview:true,entries:profileEntries};
 result.process=JSON.parse(await ps('inspect.ps1',['-Action','Process','-OwnedPid',String(child.pid)]));
 result.installCanonicalPath=await realpath(install);result.executableCanonicalPath=await realpath(join(install,app.executable));
 assert.equal((await realpath(result.process.path)).toLowerCase(),result.executableCanonicalPath.toLowerCase());
 await action('Focus');
 await page.screenshot({path:join(root,phase+'-ready.png')});
 if(['writer','spreadsheet','presentation','email'].includes(app.key)) {
  result.runtime=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('conversie_status'));
   assert.equal(result.runtime.bron,'meegeleverd','Runtime must belong to this single installed app');
   assert.equal(result.runtime.profiel,'veilig');
   // Windows may report long paths for an executable launched via RUNNER~1.
   // Compare actual resolved files, never weaken the own-install boundary.
   result.runtimeCanonicalPath=await realpath(result.runtime.pad);
   const within=relative(await realpath(install),result.runtimeCanonicalPath);
   assert(within && within!=='..' && !within.startsWith('..\\') && !isAbsolute(within),'Runtime escapes this single app installation');
   result.runtimeOwnInstallRelative=within;
   result.runtimeExecutable=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',result.runtimeCanonicalPath]));
 }
 return result;
}
try {
 report.baseline=JSON.parse(await ps('inspect.ps1',['-Action','Baseline']));
 await writeFile(join(root,'baseline.json'),JSON.stringify(report.baseline,null,2)+'\n');
 assert.deepEqual(report.baseline.profiles,[],'Fresh host has previous Office app profile');
 assert.deepEqual(report.baseline.apps,[],'Fresh host already operates another Office app');
 assert.deepEqual(report.baseline.suitePaths,[],'Fresh host already has suite resources');
 report.installer=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',installer]));
 if(app.signature==='valid')assert.equal(report.installer.signature,'Valid');
 assert(report.installer.timestampSigner,'Canonical signed installer must have an actual timestamp');
 assert(['Valid','NotSigned'].includes(report.installer.signature),'Installer Authenticode is invalid or could not be verified');
 execFileSync(installer,['/S',`/D=${install}`],{windowsHide:true,timeout:300000,stdio:'inherit'}); installed=true;
 const executable=join(install,app.executable); await access(executable); await access(join(install,'uninstall.exe'));
 report.executable=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',executable]));
 assert.equal(report.executable.sha256,app.payloadExecutable.sha256,'Installed app must equal independently extracted own NSIS payload');
 assert.equal(report.executable.bytes,app.payloadExecutable.bytes);report.payloadEqualsInstalled=true;
 assert.equal(report.executable.productVersion,receipt.version,'Installed executable version mismatch');
 if(app.signature==='valid')assert.equal(report.executable.signature,'Valid');
 assert(report.executable.timestampSigner,'Canonical signed app must have an actual timestamp');
 assert(['Valid','NotSigned'].includes(report.executable.signature),'Installed executable Authenticode is invalid or could not be verified');
 if(app.key==='database') {
  report.osIdentity=JSON.parse(await ps('app-identity.ps1',['-Executable',executable,'-ProductName',app.title,'-Identifier',app.identifier]));
  assert.equal(report.osIdentity.identifier,app.identifier);
  assert(report.osIdentity.shortcuts.length>0,'Actual installer-created Windows app identity required');
  for(const link of report.osIdentity.shortcuts) {
   link.canonicalTarget=await realpath(link.target);
   assert.equal(link.canonicalTarget.toLowerCase(),(await realpath(executable)).toLowerCase());
  }
 }
 const listener=createServer(); await new Promise(r=>listener.listen(0,'127.0.0.1',r));port=listener.address().port; await new Promise(r=>listener.close(r));
 policyChanged=true;
 await ps('webview-policy.ps1',['-Phase','Enable','-Executable',app.executable,'-StatePath',policy,'-Port',String(port),'-ProfilePath',profile]);
 execFileSync('python',['-B',join(driver,'source-oracle/oracle.py'),'source','--out',join(root,'hwp3-source')],{stdio:'inherit',timeout:60000});
 const fixtures={database:{},pptx:{}};
 if(app.key==='email') {
  mailChild=spawn('python',['-u','-B',join(driver,'loopback-mail.py'),join(root,'mail')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  mailChild.stdout.pipe(createWriteStream(join(root,'mail.stdout.txt')));mailChild.stderr.pipe(createWriteStream(join(root,'mail.stderr.txt')));
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){try{mail=JSON.parse(await readFile(join(root,'mail/ports.json'),'utf8'));break;}catch{await sleep(100);}}
  assert(mail && mail.host==='127.0.0.1','Loopback fixture must bind only the local host');
 }
 const ext={writer:'docx',spreadsheet:'xlsx',presentation:'pptx'}[app.key];
 let input=join(root,'hwp3-source/source.hwp');
 const sourceInput=input, original=input?hash(await readFile(input)):null;
 const fingerprint=async()=>{const a=await stat(sourceInput,{bigint:true});return {sha256:hash(await readFile(sourceInput)),bytes:String(a.size),mtimeNs:String(a.mtimeNs),inode:String(a.ino),device:String(a.dev)}};
 report.originalInput={path:sourceInput,...await fingerprint()};assert(BigInt(report.originalInput.inode)>0n);
 const qa={editPrefix:JSON.parse(await readFile(join(driver,'source-oracle/fixture.json'),'utf8')).edit.text,get page(){return page;},focus,checkFocus,focusSnapshot,prepareFocus:()=>action('Focus'),openHwp3:async()=>{await action('Focus');await page.keyboard.press('Control+o');const target=join(root,'native-open.json');await ps('native-open.ps1',['-Action','OpenDialog','-OwnedPid',String(child.pid),'-ReportPath',target,'-Target',sourceInput]);record(JSON.parse((await readFile(target,'utf8')).replace(/^\uFEFF/,'')));},saveOffice,saveNative,record,oracle,databaseInput:fixtures.database.file,presentationPoint:fixtures.pptx.nativeEditablePoint,presentationText:fixtures.pptx.nativeEditableText,screenshot:name=>page.screenshot({path:join(root,name)}),mail,
  waitForDraft:async()=>{const deadline=Date.now()+20000;while(Date.now()<deadline){try{await oracle('email',join(root,'mail'));return;}catch{await sleep(250);}}throw Error('Real native draft append did not reach loopback fixture');}};
 for(const phase of ['initial','reopened']) {
  const current=await launch(phase==='initial'?undefined:input,phase);
  if(phase==='initial')firstPid=child.pid; else assert.notEqual(child.pid,firstPid,'New process required');
  await hwp3Case(qa,phase);
  assert.deepEqual(current.pageErrors,[]);
  await page.screenshot({path:join(root,phase+'-completed.png')}); current.status='passed-scoped-function';
  await stopNormally();
  if(phase==='initial' && ext) input=join(root,'initial.'+ext);
 }
 if(app.key==='database') {assert.equal(hash(await readFile(input)),original);execFileSync('python',['-B',join(driver,'oracle.py'),'database',input,join(root,'database-oracle.json')],{stdio:'inherit'});}
 if(sourceInput){assert.deepEqual(await fingerprint(),Object.fromEntries(Object.entries(report.originalInput).filter(([k])=>k!=='path')),'Original HWP3 fingerprint changed');report.originalInput.unchanged=true;}
 report.afterNative=JSON.parse(await ps('inspect.ps1',['-Action','Baseline']));
 assert.deepEqual(report.afterNative.apps,[],'Unexpected Office app remained after both full exits');
 assert.deepEqual(report.afterNative.suitePaths,[],'Standalone operation created suite installation/resources');
 assert(report.afterNative.profiles.every(path=>basename(path)===app.identifier),'Standalone operation created another app or suite profile');
 report.shortPreflight={status:'passed-in-bounded-core-case',focusAndWindowsControl:true,normalFullQuit:true,newProcessReopen:true,scope:'Only native HWP3 source/prefix/UndoRedo/modern-copy/fullquit/newPID case; not full format'};
 report.status='passed-scoped-native-function';
} catch(error) {
 primaryError=error; report.status=/BLOCKED:/.test(String(error))?'blocked':'failed';report.error=String(error.stack||error);
 try {if(page)report.failureFocus=await focusSnapshot();await page?.screenshot({path:join(root,'failure.png')});report.failureVisibleText=await page?.locator('body').innerText();}catch{}
} finally {
 try {if(child?.pid && child.exitCode===null) {await action('Close').catch(()=>{});await sleep(1500);if(child.exitCode===null){await run('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});report.cleanup.forcedOwnedProcessTree=true;}}}catch(error){report.cleanup.processError=String(error);}
 await browser?.close().catch(()=>{});
 try{const residual=JSON.parse(await ps('inspect.ps1',['-Action','Residual','-Path',profile]));report.cleanup.residualOwnedWebviews=residual.processes;if(residual.processes.length)report.cleanup.webviewError='Owned WebView processes still running; profile retained';}catch(error){report.cleanup.webviewError=String(error);}
 if(mailChild){mailChild.stdin.end();const deadline=Date.now()+5000;while(mailChild.exitCode===null && Date.now()<deadline)await sleep(100);if(mailChild.exitCode===null){mailChild.kill();report.cleanup.mailError='Loopback server failed to close';}else if(mailChild.exitCode!==0){report.cleanup.mailError=`Loopback fixture crashed: ${mailChild.exitCode}`;}else{try{const serverReport=JSON.parse(await readFile(join(root,'mail/report.json'),'utf8'));assert(serverReport.serversClosed && serverReport.smtpDataRejected===0);report.cleanup.loopbackServerClosed=true;report.mailServer=serverReport;if(!primaryError)await oracle('email',join(root,'mail'));}catch(error){primaryError=error;report.status='failed-mail-oracle';report.error=String(error);}}}
 try {if(policyChanged)await ps('webview-policy.ps1',['-Phase','Restore','-Executable',app.executable,'-StatePath',policy]);report.cleanup.policyRestored=true;}catch(error){report.cleanup.policyError=String(error);}
 try {if(installed)execFileSync(join(install,'uninstall.exe'),['/S'],{windowsHide:true,timeout:60000});report.cleanup.ownedInstallUninstalled=true;}catch(error){report.cleanup.uninstallError=String(error);}
 report.cleanup.ownedAppExited=!child || child.exitCode!==null;
 if(report.cleanup.ownedAppExited && !report.cleanup.webviewError && report.baseline?.profiles?.length===0){
  try{await ps('cleanup-profile.ps1',['-Identifier',app.identifier,'-BaselinePath',join(root,'baseline.json'),'-ReportPath',join(root,'profile-cleanup.json')]);report.cleanup.ownedNativeProfilesDisposed=true;}catch(error){report.cleanup.nativeProfileError=String(error);}
 }
 // Never remove retained files while an app may still own them. Only our exact
 // mkdtemp prefix below the OS temp directory can be removed.
 if(report.cleanup.ownedAppExited && report.cleanup.policyRestored && !report.cleanup.processError && !report.cleanup.webviewError) {
  assert.equal(dirname(await realpath(temporary)),await realpath(tmpdir()));assert(basename(temporary).startsWith('oos-standalone23-'));
  try{await rm(temporary,{recursive:true,force:true});report.cleanup.ownedTemporaryProfileDisposed=true;}catch(error){report.cleanup.profileError=String(error);}
 }
 if(Object.keys(report.cleanup).some(k=>k.endsWith('Error')) && !primaryError){report.status='failed-cleanup';primaryError=Error('Native cleanup failed');}
 await writeFile(join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(primaryError)throw primaryError;
console.log(JSON.stringify({app:app.key,status:report.status,source:receipt.applicationCommit}));
