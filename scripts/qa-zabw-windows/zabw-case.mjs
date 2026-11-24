import assert from 'node:assert/strict';

export async function zabwCase(qa,phase) {
  const {page}=qa;
  if(phase==='initial')await qa.openZabw();
  await page.locator('.office-tab[aria-selected="true"][data-soort="docx"]').waitFor();
  const input=page.locator('[data-testid="yrs-input"]:visible');await input.waitFor();
  const canvas=page.locator('.canvas-page canvas:visible').first();
  await qa.focus(input,'zabw-body',canvas);
  await page.keyboard.press('Control+Home');
  await qa.screenshot(`zabw-${phase}-source.png`);
  if(phase==='initial') {
    // First native save verifies the 8 source cases before any edit.
    await qa.saveOffice('imported.docx');
    await qa.focus(input,'zabw-prefix-edit',canvas);
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('QA_ZABW_24NOV ');
    await qa.saveOffice('edited.docx');
    await qa.focus(input,'zabw-undo',canvas);
    await page.keyboard.press('Control+z');
    await qa.saveOffice('undo.docx');
    await qa.focus(input,'zabw-redo',canvas);
    await page.keyboard.press('Control+y');
  }
  await qa.saveOffice(`${phase}.docx`);
  await qa.focus(input,'zabw-visible-final-body',canvas);
  await page.keyboard.press('Control+Home');
  qa.record({phase,zabwScope:'Original ZABW hello-world paragraph plus8document-type/structure/encoded-font/size/alignment/page cases checked independently after native Save',nativeEdit:phase==='initial'?'Real body prefix keys; Undo/Redo with independent unedited/edited DOCX checkpoints':'New-process reopen and ordinary DOCX resave',fullFormatAcceptance:false});
}
