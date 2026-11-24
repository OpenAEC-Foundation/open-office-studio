import assert from 'node:assert/strict';

export async function hwp3Case(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openHwp3();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'hwp3-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`hwp3-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 6 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'hwp3-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type(qa.editPrefix);
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'hwp3-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'hwp3-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'hwp3-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,hwp3Scope:'Original2 source paragraphs, exact Korean Unicode/NFC/CR semantics checked independently after native Save; no font-render acceptance',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
