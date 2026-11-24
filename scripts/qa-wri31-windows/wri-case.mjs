import assert from 'node:assert/strict';

export async function wriCase(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openWri();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'wri31-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`wri-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 17+8 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'wri31-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('QA_WRI31_23NOV ');
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'wri31-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'wri31-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'wri31-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,wri31Scope:'Original first17 ordinary paragraphs and8font/justification anchors checked independently after native Save',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
