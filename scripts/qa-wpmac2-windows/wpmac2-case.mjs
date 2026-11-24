import assert from 'node:assert/strict';

export async function wpmac2Case(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openWpmac2();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'wpmac2-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`wpmac2-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 6 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'wpmac2-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type(qa.editPrefix);
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'wpmac2-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'wpmac2-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'wpmac2-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,wpmac2Scope:'Original first3 WPMac2 paragraphs and explicit C3 Bold/Italic spans checked independently after native Save; no tail/column/font/layout acceptance',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
