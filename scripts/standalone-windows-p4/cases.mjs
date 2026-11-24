import assert from 'node:assert/strict';

export async function officeCase(qa, kind, phase) {
  const { page } = qa;
  const ext = {writer:'docx',spreadsheet:'xlsx',presentation:'pptx'}[kind];
  await page.locator(`.office-tab[aria-selected="true"][data-soort="${ext}"]`).waitFor();
  if (kind === 'writer') {
    const input = page.locator('[data-testid="yrs-input"]:visible'); await input.waitFor();
    // The hidden textarea is the keyboard sink; ordinary users click its
    // visible canvas. Never force-click through that canvas or inject focus.
    await qa.focus(input, 'writer-input',page.locator('.canvas-page canvas:visible').first());
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
    const formulaName=page.locator('.rekenblad-naamvak');await formulaName.fill('C1');await formulaName.press('Enter');
    assert.equal(await page.locator('[data-testid="xlsx-formula-input"]:visible').inputValue(),'=B1+1');
    const computed=page.locator('[data-oos-rastercel][aria-colindextext="C"][aria-rowindextext="1"]');
    assert.match(await computed.getAttribute('aria-label'),/(^|[^0-9])42($|[^0-9])/);
    qa.record({phase,actualNativeFormula:'=B1+1',actualComputedCellLabel:await computed.getAttribute('aria-label')});
  } else {
    await page.locator('[data-testid="pptx-slide-canvas"]').waitFor();
    if (phase === 'initial') {
      // Actual editable text input is required; no engine applyEdits or DOM state mutation.
      const canvas=page.locator('[data-testid="pptx-slide-canvas"]');
      const bounds=await canvas.boundingBox(); assert(bounds);
      assert(qa.presentationPoint&&qa.presentationPoint.x>0&&qa.presentationPoint.y>0);
      await canvas.dblclick({position:{x:bounds.width*qa.presentationPoint.x,y:bounds.height*qa.presentationPoint.y}});
      qa.record({phase,nativePresentationHitPoint:qa.presentationPoint,source:'Unchanged original PPTX title/layout XML'});
      // The SDK may use a portal/zero-size keyboard sink for its visible canvas
      // caret. Verify actual keyboard focus, not a particular CSS parent/type.
      await page.waitForFunction(()=>{
        const el=document.activeElement;
        return el?.isConnected&&!el.disabled&&!el.readOnly&&(el.isContentEditable||el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&el.type==='text'));
      });
      const input=page.locator(':focus');
      qa.record({phase,actualSlideEditor:await input.evaluate(el=>({tag:el.tagName,id:el.id,className:el.className,role:el.getAttribute('role'),contentEditable:el.isContentEditable}))});
      await qa.checkFocus(input,'presentation-text'); await page.keyboard.type('STANDALONE23 PRESENTATION EDIT');
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:/^(New slide|Nieuwe dia)$/i}).click();
    }
    const thumbnails=page.locator('.office-presentatie aside > button:has(canvas)');
    await page.waitForFunction(()=>document.querySelectorAll('.office-presentatie aside > button canvas').length>=2);
    await thumbnails.first().click();
    qa.record({phase,presentationVisibleSlide:1,actualThumbnailCount:await thumbnails.count(),visualAcceptance:'Separate completed screenshot review required'});
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
    const dialog=page.getByRole('dialog'); await dialog.waitFor();
    await dialog.locator('input').first().fill('STANDALONE23 NOTEBOOK');
    await dialog.getByRole('button',{name:/^(Save|Opslaan)$/i}).click();
    await pageTitle.fill('STANDALONE23 NOTE'); await pageTitle.press('Tab');
    const body=page.locator('.notities-blok textarea').first(); await qa.focus(body,'notition-note-body');
    await body.fill('STANDALONE23 NOTE BODY'); await body.press('Tab');
  } else {
    await page.locator('.notities-boekkiezer select').selectOption({label:'STANDALONE23 NOTEBOOK'});
    await page.waitForFunction(()=>document.querySelector('.notities-paginatitel')?.value==='STANDALONE23 NOTE');
    assert.equal(await pageTitle.inputValue(),'STANDALONE23 NOTE');
    assert.equal(await page.locator('.notities-boekkiezer select option:checked').textContent(),'STANDALONE23 NOTEBOOK');
    assert((await page.locator('.notities-blok textarea').first().inputValue()).includes('STANDALONE23 NOTE BODY'));
  }
  // Backup is an ordinary command on the Save/Bewaren ribbon tab, not Home.
  const backupTab=page.getByRole('tab',{name:/^(Save|Bewaren)$/i});
  await backupTab.click();
  assert.equal(await backupTab.getAttribute('aria-selected'),'true');
  const exportButton=page.getByRole('button',{name:/^(Save backup|Back-up opslaan)$/i});
  await exportButton.click();
  const file=await qa.saveNative(`${phase}.openaec-notities`, /^(Notes|Notities)-\d{4}-\d{2}-\d{2}(?:\.openaec-notities)?$/);
  await qa.oracle('notition',file);
}

export async function databaseCase(qa, phase) {
  const {page}=qa;
  await page.locator('input[type="file"]').setInputFiles(qa.databaseInput);
  // SQLite opening may require explicit "not a work copy" confirmation.
  const confirmation=page.getByRole('dialog').getByRole('button',{name:/^(Open anyway|Toch openen)$/i});
  await confirmation.waitFor(); await confirmation.click();
  // The ordinary object button also contains its row-count label.
  await page.locator('aside button').filter({has:page.getByText('standalone_qa',{exact:true})}).click();
  await page.getByText('STANDALONE23 DATABASE',{exact:true}).waitFor();
  const create=page.getByRole('tab',{name:/^(Create|Maken)$/i}); await create.click();
  await page.getByRole('button',{name:/^(Query|Query maken)$/i}).click();
  const input=page.locator('textarea:visible').first(); await qa.focus(input,'database-query');
  await input.fill('SELECT label, amount FROM standalone_qa WHERE amount = 42;');
  await input.press('Control+Enter');
  const result=page.locator('.database-query-resultaat');
  await result.getByText('STANDALONE23 DATABASE',{exact:true}).waitFor();
  await result.getByText('42',{exact:true}).waitFor();
  qa.record({phase,queryReadback:true,expectedAmount:42,sourceExpectedUnchanged:true,writeCapability:'not claimed'});
}

export async function emailCase(qa, phase) {
  // The real packaged Tauri backend talks only to our synthetic external
  // loopback protocol fixture. Never replace it with DemoBackend or invoke a
  // backend mutation directly to bypass the actual account/compose UI.
  const demo=await qa.page.locator('.email-demobalk').allTextContents();
  assert(!demo.some(text=>/demo/i.test(text)), 'Native Email unexpectedly uses demo data');
  const {page}=qa;
  await page.locator('.email-welkom, .email-werkruimte').waitFor();
  if(phase==='initial') {
    const wizard=page.locator('.email-wizard');
    const addAccount=page.getByRole('button',{name:/^(Add account|Account toevoegen)$/i});
    await wizard.or(addAccount).first().waitFor();
    if(!await wizard.isVisible())await addAccount.click();
    await wizard.waitFor();
    await wizard.locator('.email-vinkje input[type="checkbox"]').first().uncheck();
    // The visible label also contains its ordinary <small> help text.
    // Match the exact label prefix while keeping selection inside this wizard.
    await wizard.getByRole('textbox',{name:/^(Your full name|Je volledige naam)(?:\s|$)/i}).fill('Standalone QA');
    await wizard.getByLabel(/^(Email address|E-mailadres)$/i).fill('qa@fixture.localhost');
    await wizard.locator('input[type="password"]').fill('standalone-synthetic-password');
    for(const protocol of ['IMAP','SMTP']) {
      await wizard.getByRole('textbox',{name:new RegExp(`^${protocol}[ -]server$`,'i')}).fill('127.0.0.1');
      await wizard.getByRole('combobox',{name:new RegExp(`^${protocol}[ -](security|beveiliging)$`,'i')}).selectOption('geen');
      await wizard.getByRole('spinbutton',{name:new RegExp(`^${protocol}[ -](port|poort)$`,'i')}).fill(String(qa.mail[protocol.toLowerCase()]));
      await wizard.getByRole('textbox',{name:new RegExp(`^${protocol}[ -](username|gebruikersnaam)$`,'i')}).fill('qa@fixture.localhost');
    }
    await wizard.getByRole('button',{name:/^(Save anyway|Toch opslaan|Done|Gereed)$/i}).click();
    await page.getByText('STANDALONE23 LOCAL MESSAGE',{exact:true}).click();
    await page.frameLocator('.email-berichtframe').getByText('STANDALONE23 LOCAL BODY',{exact:true}).waitFor();
    await page.getByRole('button',{name:/^(New message|Nieuw bericht)$/i}).click();
    await page.getByLabel(/^(Subject|Onderwerp)$/i).fill('STANDALONE23 LOCAL DRAFT');
    const body=page.locator('.email-editor[contenteditable="true"]'); await qa.focus(body,'email-native-compose');
    await page.keyboard.type('STANDALONE23 DRAFT BODY'); await page.keyboard.press('Control+s');
    await qa.waitForDraft();
    const compose=page.locator('.email-opstelvenster');
    await compose.getByRole('button',{name:/^(Close|Sluiten)$/i}).click();
  }
  await page.getByRole('button',{name:/^Drafts|^Concepten/i}).click();
  await page.getByText('STANDALONE23 LOCAL DRAFT',{exact:true}).click();
  await page.frameLocator('.email-berichtframe').getByText('STANDALONE23 DRAFT BODY',{exact:true}).waitFor();
  qa.record({phase,realNativeBackend:true,loopbackOnly:true,draftReadback:true,noSend:true});
}
