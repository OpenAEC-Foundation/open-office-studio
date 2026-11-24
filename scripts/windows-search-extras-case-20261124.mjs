/** Three explicitly requested families, independent fixtures, one signed Suite host. */
import assert from "node:assert/strict";
import { testNativeFindReplace } from "./windows-find-replace-case-20261124.mjs";

export async function testSearchExtras(context,families) {
  assert(Array.isArray(families)&&families.length&&new Set(families).size===families.length);
  const cases={wildcard:wildcardCase,format:formatCase,special:specialCase};
  assert(families.every(f=>Object.hasOwn(cases,f)));
  context.report.extrasRequested=families;context.report.extrasStarted=[];
  for(const family of families) {
    context.report.extrasStarted.push(family);
    await testNativeFindReplace({...context,planPath:`docs/tests/windows-writer-search-extras-20261124/${family}-plan.json`,runCases:cases[family]});
  }
}
async function search(c,text,count) {
  await c.textInput(c.query,text);await c.page.waitForTimeout(400);
  return c.results(count);
}
async function undo(c,expected) {
  await c.page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  await c.page.keyboard.press('Control+z');await c.visible(expected);
}
async function bulk(c,expected) {
  await c.pane.getByRole('button',{name:'Replace All',exact:true}).click();await c.visible(expected);
}
async function wildcardCase(c) {
  const wild=c.pane.getByRole('checkbox',{name:'Use wildcards',exact:true});
  await wild.check();assert(await c.matchCase.isDisabled());assert(await c.whole.isDisabled());
  assert(!(await c.pane.getByRole('checkbox',{name:'Regular expression',exact:true}).isChecked()));
  c.evidence.steps.push({name:'Wildcard mode is exclusive of regex and uses its documented case/boundary behavior',passed:true});
  for(const test of c.plan.patterns) {
    const status=await search(c,test.query,test.count);
    const actual=await c.pane.locator('.tw-zoek-resultaten mark').allTextContents();assert.deepEqual(actual,test.matches);
    c.evidence.steps.push({name:'Documented wildcard pattern returns exact independent matches',passed:true,query:test.query,status,matches:actual});
  }
  await search(c,'[',0);await c.page.waitForTimeout(300);
  const error=await c.pane.locator('.tw-zoek-telling').textContent();assert(error.includes('without a matching'),error);
  for(const name of ['Previous result','Next result','Replace','Replace All'])assert(await c.pane.getByRole('button',{name,exact:true}).isDisabled());
  await c.visible(c.baseline);assert.deepEqual(await c.disk(),c.baselineSaved);
  c.evidence.steps.push({name:'Invalid wildcard is rejected with disabled actions and unchanged document/file',passed:true,error});
  await search(c,c.plan.capturePattern,4);await c.textInput(c.replacement,c.plan.replacement);
  await c.pane.locator('.tw-zoek-resultaten li button').first().click();await c.pane.getByRole('button',{name:'Replace',exact:true}).click();await c.visible(c.single);
  await undo(c,c.baseline);c.evidence.steps.push({name:'Single wildcard backreference replacement changes selected match only and undoes normally',passed:true});
  await c.results(4);await bulk(c,c.bulk);await undo(c,c.baseline);
  await c.page.keyboard.press('Control+y');await c.visible(c.bulk);
  c.evidence.steps.push({name:'Bulk wildcard backreferences replace four matches as one Undo step; Redo retains uppercase/unrelated controls',passed:true});
}
async function keyboardSelect(c,select,value) {
  // Reach the closed native HTML select by real Tab traversal; no value setter.
  await c.query.click();let reached=false;
  for(let i=0;i<55;i++) {
    await c.page.keyboard.press('Tab');
    if(await select.evaluate(el=>el===document.activeElement)){reached=true;break;}
  }
  assert(reached,'Real Tab traversal must reach the requested format control');
  const values=await select.locator('option').evaluateAll(opts=>opts.map(o=>o.value));
  const index=values.indexOf(value);assert(index>=0,`Actual UI must offer ${value}`);
  await c.page.keyboard.press('Home');for(let i=0;i<index;i++)await c.page.keyboard.press('ArrowDown');
  await c.page.keyboard.press('Tab');assert.equal(await select.inputValue(),value);
}
async function formatCase(c) {
  await c.pane.locator('.tw-zoek-meer > summary').click();
  const selects=Object.fromEntries(['Bold','Italic','Underline','Style'].map(n=>[n,c.pane.getByRole('combobox',{name:n,exact:true})]));
  async function option(name,value){await keyboardSelect(c,selects[name],value);await c.page.waitForTimeout(400);}
  async function cells(expected) {
    await c.results(expected.length);
    const locations=await c.waitFor(async()=>{
      const raw=await c.pane.locator('.tw-zoek-plek').allTextContents();
      const indices=raw.map(s=>{const m=s.match(/row (\d+), column (\d+)/);return m?(Number(m[1])-1)*3+Number(m[2])-1:null;});
      return JSON.stringify(indices)===JSON.stringify(expected)?raw:null;
    },'Native format result locations must match independent source cells');return locations;
  }
  await search(c,'token',6);
  for(const test of c.plan.filters) {
    for(const name of ['Bold','Italic','Underline','Style'])await option(name,test.values[name]??'');
    const locations=await cells(test.cells);
    c.evidence.steps.push({name:'Format search respects requested positive/negative/combined/style filters',passed:true,filter:test.name,locations});
  }
  for(const name of ['Italic','Underline','Style'])await option(name,'');await option('Bold','ja');
  await c.textInput(c.query,'');await c.page.waitForTimeout(400);await cells([1,4]);
  assert.deepEqual(await c.pane.locator('.tw-zoek-resultaten mark').allTextContents(),['token bold','token both']);
  c.evidence.steps.push({name:'Empty query searches complete formatting ranges, as advertised by UI',passed:true});
  await search(c,'token',2);await c.textInput(c.replacement,'ink');await bulk(c,c.plan.boldReplaced);await undo(c,c.baseline);
  await c.page.keyboard.press('Control+y');await c.visible(c.plan.boldReplaced);
  c.evidence.steps.push({name:'Bold-filtered bulk replacement and one-step Undo/Redo leave plain/italic/underline controls untouched',passed:true});
  await option('Bold','');await option('Style','Heading1');await search(c,'token',1);
  await c.pane.locator('.tw-zoek-resultaten li button').first().click();await c.pane.getByRole('button',{name:'Replace',exact:true}).click();await c.visible(c.bulk);
  await undo(c,c.plan.boldReplaced);await c.page.keyboard.press('Control+y');await c.visible(c.bulk);
  c.evidence.steps.push({name:'Heading1-filtered single replacement changes only intended heading and supports Undo/Redo',passed:true});
}
async function specialCase(c) {
  for(const test of c.plan.patterns) {
    const status=await search(c,test.query,test.count);
    c.evidence.steps.push({name:'Documented caret-code search finds independent control character/text',passed:true,query:test.query,status});
  }
  await c.pane.locator('.tw-zoek-meer > summary').click();await c.textInput(c.query,'');await c.query.click();
  await c.pane.locator('.tw-zoek-speciaal button').filter({hasText:'^t'}).click();
  assert.equal(await c.query.inputValue(),'^t');await c.page.waitForTimeout(400);await c.results(1);
  c.evidence.steps.push({name:'Actual Insert special characters button inserts tab search code in focused query',passed:true});
  for(const test of c.plan.operations) {
    await search(c,test.query,test.count);await c.textInput(c.replacement,test.replacement);await bulk(c,test.after);
    await undo(c,test.before);await c.page.keyboard.press('Control+y');await c.visible(test.after);
    c.evidence.steps.push({name:'Special-character replacement and one-step Undo/Redo preserve declared control structure',passed:true,query:test.query,replacement:test.replacement});
  }
}
