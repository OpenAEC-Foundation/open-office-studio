/** Existing, actually advertised P5 Go To bookmarks; no bookmark-management API. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {testNativeFindReplace} from './windows-find-replace-case-20261124.mjs';

export async function testNativeBookmarks(context) {
  const file=join(context.out,'Bookmark native.docx'),ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  async function snapshot() {
    const b=await readFile(file),doc=new DOMParser().parseFromString(strFromU8(unzipSync(b)['word/document.xml']),'application/xml');
    function paragraph(p) {
      let text='';const starts=new Map(),marks={};
      function visit(n){
        if(n.localName==='t'){text+=n.textContent;return;}
        if(n.localName==='bookmarkStart'){const m={name:n.getAttributeNS(ns,'name'),id:n.getAttributeNS(ns,'id'),start:text.length};starts.set(m.id,m);marks[m.name]=m;}
        if(n.localName==='bookmarkEnd'){const m=starts.get(n.getAttributeNS(ns,'id'));assert(m,'Bookmark end must have preceding start in its paragraph');m.end=text.length;}
        for(const c of Array.from(n.childNodes??[]))visit(c);
      }
      visit(p);return {text,marks};
    }
    const body=doc.getElementsByTagNameNS(ns,'body')[0];
    const paras=Array.from(body.childNodes).filter(n=>n.localName==='p').map(paragraph);
    const marked=paras.find(p=>p.marks.BodyTarget);assert(marked,'Named body bookmark must survive serialization');
    const cells=Array.from(body.getElementsByTagNameNS(ns,'tc')).map(c=>paragraph(c.getElementsByTagNameNS(ns,'p')[0]));
    assert(cells[0].marks.CellTarget,'Named table bookmark must survive serialization');
    for(const m of [marked.marks.BodyTarget,cells[0].marks.CellTarget])assert(Number.isInteger(m.end)&&m.end>=m.start,'Paired bookmark boundaries retained');
    return {sha256:createHash('sha256').update(b).digest('hex'),body:marked.text,bodyMark:marked.marks.BodyTarget,cells:cells.map(c=>c.text),cellMark:cells[0].marks.CellTarget};
  }
  async function focusReady(page){await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));}
  async function open(page) {
    await focusReady(page);await page.keyboard.press('Control+g');
    const d=page.getByRole('dialog',{name:'Go To',exact:true});
    await d.getByRole('option',{name:'Bookmark',exact:true}).click();
    await context.waitFor(async()=>await d.locator('.tw-ganaar-lijst button').count()===2,'Exactly two user bookmarks must be offered');
    assert.deepEqual((await d.locator('.tw-ganaar-lijst button').allTextContents()).map(s=>s.trim()).sort(),['BodyTarget','CellTarget']);return d;
  }
  async function go(page,name){const d=await open(page);await d.getByRole('button',{name,exact:true}).dblclick();await d.waitFor({state:'hidden'});await focusReady(page);}
  async function saved(page,body,cells) {
    await focusReady(page);await page.keyboard.press('Control+s');
    return context.waitFor(async()=>{const s=await snapshot();return s.body===body&&JSON.stringify(s.cells)===JSON.stringify(cells)?s:null;},'Actual saved DOCX body/cells must match independent bookmark target expectations');
  }
  async function dismiss(page){await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Go To',exact:true}).waitFor({state:'hidden'});await focusReady(page);}
  await testNativeFindReplace({...context,planPath:'docs/tests/windows-writer-bookmarks-20261124/plan.json',
    inspectInitial:async({page,evidence})=>{
      const initial=await snapshot();assert.equal(initial.bodyMark.start,5);assert.equal(initial.cellMark.start,5);
      const d=await open(page);evidence.steps.push({name:'Fresh input exposes exactly two user bookmarks and hides three source internal Word bookmarks',passed:true,offered:await d.locator('.tw-ganaar-lijst button').allTextContents(),input:initial});await dismiss(page);
    },
    runCases:async c=>{
      await c.page.locator('.tw-zoek-sluit').click();await focusReady(c.page);
      const base=c.plan.baseline;let s=await snapshot();assert.equal(s.bodyMark.start,5);assert.equal(s.cellMark.start,5);
      await go(c.page,'BodyTarget');await c.page.keyboard.type('BODY_');await saved(c.page,'BODY BODY_target tail',base);
      await c.page.keyboard.press('Control+z');await saved(c.page,c.plan.bodyInitial,base);
      await c.page.keyboard.press('Control+y');await saved(c.page,'BODY BODY_target tail',base);
      await c.page.keyboard.press('Control+z');s=await saved(c.page,c.plan.bodyInitial,base);assert.equal(s.bodyMark.start,5);
      c.evidence.steps.push({name:'Body bookmark navigates to exact original offset5; real typing/Undo/Redo verified in saved XML',passed:true});
      await go(c.page,'CellTarget');await c.page.keyboard.type('CELL_');const changed=['CELL CELL_target tail',...base.slice(1)];await saved(c.page,c.plan.bodyInitial,changed);
      await c.page.keyboard.press('Control+z');await saved(c.page,c.plan.bodyInitial,base);
      await c.page.keyboard.press('Control+y');await saved(c.page,c.plan.bodyInitial,changed);
      await c.page.keyboard.press('Control+z');s=await saved(c.page,c.plan.bodyInitial,base);assert.equal(s.cellMark.start,5);
      c.evidence.steps.push({name:'Table-cell bookmark targets correct story/offset5; typing/Undo/Redo preserve unrelated body/cells',passed:true});
      await c.page.keyboard.press('Control+g');
      const tableDialog=c.page.getByRole('dialog',{name:'Go To',exact:true});await tableDialog.getByRole('option',{name:'Table',exact:true}).click();
      await context.waitFor(async()=>await tableDialog.locator('.tw-ganaar-lijst button').count()===1,'Exactly the fixture table is offered');
      await tableDialog.getByRole('textbox').click();await c.page.keyboard.press('Control+a');await c.page.keyboard.type('1');
      await tableDialog.getByRole('button',{name:'Go To',exact:true}).click();await tableDialog.waitFor({state:'hidden'});await focusReady(c.page);
      await c.page.keyboard.type('TABLE_');const tableChanged=['TABLE_CELL target tail',...base.slice(1)];s=await saved(c.page,c.plan.bodyInitial,tableChanged);assert.equal(s.cellMark.start,11);
      await c.page.keyboard.press('Control+z');s=await saved(c.page,c.plan.bodyInitial,base);assert.equal(s.cellMark.start,5);
      c.evidence.steps.push({name:'Numeric Go To Table1 targets first cell offset0; real edit/Undo verifies table story and bookmark shift',passed:true});
      await go(c.page,'BodyTarget');await c.page.keyboard.press('Home');await c.page.keyboard.type('SHIFT_');s=await saved(c.page,'SHIFT_BODY target tail',base);assert.equal(s.bodyMark.start,11);
      await go(c.page,'BodyTarget');await c.page.keyboard.type('LIVE_');await saved(c.page,'SHIFT_BODY LIVE_target tail',base);
      await c.page.keyboard.press('Control+z');await saved(c.page,'SHIFT_BODY target tail',base);
      await c.page.keyboard.press('Control+z');s=await saved(c.page,c.plan.bodyInitial,base);assert.equal(s.bodyMark.start,5);
      await c.page.keyboard.press('Control+y');s=await saved(c.page,'SHIFT_BODY target tail',base);assert.equal(s.bodyMark.start,11);
      c.evidence.steps.push({name:'Insertion before bookmark moves target5→11; fresh Go To uses live offset; Undo/Redo restore5/11',passed:true});
      await go(c.page,'BodyTarget');await c.page.keyboard.type('FINAL_');s=await saved(c.page,c.plan.bodyFinal,base);
      const d=await open(c.page);await d.getByRole('textbox').click();await c.page.keyboard.type('99');await d.getByRole('button',{name:'Go To',exact:true}).click();
      assert.match(await d.getByRole('status').textContent(),/Type a number from 1 to 2/);assert.equal((await snapshot()).sha256,s.sha256);await dismiss(c.page);
      await c.page.keyboard.type('SAFE_');await saved(c.page,'SHIFT_BODY FINAL_SAFE_target tail',base);await c.page.keyboard.press('Control+z');await saved(c.page,c.plan.bodyFinal,base);
      c.evidence.steps.push({name:'Invalid bookmark number is rejected without moving document caret or changing saved file; subsequent typing/Undo proves caret retained',passed:true});
      c.evidence.beforeQuit=await snapshot();await c.page.keyboard.press('Control+h');
    },
    afterReopen:async({page,evidence,plan})=>{
      const before=await snapshot();assert.equal(before.body,plan.bodyFinal);assert.deepEqual(before.cells,plan.baseline);assert.equal(before.cellMark.start,5);
      assert(before.body.slice(before.bodyMark.start,before.bodyMark.end).includes('target'),'Target relationship must survive save/reopen');
      await go(page,'BodyTarget');await page.keyboard.type('RE_');
      const expected=before.body.slice(0,before.bodyMark.start)+'RE_'+before.body.slice(before.bodyMark.start);await saved(page,expected,plan.baseline);
      await page.keyboard.press('Control+z');const restored=await saved(page,plan.bodyFinal,plan.baseline);
      assert.deepEqual([restored.bodyMark.name,restored.bodyMark.start,restored.bodyMark.end],[before.bodyMark.name,before.bodyMark.start,before.bodyMark.end]);
      evidence.steps.push({name:'New process retains both bookmark target relations and navigates to independent saved XML offset; real typing/Undo/resave verified',passed:true,savedOffset:before.bodyMark.start});
      evidence.resavedAfterReopen=restored;
    }
  });
}
