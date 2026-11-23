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
const SOURCE='ff735a1a20c28e39e8349d46e5a531e6e6cde24f50f7aaa8d92e408e4a344d4c';
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
const require=createRequire(resolve('.local/stc-native-driver/package.json'));const {chromium}=require('playwright');
// Retain the proven helper's exact mkdtemp containment guard and owned-profile identity checks.
const temporary=await mkdtemp(join(tmpdir(),'oos-standalone23-'));
const install=join(temporary,'installed'),profile=join(temporary,'webview-profile'),policy=join(root,'webview-policy-before.json');
const source=join(root,'carnet de notes.stc');
let sourceOracle;const config=JSON.parse(await readFile(join(driver,'fixture/fixture.json'),'utf8'));
assert.equal(config.source.sha256,SOURCE);assert.equal(config.application.commit,APP);assert.equal(config.application.tree,TREE);
const report={schemaVersion:1,applicationCommit:APP,applicationTree:TREE,version:receipt.version,
 harnessCommit:process.env.OOS_STC_NATIVE_HARNESS,package:receipt,status:'failed',steps:[],phases:[],cleanup:{},limitations:[],
 scope:'Canonical Windows suite native STC template through real file picker and production IPC; no standalone/release approval'};
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
 execFileSync('python',['-B',join(driver,'fixture/oracle.py'),'xlsx','--source',source,'--out',root,'--xlsx',file,...(edited?['--edited']:[])],{stdio:'inherit',timeout:20000});
}
async function saveAs(filename,edited=false,key='Control+Shift+s'){
 const file=join(root,filename);await action('Focus');await page.keyboard.press(key);
 const dialog=page.getByRole('dialog',{name:/^(Save as|Opslaan als)$/i});await dialog.waitFor();
 const proposal=await dialog.locator('input[type="radio"]:checked').inputValue();
 assert.equal(proposal,'xlsx','Actual Save As must suggest XLSX without driver format selection');
 record({actualDefaultSaveProposal:proposal,phase:report.phases.at(-1).phase});
 await dialog.locator('input').first().fill(filename);
 const click=dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();void click.catch(()=>{});
 await action('SaveDialog',['-Target',file,'-ExpectedName',filename]);await click;await fileReady(file);oracle(file,edited);
 record({phase:report.phases.at(-1).phase,nativeSaved:file,sha256:hash(await readFile(file)),edited,saveKey:key,independentOracle:'passed'});return file;
}
async function openNative(file){
 await action('Focus');await page.keyboard.press('Control+o');await action('OpenDialog',['-Target',file]);
 let expected;
 if(file.endsWith('.stc')){
  const name=page.locator('.office-tab[data-soort="xlsx"] .office-tabnaam');await name.waitFor();expected=(await name.innerText()).trim();
  assert(/^(Untitled|Naamloos) [1-9][0-9]*\.xlsx$/.test(expected),'Template must create an actual untitled XLSX, not attach to original source');
  report.templateAsNew={actualTabName:expected,originalFilename:basename(file),newUntitledName:true,sourceSha256:hash(await readFile(source))};
 }else{expected=basename(file);await page.locator('.office-tabnaam').filter({hasText:expected}).waitFor();}
 await page.locator('[data-testid="xlsx-formula-input"]:visible').waitFor();
 record({nativeFilePickerOpened:file,productionTab:expected,noBridgeInjection:true,template:file.endsWith('.stc')});
}
async function selectSheet(name){
 await page.getByRole('button',{name:/^(All sheets|Alle bladen)$/i}).click();
 const menu=page.locator('.rekenblad-menu[role="menu"]');await menu.waitFor();
 assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),sourceOracle.sheets.map(s=>s.name));
 await menu.getByRole('menuitem',{name,exact:true}).click();
 await page.waitForFunction(name=>[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some(tab=>tab.textContent?.trim()===name),name);
 record({actualSelectedSheet:name,verifiedProductionAriaTab:true});
}
async function cell(address){
 const name=page.locator('.rekenblad-naamvak');await focus(name,'name-box-'+address);await name.fill(address);await name.press('Enter');
 const formula=page.locator('[data-testid="xlsx-formula-input"]:visible');await formula.waitFor();return formula;
}
async function editCell(address,text){const input=await cell(address);await focus(input,'edit-'+address);await input.fill(text);await input.press('Enter');}
async function headerUi(){
 await selectSheet(config.edit.sheet);const headers=[];
 for(const [address,expected]of [['H3','Moyenne brute'],['I3','Moyenne arrondie']]){const input=await cell(address);assert.equal(await input.inputValue(),expected);headers.push({address,text:expected});}
 record({nativeSourceHeaders:headers,sheetCount:sourceOracle.sheets.length});
}
async function label(address){
 await cell(address);const match=/^([A-Z]+)([0-9]+)$/.exec(address);assert(match);
 const target=page.locator(`[data-oos-rastercel][aria-colindextext="${match[1]}"][aria-rowindextext="${match[2]}"]`);await target.waitFor({state:'attached'});
 return await target.getAttribute('aria-label');
}
function displayNumber(label,address,expected){
 const value=Number(label.replace(new RegExp('^'+address+',\\s*'),'').replace(/, (selected|geselecteerd)$/,'').replace(/\s/g,'').replace(',','.'));
 assert(Number.isFinite(value),`Native ${address} has no numeric display: ${label}`);
 const allowed=Array.from({length:12},(_,p)=>Number(expected.toFixed(p+1)));
 assert(Math.abs(value-expected)<1e-10||allowed.includes(value),`Displayed ${address} ${value} does not match source-derived value ${expected} under decimal display rounding`);
 return value;
}
async function nameUi(stage,wanted){
 await selectSheet(config.edit.nameSheet);const input=await cell(config.edit.nameCell);assert.equal(await input.inputValue(),wanted);
 const direct=await label(config.edit.nameCell);assert(direct.includes(wanted));
 await selectSheet(config.edit.sheet);const linked=await label('A5');assert(linked.includes(wanted),`Native linked A5 must display ${wanted}: ${linked}`);
 record({nameStage:stage,actualNameInput:wanted,directCellLabel:direct,linkedCellLabel:linked});
 await page.screenshot({path:join(root,stage+'.png')});
}
async function weightedUi(stage){
 await selectSheet(config.edit.sheet);const inputs=[];
 for(const [address,expected]of Object.entries({...config.edit.coefficients,...config.edit.grades})){
  const input=await cell(address),actual=await input.inputValue();assert.equal(Number(actual),expected);inputs.push({address,actual});
 }
 const h=await cell(config.edit.weightedCell),hFormula=await h.inputValue();assert(/SUMPRODUCT/i.test(hFormula)&&/SUMIF/i.test(hFormula));
 const hLabel=await label(config.edit.weightedCell),hDisplay=displayNumber(hLabel,config.edit.weightedCell,sourceOracle.expected.weighted.value);
 const i=await cell(config.edit.roundedCell),iFormula=await i.inputValue();assert(/MROUND|GETMROUND/i.test(iFormula));
 const iLabel=await label(config.edit.roundedCell),iDisplay=displayNumber(iLabel,config.edit.roundedCell,sourceOracle.expected.rounded.value);
 record({weightedStage:stage,actualInputs:inputs,hFormula,hLabel,hDisplay,iFormula,iLabel,iDisplay,expectedWeighted:sourceOracle.expected.weighted.value,expectedRounded:sourceOracle.expected.rounded.value});
 await page.screenshot({path:join(root,stage+'.png')});
}
async function gridHistory(key){
 await selectSheet(config.edit.nameSheet);await cell(config.edit.nameCell);
 const target=page.locator('[data-oos-rastercel][aria-colindextext="A"][aria-rowindextext="5"]');const box=await target.boundingBox();assert(box&&box.width&&box.height);
 await action('Focus');await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 const state=await page.evaluate(()=>{const e=document.activeElement,g=document.querySelector('[data-testid="xlsx-scroll"]');return {tag:e?.tagName,role:e?.getAttribute('role'),gridOwns:!!g&&(e===g||g.contains(e))};});
 assert(state.gridOwns,'BLOCKED: real visible name-grid click did not establish keyboard focus for native Undo/Redo');
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
 // Fetch exact original historical STC; its embedded PDL notice remains untouched.
 execFileSync('python',['-B',join(driver,'fixture/oracle.py'),'source','--source',source,'--out',root],{stdio:'inherit',timeout:90000});
 sourceOracle=JSON.parse(await readFile(join(root,'source-oracle.json'),'utf8'));assert.equal(hash(await readFile(source)),SOURCE);
 assert.equal(sourceOracle.sheets.length,6);assert.equal(sourceOracle.sheets.reduce((n,s)=>n+Object.values(s.cells).filter(c=>c.formula!==null).length,0),854);
 const nameSource=sourceOracle.sheets.find(s=>s.name===config.edit.nameSheet).cells[config.edit.nameCell].text;
 const initial=await launch('template-preflight');firstPid=child.pid;await openNative(source);await headerUi();
 await page.screenshot({path:join(root,'stc-template-new.png')});
 const saved=await saveAs('stc-working.xlsx',false,'Control+s');report.templateAsNew.firstCtrlSRequiredSaveAs=true;await snapshot(saved,'stc-original.xlsx');
 initial.status='passed-template-new-save-preflight';assert.deepEqual(initial.pageErrors,[]);await stopNormally();
 const current=await launch('editing');const editPid=child.pid;assert.notEqual(editPid,firstPid);await openNative(saved);await headerUi();
 report.shortPreflight={status:'passed',focus:true,platformKeys:'Windows Control',actualNativeSave:true,normalFullQuit:true,newProcessPid:editPid,previousPid:firstPid,templateAsNew:true};
 await selectSheet(config.edit.sheet);
 for(const [address,value]of Object.entries({...config.edit.coefficients,...config.edit.grades}))await editCell(address,String(value));
 await selectSheet(config.edit.nameSheet);await editCell(config.edit.nameCell,config.edit.nameValue);
 await weightedUi('weighted-edited');await nameUi('name-edited',config.edit.nameValue);
 await gridHistory('Control+z');await nameUi('name-undo',nameSource);
 await gridHistory('Control+y');await nameUi('name-redo',config.edit.nameValue);await weightedUi('weighted-redo');
 const before=hash(await readFile(saved));await page.keyboard.press('Control+s');await fileReady(saved,before);oracle(saved,true);await snapshot(saved,'stc-edited.xlsx',true);
 current.status='passed-weighted-name-undo-redo';assert.deepEqual(current.pageErrors,[]);await stopNormally();
 const reopened=await launch('reopened');assert.notEqual(child.pid,editPid);await openNative(saved);await headerUi();
 await weightedUi('weighted-reopened');await nameUi('name-reopened',config.edit.nameValue);
 await saveAs('stc-reopened.xlsx',true);await page.screenshot({path:join(root,'stc-saved-reopened.png')});
 reopened.status='passed-six-sheets-reopened';assert.deepEqual(reopened.pageErrors,[]);await stopNormally();
 assert.equal(hash(await readFile(source)),SOURCE);report.sourceUnchanged=true;report.status='passed-native-stc-scoped';

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
