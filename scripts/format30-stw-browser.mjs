/** STW-only adaptation of proven GNM browser driver d21243acad54235e2674f7e89f44db75cf6bcb44; actual P2 browser UI. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';

const APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b';
const TREE='5a644e397ecc6af5452a49b6404edf953687d1b2';
const SOURCE='5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2';
const SOURCE_URL='https://raw.githubusercontent.com/LibreOffice/core/ded596096a767fa470eea8dfccd51c1af5c3dd54/qadevOOo/testdocs/report.stw';
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),APP);
assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),TREE);
const {verifyBuildReceipt}=await import(pathToFileURL(resolve('scripts/writer-proefbuild.mjs')));
const [prefix,output]=process.argv.slice(2);assert(prefix&&output);const root=resolve(output);await mkdir(root);
const response=await fetch(SOURCE_URL,{signal:AbortSignal.timeout(30000)});assert(response.ok);
const source=Buffer.from(await response.arrayBuffer());assert.equal(hash(source),SOURCE);assert.equal(source.length,11186);
await writeFile(join(root,'original.stw'),source);
const reports=[];
for(const [variant,route]of [['normal','/'],['hosted','/office/']]){
 const dir=join(root,variant);await mkdir(dir);const outDir=`${prefix}-${variant}`,receiptPath=outDir+'.build.json';
 let server,browser,context,page,primaryError;const errors=[],external=[],cleanup=[];
 const report={source:APP,tree:TREE,sourceSha256:SOURCE,platform:process.platform,route,status:'failed',cases:[]};reports.push(report);
 try{
  const build=await verifyBuildReceipt({outDir,route,receiptPath});
  report.buildReceiptSha256=hash(await readFile(receiptPath));report.buildFiles=Object.keys(build.files).length;
  await writeFile(join(dir,'build-receipt.json'),await readFile(receiptPath));
  server=await preview({configFile:false,base:route,cacheDir:join(dir,'preview-cache'),build:{outDir},preview:{host:'127.0.0.1',port:0,open:false}});
  browser=await chromium.launch({headless:true});context=await browser.newContext({locale:'en-GB',viewport:{width:1400,height:1100}});page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${route}`);assert.equal(new URL(page.url()).pathname,route);
  assert.equal(await page.evaluate(()=>typeof window.__TAURI_INTERNALS__),'undefined');
  await page.locator('.office > input[type=file]').setInputFiles({name:'Existing.docx',mimeType:'application/octet-stream',buffer:await readFile('public/templates/nieuw.docx')});
  await page.locator('.office-tabnaam').filter({hasText:'Existing.docx'}).waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  await page.locator('.canvas-page canvas:visible').first().click();assert(await input.evaluate(el=>el===document.activeElement));
  await page.keyboard.type('STW30 BROWSER PRESERVE');
  await page.waitForFunction(()=>{const b=document.querySelector('.office-snelknop:has(.lucide-save-all)');return b&&!b.disabled;});
  async function save(name){
   await input.focus();await page.keyboard.press('Control+Shift+s');
   const dialog=page.getByRole('dialog',{name:/^(Save as|Opslaan als)$/i});await dialog.waitFor();
   const download=page.waitForEvent('download');void download.catch(()=>{});
   await dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();
   const bytes=await readFile(await(await download).path());await writeFile(join(dir,name),bytes);return bytes;
  }
  const before=await save('before.docx'),tabs=await page.locator('.office-tabnaam').allTextContents();
  const active=await page.locator('.office-tab[aria-selected="true"]').getAttribute('id');
  await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
  for(const ext of ['stw']){
   await page.locator('.office > input[type=file]').setInputFiles({name:`Source.${ext}`,mimeType:'application/octet-stream',buffer:source});
   const alert=page.locator('.office-melding[data-toon="fout"]').filter({hasText:ext.toUpperCase()});await alert.waitFor();
   const message=await alert.innerText();assert.match(message,/desktop/i);assert.match(message,/DOCX/);
   assert.deepEqual(await page.locator('.office-tabnaam').allTextContents(),tabs);
   assert.equal(await page.locator('.office-tab[aria-selected="true"]').getAttribute('id'),active);
   const item={ext,message,tabsPreserved:true,activePreserved:true};report.cases.push(item);
   try{await alert.screenshot({path:join(dir,ext+'-visible-message.png'),animations:'disabled',timeout:3000});item.messageImage=true;}catch(error){item.messageImage=false;item.imageLimitation=String(error);}
   await alert.locator('.office-melding-sluiten').click();
  }
  const after=await save('after.docx'),beforeXml=unzipSync(before)['word/document.xml'],afterXml=unzipSync(after)['word/document.xml'];
  assert(strFromU8(beforeXml).includes('STW30 BROWSER PRESERVE'));assert.deepEqual(afterXml,beforeXml);
  await page.screenshot({path:join(dir,'retained-document.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(report.cases.every(item=>item.messageImage),'Visible STW advice evidence required');
  await verifyBuildReceipt({outDir,route,receiptPath});assert.equal(hash(source),SOURCE);
  Object.assign(report,{noTauri:true,documentXmlPreserved:true,beforeSha256:hash(before),afterSha256:hash(after),documentXmlSha256:hash(beforeXml),sourceUnchanged:true,errors,externalRequests:external});
 }catch(error){primaryError=error;report.error=String(error.stack||error);try{await page?.screenshot({path:join(dir,'failure.png')});}catch{}}
 finally{
  for(const [name,close]of [['context',()=>context?.close()],['browser',()=>browser?.close()],['server',()=>server?.close()]])try{await close();}catch(error){cleanup.push(`${name}: ${error}`);}
  report.cleanup={contextClosed:!!context&&!cleanup.length,browserClosed:!!browser&&!browser.isConnected(),serverClosed:!!server&&!server.httpServer.listening,errors:cleanup};
  report.status=!primaryError&&!cleanup.length?'passed':'failed';await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 if(primaryError)throw primaryError;assert.deepEqual(cleanup,[]);
}
await writeFile(join(root,'report.json'),JSON.stringify({source:APP,tree:TREE,harnessCommit:process.env.OOS_STW_HARNESS_COMMIT,reports,status:'passed',scope:'Actual supported browser routes, runtime limitation and retained existing document; no native conversion claim'},null,2)+'\n');
