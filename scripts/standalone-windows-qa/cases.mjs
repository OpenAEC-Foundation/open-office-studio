import assert from 'node:assert/strict';

export async function officeCase(qa, kind, phase) {
  const { page } = qa;
  const ext = {writer:'docx',spreadsheet:'xlsx',presentation:'pptx'}[kind];
  await page.locator(`.office-tab[data-soort="${ext}"]`).waitFor();
  if (kind === 'writer') {
    const input = page.locator('[data-testid="yrs-input"]:visible'); await input.waitFor();
    await qa.focus(input, 'writer-input');
    if (phase === 'initial') { await page.keyboard.press('Control+Home'); await page.keyboard.type('STANDALONE23 WRITER EDIT '); }
  } else if (kind === 'spreadsheet') {
    await page.locator('.rekenblad-naamvak').waitFor();
    async function cell(address, text) {
      const name = page.locator('.rekenblad-naamvak'); await name.fill(address); await name.press('Enter');
      const formula=page.locator('[data-testid="xlsx-formula-input"]:visible'); await formula.waitFor();
      await qa.focus(formula, `spreadsheet-${address}`); await formula.fill(text); await formula.press('Enter');
    }
    if (phase === 'initial') {
      await cell('A1','STANDALONE23 CELL'); await cell('B1','41'); await cell('C1','=B1+1');
    } else {
      const name=page.locator('.rekenblad-naamvak'); await name.fill('A1'); await name.press('Enter');
      assert.equal(await page.locator('[data-testid="xlsx-formula-input"]:visible').inputValue(),'STANDALONE23 CELL');
    }
  } else {
    await page.locator('[data-testid="pptx-slide-canvas"]').waitFor();
    if (phase === 'initial') {
      // Actual editable text input is required; no engine applyEdits or DOM state mutation.
      const canvas=page.locator('[data-testid="pptx-slide-canvas"]');
      await canvas.dblclick({position:{x:300,y:200}});
      const input=page.locator('[contenteditable="true"]:visible, textarea:visible').first();
      await qa.focus(input,'presentation-text'); await page.keyboard.type('STANDALONE23 PRESENTATION EDIT');
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:/^(New slide|Nieuwe dia)$/i}).click();
    }
  }
  await qa.saveOffice(`${phase}.${ext}`);
}

export async function notitionCase(qa, phase) {
  const {page}=qa;
  const pageTitle=page.getByRole('textbox',{name:/^(Page title|Paginatitel)$/i});
  await pageTitle.waitFor();
  if (phase==='initial') {
    // Use the ordinary notebook creation UI, not injected localStorage.
    await page.getByRole('button',{name:/^(Add notebook|Notitieblok toevoegen|Nieuw notitieblok)$/i}).click();
    await page.getByRole('button',{name:/^(Rename notebook|Notitieblok hernoemen)$/i}).click();
    const dialog=page.getByRole('dialog'); await dialog.waitFor();
    await dialog.locator('input').first().fill('STANDALONE23 NOTEBOOK');
    await dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();
    await pageTitle.fill('STANDALONE23 NOTE'); await pageTitle.press('Tab');
    const body=page.locator('.notities-blok textarea').first(); await qa.focus(body,'notition-note-body');
    await body.fill('STANDALONE23 NOTE BODY'); await body.press('Tab');
  } else assert.equal(await pageTitle.inputValue(),'STANDALONE23 NOTE');
  const exportButton=page.getByRole('button',{name:/^(Save backup|Back-up opslaan)$/i});
  await exportButton.click();
  const file=await qa.saveNative(`${phase}.openaec-notities`, /^(Notes|Notities)-\d{4}-\d{2}-\d{2}\.openaec-notities$/);
  await qa.oracle('notition',file);
}

export async function databaseCase(qa, phase) {
  const {page}=qa;
  await page.locator('input[type="file"]').setInputFiles(qa.databaseInput);
  // SQLite opening may require explicit "not a work copy" confirmation.
  const confirmation=page.getByRole('button',{name:/^(Open anyway|Toch openen|Open|Openen)$/i});
  if (await confirmation.count()===1 && await confirmation.isVisible()) await confirmation.click();
  await page.getByRole('button',{name:'standalone_qa',exact:true}).click();
  await page.getByText('STANDALONE23 DATABASE',{exact:true}).waitFor();
  const create=page.getByRole('tab',{name:/^(Create|Maken)$/i}); await create.click();
  await page.getByRole('button',{name:/^(Query|Query maken)$/i}).click();
  const input=page.locator('textarea:visible').first(); await qa.focus(input,'database-query');
  await input.fill('SELECT label, amount FROM standalone_qa WHERE amount = 42;');
  await input.press('Control+Enter');
  await page.getByText('STANDALONE23 DATABASE',{exact:true}).waitFor();
  qa.record({phase,queryReadback:true,expectedAmount:42,sourceUnchanged:true,writeCapability:'not claimed'});
}

export async function emailCase(qa, phase) {
  // Deliberately fail closed until the loopback protocol fixture is available.
  // Real packaged native backend must never be replaced with DemoBackend.
  const demo=await qa.page.locator('.email-demobalk').allTextContents();
  assert(!demo.some(text=>/demo/i.test(text)), 'Native Email unexpectedly uses demo data');
  await qa.page.locator('.email-welkom, .email-werkruimte').waitFor();
  throw Error('BLOCKED: native Email draft/loopback fixture not yet prepared; startup is not functional acceptance');
}
