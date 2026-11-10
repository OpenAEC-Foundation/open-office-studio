import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {preview} from 'vite';
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(source,'3c2595ca22134bc776132a4790e3e6851d07196a');
const fixture=(anders=false)=>{
  const p=unzipSync(fs.readFileSync('public/templates/nieuw.docx')),xml=strFromU8(p['word/document.xml']);
  const sectie=xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0]??'';
  const run=(lang,text)=>`<w:r><w:rPr><w:lang w:val="${lang}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  const body=`<w:p>${run(anders?'de-DE':'nl-NL','Nederlands ')}${run('en-GB','English')}</w:p><w:p>${run(anders?'it-IT':'fr-FR','Bonjour')}</w:p><w:p>${run(anders?'en-US':'nl-NL','Nogmaals Nederlands')}</w:p>`;
  p['word/document.xml']=strToU8(xml.replace(/<w:body>[\s\S]*<\/w:body>/,`<w:body>${body}${sectie}</w:body>`));
  return Buffer.from(zipSync(p));
};
const server=await preview({configFile:false,build:{outDir:'.local/language-fixed-production'},preview:{host:'127.0.0.1',port:0}});
let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage(); page.setDefaultTimeout(120000);
  const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('openaec-office-instellingen',JSON.stringify({taal:'en',thema:'light'})));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const active='.office-tabpaneel:not([hidden])';
  const focus=async()=>{await page.locator(`${active} .canvas-page canvas:visible`).first().click({position:{x:200,y:100}});};
  const open=async(bytes,name)=>{
    await page.locator('input[type=file]').first().setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
    await page.waitForSelector(`${active} .canvas-page canvas:visible`);await page.evaluate(()=>document.fonts.ready);await focus();
  };
  const taal=async(name,expected)=>{
    await page.waitForFunction(v=>document.querySelector('.statusbalk-taal')?.textContent?.includes(v),expected,{timeout:20000});
    checks.push({name,expected,actual:await page.locator('.statusbalk-taal').innerText()});console.log(name,checks.at(-1).actual);
  };
  const grens=async(name,links)=>{
    await page.keyboard.press('Control+Home');
    for(let i=0;i<links;i++)await page.keyboard.press('ArrowRight');
    await taal(`${name} links`,'Dutch');await page.keyboard.press('ArrowRight');await taal(`${name} rechts`,'English');
  };
  await open(fixture(),'language-production.docx');
  assert.deepEqual(await page.evaluate(()=>['__writerApis','__writerSpelling','__writerLanguagePending','__appApis','__TAURI_INTERNALS__'].filter(k=>k in window)),[]);
  await page.keyboard.press('Control+Home');await taal('open','Dutch');
  await grens('oorspronkelijke taalgrens',10);
  await page.keyboard.press('Control+ArrowDown');await taal('volgende alinea','French');
  await page.keyboard.press('Control+End');await page.keyboard.type(' slot',{delay:50});await page.waitForTimeout(1200);await taal('na invoer en rust','Dutch');
  await page.keyboard.press('Control+Home');await page.keyboard.type('x');await page.waitForTimeout(1200);await grens('ingevoegd teken',11);
  await page.keyboard.press('Control+z');await page.waitForTimeout(1200);await grens('Undo',10);
  await page.keyboard.press('Control+y');await page.waitForTimeout(1200);await grens('Redo',11);
  await page.keyboard.press('Control+z');await page.waitForTimeout(1200);await grens('hersteld na Undo',10);
  await page.keyboard.press('Control+s');
  const dialog=page.getByRole('dialog',{name:'Save as',exact:true});await dialog.getByLabel(/File name/i).fill('language-production-saved');
  const down=page.waitForEvent('download');await dialog.getByRole('button',{name:'Save',exact:true}).click();
  const download=await down;await download.saveAs('.local/issue327-production-language.docx');
  const saved=fs.readFileSync('.local/issue327-production-language.docx'),xml=strFromU8(unzipSync(saved)['word/document.xml']);
  const text=[...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(([p])=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join(''));
  assert.deepEqual(text,['Nederlands English','Bonjour','Nogmaals Nederlands slot']);
  await open(saved,'language-production-reopened.docx');await page.keyboard.press('Control+Home');await taal('heropend','Dutch');await grens('heropende taalgrens',10);
  await page.keyboard.press('Control+ArrowDown');await taal('heropende tweede alinea','French');
  await open(fixture(true),'language-production-different.docx');await page.keyboard.press('Control+Home');await taal('ander document zelfde tekst/paraids','German');
  await page.keyboard.press('Control+ArrowDown');await taal('ander document tweede alinea','Italian');
  const tabs=page.locator('.office-tab[data-soort="docx"]');assert.equal(await tabs.count(),3);
  for(let i=0;i<2;i++){
    await tabs.nth(0).click();await focus();await grens(`eerste tab ${i}`,10);
    await tabs.nth(2).click();await focus();await page.keyboard.press('Control+Home');await taal(`derde tab ${i}`,'German');
  }
  assert.deepEqual(errors,[]);
  const result={source,platform:process.platform,browser:browser.version(),cpuRate:4,production:true,noBridge:true,checks,textExact:true,errors};
  fs.writeFileSync('.local/issue327-production-language.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({source,checks:checks.length,textExact:true,errors}));
} finally {await browser?.close();await new Promise((r,j)=>server.httpServer.close(e=>e?j(e):r()));}
