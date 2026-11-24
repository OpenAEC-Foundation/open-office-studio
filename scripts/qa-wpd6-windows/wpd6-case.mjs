import assert from 'node:assert/strict';

export async function wpd6Case(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openWpd6();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'wpd6-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`wpd6-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 6 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'wpd6-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type(qa.editPrefix);
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'wpd6-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'wpd6-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'wpd6-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,wpd6Scope:'Two source body segments, hard return/page boundary and successive active Header A checked independently; no inactive-first-header/layout/fullformat acceptance',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
