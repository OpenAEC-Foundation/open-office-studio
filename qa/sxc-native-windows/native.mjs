/** Unchanged canonical P2 suite, native chooser/IPC/editor/save and full restart. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {createWriteStream} from 'node:fs';
import {access,mkdir,mkdtemp,readFile,readdir,realpath,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';

assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','Never operate the user PC');
assert.equal(process.env.OPENAEC_CONVERSIE_PROGRAMMA,undefined);assert.equal(process.env.OPENAEC_CONVERSIE_PROFIEL,undefined);
const APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b',TREE='5a644e397ecc6af5452a49b6404edf953687d1b2';
const SOURCE='9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d';
const [packageDir,outputDir]=process.argv.slice(2);assert(packageDir&&outputDir);
const root=resolve(outputDir);await mkdir(root);const driver=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),run=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ps(name,args=[]){return (await run('pwsh',['-NoProfile','-File',join(driver,name),...args],{windowsHide:true,timeout:40000,maxBuffer:2*1024*1024})).stdout.trim();}
const receipt=JSON.parse(await readFile(join(packageDir,'package.json'),'utf8'));
assert.equal(receipt.applicationCommit,APP);assert.equal(receipt.applicationTree,TREE);assert.equal(receipt.version,'2026.48.1');
assert.equal(receipt.archiveSha256,'ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733');
assert.equal(receipt.executable,'open-office-studio.exe');assert.equal(receipt.identifier,'org.openaec.office-studio');
const installer=resolve(packageDir,receipt.installer.path);assert.equal(dirname(installer),resolve(packageDir));
const installerBytes=await readFile(installer);assert.equal(installerBytes.length,receipt.installer.bytes);assert.equal(hash(installerBytes),receipt.installer.sha256);
const require=createRequire(resolve('.local/sxc-native-driver/package.json'));const {chromium}=require('playwright');
// Retain the proven helper's exact mkdtemp containment guard and owned-profile identity checks.
const temporary=await mkdtemp(join(tmpdir(),'oos-standalone23-'));
const install=join(temporary,'installed'),profile=join(temporary,'webview-profile'),policy=join(root,'webview-policy-before.json');
const source=join(root,'calcshapes.sxc');
let sourceOracle;const config=JSON.parse(await readFile(join(driver,'fixture.json'),'utf8'));
assert.equal(config.source.sha256,SOURCE);assert.equal(config.applicationCommit,APP);assert.equal(config.applicationTree,TREE);
const report={schemaVersion:1,applicationCommit:APP,applicationTree:TREE,version:receipt.version,
 harnessCommit:process.env.OOS_SXC_NATIVE_HARNESS,package:receipt,status:'failed',steps:[],phases:[],cleanup:{},limitations:[],
 scope:'Canonical Windows suite native SXC cells plus separately strict drawing preservation through real file picker and production IPC; no standalone/release approval'};
let child,browser,page,port,installed=false,policyChanged=false,primaryError,firstPid;
const record=entry=>report.steps.push(entry);
async function action(name,extra=[]){
 const target=join(root,`${report.phases.length}-${name}-${report.steps.length}.json`);
 await ps('windows-actions.ps1',['-Action',name,'-OwnedPid',String(child.pid),'-ReportPath',target,...extra]);
 record(JSON.parse((await readFile(target,'utf8')).replace(/^\uFEFF/,'')));
}
async function focus(locator,label){
 await action('Focus');await locator.click();
 assert(await locator.evaluate(el=>el===document.activeElement||el.contains(document.activeElement)),`Actual ${label} must own focus`);
 record({focus:label,osAndRenderer:true,platformKeys:'Windows Control'});
}
async function fileReady(path,previousHash){
 let previous=-1,stable=0;const deadline=Date.now()+25000;
 while(Date.now()<deadline){try{const bytes=await readFile(path);if(bytes.length>0&&bytes.length===previous&&(!previousHash||hash(bytes)!==previousHash))stable++;else stable=0;previous=bytes.length;if(stable>=3)return;}catch{}await sleep(250);}
 throw Error('Native Save did not produce a stable real output with the required change');
}
function oracle(file,edited=false){
 execFileSync('python',['-B',join(driver,'oracle.py'),'audit','--source',source,'--out',root,'--xlsx',file,...(edited?['--edited']:[])],{stdio:'inherit',timeout:30000});
 const result=JSON.parse(execFileSync('python',['-B','-c',"import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))",join(root,basename(file,'.xlsx')+'-oracle.json')],{encoding:'utf8',timeout:10000}));
 assert(result.cells.passed);report.preservationCases??=[];report.preservationCases.push({file:basename(file),sha256:result.sha256,edited,cellsPassed:true,preservationPassed:result.preservation.passed,differences:result.preservation.differences});
}
async function saveAs(filename,edited=false){
 const file=join(root,filename);await action('Focus');await page.keyboard.press('Control+Shift+s');
 const dialog=page.getByRole('dialog',{name:/^(Save as|Opslaan als)$/i});await dialog.waitFor();
 const proposal=await dialog.locator('input[type="radio"]:checked').inputValue();
 assert.equal(proposal,'xlsx','Actual Save As must suggest XLSX without driver format selection');
 record({actualDefaultSaveProposal:proposal,phase:report.phases.at(-1).phase});
 await dialog.locator('input').first().fill(filename);
 const click=dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();void click.catch(()=>{});
 await action('SaveDialog',['-Target',file,'-ExpectedName',filename]);await click;await fileReady(file);oracle(file,edited);
 record({phase:report.phases.at(-1).phase,nativeSaved:file,sha256:hash(await readFile(file)),edited,independentOracle:'passed'});return file;
}
async function openNative(file){
 await action('Focus');await page.keyboard.press('Control+o');await action('OpenDialog',['-Target',file]);
 const expected=basename(file).replace(/\.sxc$/i,'.xlsx');
 await page.locator('.office-tabnaam').filter({hasText:expected}).waitFor();
 await page.locator('.office-tab[data-soort="xlsx"]').waitFor();
 await page.locator('[data-testid="xlsx-formula-input"]:visible').waitFor();
 record({nativeFilePickerOpened:file,productionTab:expected,noBridgeInjection:true});
}
async function selectSheet(name){
 await page.getByRole('button',{name:/^(All sheets|Alle bladen)$/i}).click();
 const menu=page.locator('.rekenblad-menu[role="menu"]');await menu.waitFor();
 assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Sheet1','Sheet2','Sheet3']);
 await menu.getByRole('menuitem',{name,exact:true}).click();
 await page.waitForFunction(name=>[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some(tab=>tab.textContent?.trim()===name),name);
 record({actualSelectedSheet:name,verifiedProductionAriaTab:true});
}
async function cell(address){
 const name=page.locator('.rekenblad-naamvak');await focus(name,'name-box-'+address);await name.fill(address);await name.press('Enter');
 const formula=page.locator('[data-testid="xlsx-formula-input"]:visible');await formula.waitFor();return formula;
}
async function sourceUi(){
 await selectSheet('Sheet1');const input=await cell('C13');assert.equal(await input.inputValue(),'Note attached');
 record({actualSourceCell:'Sheet1!C13',actualValue:await input.inputValue(),sourceFormulaCount:0});
}
async function editCell(address,text){const input=await cell(address);await focus(input,'edit-'+address);await input.fill(text);await input.press('Enter');}
async function editedUi(stage,wanted){
 await selectSheet('Sheet1');const text=await cell(config.edit.textCell);assert.equal(await text.inputValue(),wanted);
 const formula=await cell(config.edit.formulaCell);assert.equal(await formula.inputValue(),config.edit.formula);
 const target=page.locator('[data-oos-rastercel][aria-colindextext="I"][aria-rowindextext="1"]');await target.waitFor({state:'attached'});
 const label=await target.getAttribute('aria-label');assert(/(^|[^A-Za-z0-9_.])42($|[^A-Za-z0-9_.])/.test(label||''));
 await cell(config.edit.textCell);record({editStage:stage,actualText:wanted,actualFormula:config.edit.formula,actualComputedCellLabel:label,expectedValue:42});
 await page.screenshot({path:join(root,stage+'.png')});
}
async function drawingsUi(stage){
 await selectSheet('Sheet1');await cell('A1');await page.screenshot({path:join(root,stage+'-upper.png')});
 await cell('A24');await page.screenshot({path:join(root,stage+'-lower.png')});
 record({drawingObservation:stage,scope:'Actual native screenshots only; structural/XML oracle independently decides preservation, not a cell pass'});
}
async function gridHistory(key){
 await selectSheet('Sheet1');await cell(config.edit.textCell);
 const target=page.locator('[data-oos-rastercel][aria-colindextext="H"][aria-rowindextext="1"]');const box=await target.boundingBox();assert(box&&box.width&&box.height);
 await action('Focus');await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 const state=await page.evaluate(()=>{const e=document.activeElement,g=document.querySelector('[data-testid="xlsx-scroll"]');return {tag:e?.tagName,role:e?.getAttribute('role'),gridOwns:!!g&&(e===g||g.contains(e))};});
 assert(state.gridOwns,'BLOCKED: visible grid click did not establish native history focus');
 record({actualGridFocus:state,physicalCanvasPoint:{x:box.x+box.width/2,y:box.y+box.height/2},platformKey:key});await page.keyboard.press(key);
}
async function snapshot(file,name,edited=false){const path=join(root,name),bytes=await readFile(file);await writeFile(path,bytes,{flag:'wx'});oracle(path,edited);record({actualNativeSaveSnapshot:name,edited,sha256:hash(bytes)});}
async function launch(phase){
 child=spawn(join(install,receipt.executable),[],{cwd:install,windowsHide:false,env:{...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,WEBVIEW2_USER_DATA_FOLDER:profile},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(createWriteStream(join(root,phase+'.stdout.txt')));child.stderr.pipe(createWriteStream(join(root,phase+'.stderr.txt')));
 let launchError;child.on('error',error=>launchError=error);
 const current={phase,pid:child.pid,status:'running',pageErrors:[]};report.phases.push(current);
 const deadline=Date.now()+75000;
 while(Date.now()<deadline){if(launchError)throw launchError;if(child.exitCode!==null)throw Error(`App exited before readiness: ${child.exitCode}`);try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1500});break;}catch{await sleep(400);}}
 assert(browser,'BLOCKED: attributable actual native WebView2 CDP unavailable');
 for(let n=0;n<60;n++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>/^(https?:\/\/tauri\.localhost|tauri:|http:\/\/localhost)/.test(p.url()));if(page)break;await sleep(200);}
 assert(page,'BLOCKED: no owned Tauri page');page.setDefaultTimeout(25000);current.pageUrl=page.url();page.on('pageerror',error=>current.pageErrors.push(String(error)));
 await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
 // Read-only identity/status calls only. Document opening/editing/saving is UI.
 current.nativeMetadata=await page.evaluate(async()=>({identifier:await window.__TAURI_INTERNALS__.invoke('plugin:app|identifier'),version:await window.__TAURI_INTERNALS__.invoke('plugin:app|version'),name:await window.__TAURI_INTERNALS__.invoke('plugin:app|name')}));
 assert.equal(current.nativeMetadata.identifier,receipt.identifier);assert.equal(current.nativeMetadata.version,receipt.version);assert.equal(current.nativeMetadata.name,receipt.title);
 current.process=JSON.parse(await ps('inspect.ps1',['-Action','Process','-OwnedPid',String(child.pid)]));
 assert.equal((await realpath(current.process.path)).toLowerCase(),(await realpath(join(install,receipt.executable))).toLowerCase());
 await access(profile);current.ownWebviewProfile={path:profile,entries:await readdir(profile)};assert(current.ownWebviewProfile.entries.length);
 current.runtime=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('conversie_status'));
 assert.equal(current.runtime.bron,'meegeleverd');assert.equal(current.runtime.profiel,'veilig');
 const runtime=await realpath(current.runtime.pad),inside=relative(await realpath(install),runtime);
 assert(inside&&inside!=='..'&&!inside.startsWith('..\\')&&!isAbsolute(inside),'Converter must be inside own installed canonical package');
 current.runtimeExecutable=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',runtime]));
 await action('Focus');return current;
}
async function stopNormally(){
 await action('Close');const deadline=Date.now()+15000;while(child.exitCode===null&&Date.now()<deadline)await sleep(200);
 assert.notEqual(child.exitCode,null,'BLOCKED: normal full exit failed; no restart pass');report.phases.at(-1).normalFullExit=true;
 await browser?.close().catch(()=>{});browser=undefined;page=undefined;
 let residual;const until=Date.now()+5000;
 do{residual=JSON.parse(await ps('inspect.ps1',['-Action','Residual','-Path',profile]));if(!residual.processes.length)break;await sleep(200);}while(Date.now()<until);
 assert.deepEqual(residual.processes,[],'BLOCKED: owned WebView remained before restart');report.phases.at(-1).ownedWebviewsExited=true;
}
try{
 report.baseline=JSON.parse(await ps('inspect.ps1',['-Action','Baseline']));await writeFile(join(root,'baseline.json'),JSON.stringify(report.baseline,null,2)+'\n');
 assert.deepEqual(report.baseline.profiles,[]);assert.deepEqual(report.baseline.apps,[]);assert.deepEqual(report.baseline.suitePaths,[]);
 report.installer=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',installer]));assert(['Valid','NotSigned'].includes(report.installer.signature));
 execFileSync(installer,['/S',`/D=${install}`],{windowsHide:true,timeout:300000,stdio:'inherit'});installed=true;
 await access(join(install,receipt.executable));await access(join(install,'uninstall.exe'));
 report.executable=JSON.parse(await ps('inspect.ps1',['-Action','Executable','-Path',join(install,receipt.executable)]));
 assert.equal(report.executable.sha256,receipt.payloadExecutable.sha256,'Installed executable must equal independently extracted NSIS payload');
 report.payloadEqualsInstalled=true;
 assert(report.executable.productVersion?.startsWith(receipt.version));assert(['Valid','NotSigned'].includes(report.executable.signature));
 if(report.installer.signature==='NotSigned'||report.executable.signature==='NotSigned')report.limitations.push('Canonical P2 functional package is unsigned; signing/release acceptance remains separate');
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));port=listener.address().port;await new Promise(r=>listener.close(r));
 policyChanged=true;await ps('webview-policy.ps1',['-Phase','Enable','-Executable',receipt.executable,'-StatePath',policy,'-Port',String(port),'-ProfilePath',profile]);
 // Freeze source-only XML/drawing/cell/annotation expectations before the first import.
 execFileSync('python',['-B',join(driver,'oracle.py'),'source','--source',source,'--out',root],{stdio:'inherit',timeout:120000});
 sourceOracle=JSON.parse(await readFile(join(root,'source-oracle.json'),'utf8'));assert.equal(hash(await readFile(source)),SOURCE);
 assert.equal(sourceOracle.sourceCells,1);assert.equal(sourceOracle.sourceFormulas,0);
 const initial=await launch('preflight-initial');firstPid=child.pid;await openNative(source);await sourceUi();await drawingsUi('source-opened');
 const saved=await saveAs('sxc-working.xlsx');await snapshot(saved,'sxc-original.xlsx');
 initial.status='passed-original-cell-native-save';assert.deepEqual(initial.pageErrors,[]);await stopNormally();
 const current=await launch('editing');const editPid=child.pid;assert.notEqual(editPid,firstPid);await openNative(saved);await sourceUi();
 report.shortPreflight={status:'passed',focus:true,platformKeys:'Windows Control',actualNativeSave:true,normalFullQuit:true,newProcessPid:editPid,previousPid:firstPid};
 await selectSheet('Sheet1');await editCell(config.edit.formulaCell,config.edit.formula);await editCell(config.edit.textCell,config.edit.text);
 await editedUi('edit-applied',config.edit.text);await gridHistory('Control+z');await editedUi('edit-undo','');await gridHistory('Control+y');await editedUi('edit-redo',config.edit.text);
 const before=hash(await readFile(saved));await page.keyboard.press('Control+s');await fileReady(saved,before);oracle(saved,true);await snapshot(saved,'sxc-edited.xlsx',true);
 current.status='passed-native-cell-edit-undo-redo';assert.deepEqual(current.pageErrors,[]);await stopNormally();
 const reopened=await launch('reopened');assert.notEqual(child.pid,editPid);await openNative(saved);await sourceUi();await editedUi('edit-reopened',config.edit.text);await drawingsUi('saved-reopened');
 await saveAs('sxc-reopened.xlsx',true);reopened.status='passed-native-cell-persistence';assert.deepEqual(reopened.pageErrors,[]);await stopNormally();
 assert.equal(hash(await readFile(source)),SOURCE);report.sourceUnchanged=true;report.nativeOperationsPassed=true;
 const changed=report.preservationCases.filter(c=>!c.preservationPassed);
 if(changed.length){report.status='failed-strict-preservation';report.strictPreservationPassed=false;primaryError=Error('Native cell/UndoRedo/save/reopen operations passed, but independent source drawing/annotation preservation differs; retained evidence is not full SXC acceptance');report.error=String(primaryError);}
 else{report.status='passed-native-sxc-selected-preservation';report.strictPreservationPassed=true;}

}catch(error){primaryError=error;report.status=/BLOCKED:/.test(String(error))?'blocked':'failed';report.error=String(error.stack||error);try{await page?.screenshot({path:join(root,'failure.png')});report.failureVisibleText=await page?.locator('body').innerText();}catch{}}
finally{
 try{if(child?.pid&&child.exitCode===null){await action('Close').catch(()=>{});await sleep(1500);if(child.exitCode===null){await run('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});report.cleanup.forcedOwnedProcessTree=true;}}}catch(error){report.cleanup.processError=String(error);}
 await browser?.close().catch(()=>{});
 try{const residual=JSON.parse(await ps('inspect.ps1',['-Action','Residual','-Path',profile]));report.cleanup.residualOwnedWebviews=residual.processes;if(residual.processes.length)report.cleanup.webviewError='Owned WebViews remain; temporary files retained';}catch(error){report.cleanup.webviewError=String(error);}
 try{if(policyChanged)await ps('webview-policy.ps1',['-Phase','Restore','-Executable',receipt.executable,'-StatePath',policy]);report.cleanup.policyRestored=true;}catch(error){report.cleanup.policyError=String(error);}
 try{if(installed)execFileSync(join(install,'uninstall.exe'),['/S'],{windowsHide:true,timeout:60000});report.cleanup.ownedInstallUninstalled=true;}catch(error){report.cleanup.uninstallError=String(error);}
 report.cleanup.ownedAppExited=!child||child.exitCode!==null;
 if(report.cleanup.ownedAppExited&&!report.cleanup.webviewError&&report.baseline?.profiles?.length===0){try{await ps('cleanup-profile.ps1',['-Identifier',receipt.identifier,'-BaselinePath',join(root,'baseline.json'),'-ReportPath',join(root,'profile-cleanup.json')]);report.cleanup.ownedNativeProfilesDisposed=true;}catch(error){report.cleanup.nativeProfileError=String(error);}}
 if(report.cleanup.ownedAppExited&&report.cleanup.policyRestored&&!report.cleanup.processError&&!report.cleanup.webviewError){
  assert.equal(dirname(await realpath(temporary)),await realpath(tmpdir()));assert(basename(temporary).startsWith('oos-standalone23-'));
  try{await rm(temporary,{recursive:true,force:true});report.cleanup.ownedTemporaryProfileDisposed=true;}catch(error){report.cleanup.profileError=String(error);}
 }
 if(Object.keys(report.cleanup).some(k=>k.endsWith('Error'))&&!primaryError){report.status='failed-cleanup';primaryError=Error('Native cleanup failed');}
 await writeFile(join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(primaryError)throw primaryError;
console.log(JSON.stringify({status:report.status,applicationCommit:APP,platform:'Windows'}));
