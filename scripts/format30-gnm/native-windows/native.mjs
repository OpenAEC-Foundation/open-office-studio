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
const SOURCE='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6',MARKER='GNM30 EDIT';
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
const require=createRequire(resolve('.local/gnm-native-driver/package.json'));const {chromium}=require('playwright');
// Retain the proven helper's exact mkdtemp containment guard and owned-profile identity checks.
const temporary=await mkdtemp(join(tmpdir(),'oos-standalone23-'));
const install=join(temporary,'installed'),profile=join(temporary,'webview-profile'),policy=join(root,'webview-policy-before.json');
const source=join(root,'source.gnumeric');
const report={schemaVersion:1,applicationCommit:APP,applicationTree:TREE,version:receipt.version,
 harnessCommit:process.env.OOS_GNM_NATIVE_HARNESS,package:receipt,status:'failed',steps:[],phases:[],cleanup:{},limitations:[],
 scope:'Canonical Windows suite native GNM/Gnumeric through real file picker and production IPC; no standalone/release approval'};
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
function oracle(file,marker=false){
 execFileSync('python',['-B',join(driver,'../oracle.py'),'--source',source,'--xlsx',file,...(marker?['--marker']:[]),'--report',file+'.oracle.json'],{stdio:'inherit',timeout:20000});
}
async function saveAs(filename,marker=false){
 const file=join(root,filename);await action('Focus');await page.keyboard.press('Control+Shift+s');
 const dialog=page.getByRole('dialog',{name:/^(Save as|Opslaan als)$/i});await dialog.waitFor();
 await dialog.locator('input').first().fill(filename);
 const click=dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();void click.catch(()=>{});
 await action('SaveDialog',['-Target',file,'-ExpectedName',filename]);await click;await fileReady(file);oracle(file,marker);
 record({phase:report.phases.at(-1).phase,nativeSaved:file,sha256:hash(await readFile(file)),marker,independentOracle:'passed'});return file;
}
async function openNative(file){
 await action('Focus');await page.keyboard.press('Control+o');await action('OpenDialog',['-Target',file]);
 const expected=basename(file).replace(/\.(gnm|gnumeric)$/i,'.xlsx');
 await page.locator('.office-tabnaam').filter({hasText:expected}).waitFor();
 await page.locator('.office-tab[data-soort="xlsx"]').waitFor();
 await page.locator('[data-testid="xlsx-formula-input"]:visible').waitFor();
 record({nativeFilePickerOpened:file,productionTab:expected,noBridgeInjection:true});
}
async function selectSheet(name){
 await page.getByRole('button',{name:/^(All sheets|Alle bladen)$/i}).click();
 const menu=page.locator('.rekenblad-menu[role="menu"]');await menu.waitFor();
 assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Sheet1','Sheet2']);
 await menu.getByRole('menuitem',{name,exact:true}).click();
}
async function cell(address){
 const name=page.locator('.rekenblad-naamvak');await focus(name,'name-box-'+address);await name.fill(address);await name.press('Enter');
 const formula=page.locator('[data-testid="xlsx-formula-input"]:visible');await formula.waitFor();return formula;
}
async function checkUi(marker=false){
 await selectSheet('Sheet1');const values={A1:'1',B1:'String1',A2:'2',B2:'String2',C1:'=2*3',C2:'=2+3',C3:'=2-3',C4:'=C1+C2'};
 const checked=[];
 for(const [address,wanted]of Object.entries(values)){
  const input=await cell(address);const actual=await input.inputValue();
  assert.equal(actual.replace(/\s/g,''),wanted.replace(/\s/g,''),`Actual native formula bar Sheet1!${address}`);checked.push({address,value:actual});
 }
 await selectSheet('Sheet2');const markerInput=await cell('A1');assert.equal(await markerInput.inputValue(),marker?MARKER:'');
 record({phase:report.phases.at(-1).phase,actualUiCells:checked,secondSheet:marker?MARKER:'empty'});
}
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
 // Use the exact committed original upstream bytes already accepted by the source oracle.
 const fixture=await readFile(join(driver,'../../../docs/tests/formatendekking/2026-11-23-gnm-proof/converter/files/gnm-P2-converter-proof/source.gnumeric'));
 assert.equal(fixture.length,2062);assert.equal(hash(fixture),SOURCE);await writeFile(source,fixture,{flag:'wx'});
 for(const ext of ['gnm','gnumeric']){
  const input=join(root,`GNM30-${ext}.${ext}`);await writeFile(input,fixture,{flag:'wx'});
  const current=await launch(ext+'-initial');firstPid=child.pid;await openNative(input);await checkUi();
  await page.screenshot({path:join(root,ext+'-opened.png')});
  const saved=await saveAs(ext+'-native.xlsx');
  await selectSheet('Sheet2');const edit=await cell('A1');await focus(edit,'second-sheet-edit');await edit.fill(MARKER);await edit.press('Enter');
  const before=hash(await readFile(saved));await page.keyboard.press('Control+s');await fileReady(saved,before);oracle(saved,true);
  await checkUi(true);await page.screenshot({path:join(root,ext+'-edited.png')});
  current.focusCtrlSavePreflight=true;current.status='passed';assert.deepEqual(current.pageErrors,[]);await stopNormally();
  const reopened=await launch(ext+'-reopened');assert.notEqual(child.pid,firstPid);await openNative(saved);await checkUi(true);
  await saveAs(ext+'-reopened.xlsx',true);await page.screenshot({path:join(root,ext+'-reopened.png')});
  reopened.status='passed';assert.deepEqual(reopened.pageErrors,[]);await stopNormally();
  assert.equal(hash(await readFile(input)),SOURCE);
 }
 assert.equal(hash(await readFile(source)),SOURCE);report.sourceUnchanged=true;report.status='passed-native-gnm-scoped';
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
