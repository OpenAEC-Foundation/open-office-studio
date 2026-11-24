/** P5 UI exposes Regular expression; exact P5 logica.ts/tests support $1..$9. */
import assert from "node:assert/strict";
import { testNativeFindReplace } from "./windows-find-replace-case-20261124.mjs";

export async function testNativeRegex(context) {
  return testNativeFindReplace({...context,planPath:"docs/tests/windows-writer-regex-20261124/plan.json",runCases:regexCases});
}

async function regexCases({page,pane,query,replacement,whole,matchCase,textInput,results,visible,baseline,bulk,single,plan,evidence,disk,baselineSaved}) {
  const regex=pane.getByRole('checkbox',{name:'Regular expression',exact:true});
  await regex.check();await textInput(query,plan.pattern);
  let status=await results(5);
  evidence.steps.push({name:'Valid regex character class, count quantifier and two capture groups search all cells',passed:true,status});
  await matchCase.check();status=await results(4);
  evidence.steps.push({name:'Case-sensitive regex excludes uppercase ITEM control',passed:true,status});
  for(const pattern of ['[','[abc','(']) {
    await textInput(query,pattern);
    for(const wholeWords of [false,true]) {
      await whole.setChecked(wholeWords);
      // Same error may remain text-identical when toggling whole-word mode.
      // Allow the documented250ms input/options debounce before observing it.
      await page.waitForTimeout(700);
      const error=await pane.locator('.tw-zoek-telling').textContent();
      assert(error.startsWith('Invalid search:'),error);
      assert.equal(await pane.locator('.tw-zoek-resultaten li').count(),0);
      for(const name of ['Previous result','Next result','Replace','Replace All'])
        assert(await pane.getByRole('button',{name,exact:true}).isDisabled(),name);
      await visible(baseline);assert.deepEqual(await disk(),baselineSaved);
      evidence.steps.push({name:'Malformed regex rejected with document unchanged and navigation/replacement disabled',passed:true,pattern,wholeWords,error});
    }
  }
  await textInput(query,'a*');await page.waitForTimeout(700);
  const emptyError=await pane.locator('.tw-zoek-telling').textContent();
  assert(emptyError.includes('empty text'),emptyError);
  assert.equal(await pane.locator('.tw-zoek-resultaten li').count(),0);
  assert(await pane.getByRole('button',{name:'Replace All',exact:true}).isDisabled());
  await visible(baseline);assert.deepEqual(await disk(),baselineSaved);
  evidence.steps.push({name:'Pattern matching empty input is safely rejected without modifying source',passed:true,error:emptyError});
  await textInput(query,plan.pattern);status=await results(4);
  await textInput(replacement,plan.replacement);
  await pane.locator('.tw-zoek-resultaten li button').first().click();
  await pane.getByRole('button',{name:'Replace',exact:true}).click();await visible(single);
  await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+y');await visible(single);
  await page.keyboard.press('Control+z');await visible(baseline);
  evidence.steps.push({name:'Regex single replacement expands supported $2/$1 captures; exact selected text only; immediate Undo/Redo',passed:true,status});
  await results(4);
  await pane.getByRole('button',{name:'Replace All',exact:true}).click();await visible(bulk);
  await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  evidence.bulkStatus=await pane.locator('.tw-zoek-telling').textContent();
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+y');await visible(bulk);
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+Shift+z');await visible(bulk);
  evidence.steps.push({name:'Regex bulk capture replacement affects four eligible matches; one-step Undo/both Redo forms preserve uppercase and unrelated controls',passed:true});
}
