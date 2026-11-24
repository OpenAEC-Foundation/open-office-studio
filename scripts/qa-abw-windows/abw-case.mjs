import assert from 'node:assert/strict';

export async function abwCase(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openAbw();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'abw-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`abw-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 8 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'abw-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('QA_ABW_24NOV ');
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'abw-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'abw-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'abw-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,abwScope:'Original ABW hello-world paragraph plus8document-type/structure/encoded-font/size/alignment/page cases checked independently after native Save',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
