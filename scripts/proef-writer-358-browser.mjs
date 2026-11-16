/** #358 production-route probe: genuine pointer/keys/downloaded DOCX; no SDK bridge. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.APPLICATION_COMMIT)assert.equal(source,process.env.APPLICATION_COMMIT);
const route=process.env.WRITER358_ROUTE??'/';
const dist=process.env.WRITER358_DIST??'dist';
const out=process.env.WRITER358_OUT??'.local/writer358-browser';await mkdir(out,{recursive:true});
const emulateMac=process.env.WRITER358_EMULATE_MAC==='1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const text=['Wrapped first '+('a word '.repeat(60))+'FIRST END','Wrapped middle '+('wrapping text '.repeat(60))+'MIDDLE END','Wrapped final '+('last paragraph '.repeat(60))+'FINAL END'];
const pkg=unzipSync(await readFile('public/templates/nieuw.docx'));
const xml=strFromU8(pkg['word/document.xml']);const section=xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0];assert(section);
pkg['word/document.xml']=strToU8(xml.replace(/<w:body>[\s\S]*<\/w:body>/,`<w:body>${text.map(t=>`<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('')}${section}</w:body>`));
const input=Buffer.from(zipSync(pkg));
const paragraphs=bytes=>[...strFromU8(unzipSync(bytes)['word/document.xml']).matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(([p])=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join(''));
const server=await preview({configFile:false,base:route,build:{outDir:dist},preview:{host:'127.0.0.1',port:0}});
let browser,page;
const report={source,route,dist,host:process.platform,emulatedMac:emulateMac,checks:[],errors:[],limits:['Production browser navigation only; no native-host claim','No renderer/theme changes or glyph acceptance']};
try{
 browser=await chromium.launch();page=await browser.newPage({viewport:{width:1200,height:850}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('openaec-office-instellingen',JSON.stringify({taal:'en',spelling:{controleren:false}})));
 if(emulateMac)await page.addInitScript(()=>Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${route}`);
 const platform=await page.evaluate(()=>navigator.platform);const mac=/Mac|iPod|iPhone|iPad/.test(platform);report.navigatorPlatform=platform;report.browser=browser.version();
 const mod=mac?'Meta':'Control',start=mac?'Meta+ArrowUp':'Control+Home',end=mac?'Meta+ArrowDown':'Control+End';
 const focus=async()=>{await page.locator('.office-tabpaneel:not([hidden]) .canvas-page canvas:visible').first().click({position:{x:125,y:104}});};
 const open=async(name)=>{
  await page.locator('input[type=file]').first().setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:input});
  // Panels stay mounted when hidden. Wait for the new active tab before
  // resolving a canvas, otherwise an old canvas handle can become hidden.
  await page.waitForFunction(name=>document.querySelector('.office-tabbalk [aria-selected=true]')?.textContent.includes(name),name);
  await page.evaluate(()=>document.fonts.ready);await focus();
 };
 const keys=async(k,n=1)=>{for(let i=0;i<n;i++)await page.keyboard.press(k);};
 let serial=0;
 const save=async(name,expected)=>{
  await page.waitForTimeout(250);
  const down=page.waitForEvent('download');await page.keyboard.press(mod+'+s');
  const dialog=page.getByRole('dialog',{name:'Save as',exact:true});
  const kind=await Promise.race([down.then(()=>'download'),dialog.waitFor().then(()=>'dialog')]);
  if(kind==='dialog'){
   await dialog.getByLabel(/File name/i).fill('writer358-'+(serial+1));await dialog.getByRole('button',{name:'Save',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
  }
  serial++;
  const bytes=await readFile(await(await down).path());const actual=paragraphs(bytes);
  report.checks.push({name,expected,actual,sha256:hash(bytes)});await writeFile(`${out}/${serial}.docx`,bytes);
  console.log(name);
  if(expected)assert.deepEqual(actual,expected,name);
  return actual;
 };
 await open('358 wrapped A.docx');await open('358 independent B.docx');
 const tabs=page.locator('.office-tab[data-soort="docx"]');assert.equal(await tabs.count(),2);
 await tabs.nth(0).click();await focus();
 assert.deepEqual(await page.evaluate(()=>['__writerApis','__writerLanguagePending','__appApis','__TAURI_INTERNALS__'].filter(k=>k in window)),[]);
 await keys(start);await page.keyboard.type('BEGIN ');await save('document start',['BEGIN '+text[0],...text.slice(1)]);
 await keys(mod+'+z');await save('start Undo restores',text);await focus();
 await keys(end);await page.keyboard.type(' END');await save('document end',[...text.slice(0,2),text[2]+' END']);
 await keys(mod+'+z');await save('end Undo restores',text);await focus();
 await keys(start);await keys('ArrowRight',11);await keys(mac?'Meta+Shift+ArrowDown':'Control+Shift+End');
 await save('selection to end preserves content',text);await page.keyboard.type('TO-END');
 await save('selection reaches document end',[text[0].slice(0,11)+'TO-END']);
 await keys(mod+'+z');await save('selection end Undo restores',text);await focus();
 await keys(end);await keys('ArrowLeft',11);await keys(mac?'Meta+Shift+ArrowUp':'Control+Shift+Home');
 await save('selection to start preserves content',text);await page.keyboard.type('TO-START');
 await save('selection reaches document start',['TO-START'+text[2].slice(-11)]);
 await keys(mod+'+z');await save('selection start Undo restores',text);await focus();
 await keys(start);await keys('ArrowRight',8);await keys('ArrowDown');await page.keyboard.type('~D~');
 const actual=await save('ordinary Down inside wrapped first paragraph',null);const offset=actual[0].indexOf('~D~');
 assert(offset>8&&offset<text[0].length);assert.deepEqual([actual[0].replace('~D~',''),...actual.slice(1)],text);report.plainDownOffset=offset;
 await keys(mod+'+z');await save('Down Undo restores',text);await focus();
 await keys(start);await keys('ArrowRight',8);await keys('ArrowDown');await keys('ArrowUp');await page.keyboard.type('~U~');
 await save('ordinary Down Up returns to first line',[text[0].slice(0,8)+'~U~'+text[0].slice(8),...text.slice(1)]);
 await keys(mod+'+z');await save('final A restored',text);
 await tabs.nth(1).click();await focus();await save('independent B untouched',text);
 assert.deepEqual(report.errors,[]);await page.screenshot({path:`${out}/final.png`});report.status='passed';
}catch(e){report.status='failed';report.error=String(e);if(page)await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw e;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(r=>server.httpServer.close(r));}
console.log(JSON.stringify({source,status:report.status,checks:report.checks.length,route,platform:report.navigatorPlatform,emulatedMac:emulateMac}));
