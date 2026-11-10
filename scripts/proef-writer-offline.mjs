/** Production app regression: blank-document preparation, offline edit/save and reopen.
 * The harness observes only the preparation acknowledgement on its MessagePort;
 * no diagnostic bridge is compiled into the application.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
const output=process.env.OFFICE_TEST_UIT ?? '.local/proef-writer-offline';await mkdir(output,{recursive:true});
const z=unzipSync(await readFile('public/templates/nieuw.docx'));
z['word/document.xml']=strToU8(strFromU8(z['word/document.xml']).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/,'$1<w:p><w:r><w:t>Offline integration document.</w:t></w:r></w:p>$2'));
const server=await preview({configFile:false,build:{outDir:process.argv[2] ?? process.env.OFFICE_TEST_DIST ?? 'dist'},preview:{host:'127.0.0.1',port:0,open:false}});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1400,height:1000},locale:'nl-NL'}),page=await context.newPage();
const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
try {
 await page.addInitScript(() => {
  const Channel = globalThis.MessageChannel, post = Worker.prototype.postMessage, ports = new WeakMap();
  const state = window.__offlineProof = { pending: 0, ready: 0, failures: [] };
  globalThis.MessageChannel = class extends Channel { constructor() { super(); ports.set(this.port2, this.port1); } };
  Worker.prototype.postMessage = function(data, transfer) {
   if (data?.openaec === "prepare-save-v1") {
    state.pending++;
    const port = ports.get(Array.isArray(transfer) ? transfer[0] : transfer?.transfer?.[0]);
    if (!port) throw new Error("Missing preparation port in browser probe");
    port.addEventListener("message", event => { state.pending--; if(event.data?.ok) state.ready++; else state.failures.push(String(event.data?.fout)); }, { once: true, capture: true });
    port.start();
   }
   return post.apply(this, arguments);
  };
 });
 await page.addInitScript(()=>localStorage.setItem('openaec-office-instellingen',JSON.stringify({taal:'nl',spelling:{controleren:false}})));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
 const warm=page.waitForResponse(r=>r.url().endsWith('/templates/nieuw.docx')&&r.status()===200);
 await page.locator('.office > input[type=file]').setInputFiles({name:'Offline.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(zipSync(z))});
 const input=page.locator('[data-testid=yrs-input]:visible');await input.waitFor();
 await (await warm).body();
 await page.waitForFunction(() => { const p=window.__offlineProof; if(p.failures.length)throw new Error(p.failures.join('; ')); return p.ready>0&&p.pending===0; });
 await page.waitForLoadState('networkidle');
 assert.equal(await page.evaluate(()=>Boolean(window.__writerApis||window.__writerWarmup||window.__writerSpelling)),false,'Diagnostic bridges must be absent from production');
 await context.setOffline(true);await input.focus();await page.keyboard.press('Control+Home');await page.keyboard.type('OFFLINE EDIT ');
 const download=page.waitForEvent('download');
 const dialog=page.getByRole('dialog',{name:'Opslaan als',exact:true});
 const route=Promise.race([download.then(()=> 'download'),dialog.waitFor().then(()=> 'dialog')]);
 await page.keyboard.press('Control+s');if(await route==='dialog')await dialog.getByRole('button',{name:'Opslaan',exact:true}).click();
 const bytes=await readFile(await (await download).path());await writeFile(`${output}/saved.docx`,bytes);
 const xml=strFromU8(unzipSync(bytes)['word/document.xml']);assert.match(xml,/OFFLINE EDIT/);assert.match(xml,/Offline integration document/);assert.deepEqual(errors,[]);
 await context.setOffline(false);await page.locator('.office > input[type=file]').setInputFiles({name:'Offline-heropend.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
 await page.getByRole('tab',{name:/Offline-heropend\.docx/}).waitFor();await page.locator('[data-testid=yrs-input]:visible').waitFor();
 const report={passed:true,blankTemplateWarmup:true,diagnosticBridgesAbsent:true,offlineEditedSave:true,downloadBytes:bytes.length,originalAndEditedText:true,reopened:true,errors};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.log(await page.locator('body').innerText());console.log(JSON.stringify({errors,failures}));await page.screenshot({path:`${output}/failure.png`});throw e;}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
