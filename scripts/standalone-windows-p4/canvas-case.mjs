import assert from 'node:assert/strict';

/** Direct canvas keyboard input on the existing P5 legacySyncApi editor only. */
export async function presentationCanvasCase(qa, phase) {
  const {page}=qa;
  const canvas=page.locator('[data-testid="pptx-slide-canvas"]');
  await canvas.waitFor();
  const stage=page.locator('.office-presentatie [role="application"]').filter({has:canvas});
  assert.equal(await stage.count(),1,'Unique actual SDK keyboard stage enclosing the visible slide');
  assert.equal(await stage.getAttribute('tabindex'),'0');
  assert.notEqual(await stage.getAttribute('aria-readonly'),'true');
  assert(await stage.isVisible(),'Actual SDK keyboard stage must be onscreen');
  const bounds=await canvas.boundingBox(); assert(bounds && bounds.width>0 && bounds.height>0);
  const p=qa.presentationPoint;assert(p && p.x>0 && p.x<1 && p.y>0 && p.y<1);
  await qa.prepareFocus();
  await canvas.dblclick({position:{x:bounds.width*p.x,y:bounds.height*p.y}});
  // Record even when the guard fails. The actual legacy SDK uses this DIV's
  // keydown handler, not a contenteditable element or a textarea.
  qa.record({phase,canvasFocusBeforeGuard:await qa.focusSnapshot(),sourceHitPoint:p,source:'Original unchanged PPTX title/layout XML',keyboardContract:'P5 legacySyncApi SDK stage role=application tabindex=0 onKeyDown'});
  assert(await stage.evaluate(el=>el===document.activeElement),'Actual canvas keyboard stage must own focus');
  await qa.checkFocus(stage,'presentation-direct-canvas-stage');
  assert((await qa.focusSnapshot()).documentHasFocus,'Native document must have actual OS-delivered focus');
  const marker=' STANDALONE23 PRESENTATION EDIT';
  if(phase==='initial') {
    await page.keyboard.press('Control+End');
    await page.keyboard.type(marker);
  }
  qa.record({phase,canvasFocusAfterKeys:await qa.focusSnapshot(),nativePresentationEditingRoute:'Direct actual canvas hit -> SDK stage focus -> Windows Control+End/native key events',canvasInputAcceptance:'Pending visible text, saved XML and fresh-process reopen checks'});
  await qa.screenshot(`canvas-${phase}-after-keys.png`);
  await page.keyboard.press('Escape');
  // Ordinary UI observation only: never change an Outline value to force pass.
  await page.getByRole('tab',{name:/^(View|Beeld)$/i}).click();
  await page.getByRole('toolbar',{name:/^(View|Beeld)$/i}).getByRole('button',{name:/^(Outline|Overzicht)$/i}).click();
  const paragraphs=page.locator('.dia-overzicht-inhoud textarea');
  await paragraphs.first().waitFor();
  const values=await paragraphs.evaluateAll(els=>els.map(el=>el.value));
  assert.equal(values.filter(v=>v===qa.presentationText+marker).length,1,'Canvas-typed marker and original source title must coexist in the actual paragraph');
  qa.record({phase,canvasReadback:qa.presentationText+marker,readbackRoute:'Read-only ordinary Outline values, no fill/setter',noOutlineMutation:true});
  await qa.screenshot(`canvas-${phase}-readback.png`);
  await page.locator('.dia-overzicht').getByRole('button',{name:/^(Normal view|Normale weergave)$/i}).click();
  await page.locator('.dia-overzicht').waitFor({state:'hidden'});
  await page.locator('button[role="tab"]').filter({hasText:/^(Home|Start)$/i}).click();
  if(phase==='initial')await page.getByRole('button',{name:/^(New slide|Nieuwe dia)$/i}).click();
  const thumbnails=page.locator('.office-presentatie aside > button:has(canvas)');
  await page.waitForFunction(()=>document.querySelectorAll('.office-presentatie aside > button canvas').length>=2);
  await thumbnails.first().click();
  await qa.saveOffice(`${phase}.pptx`);
}
