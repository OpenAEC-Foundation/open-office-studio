// Gebruik na `pnpm build` en `pnpm preview --port 1435`:
// node scripts/test-recent-browser.mjs [http://127.0.0.1:1435/]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const errors = [];
const url = process.argv[2] ?? 'http://127.0.0.1:1435/';
const key = 'openaec-office-recent';
try {
  const context = await browser.newContext({ locale: 'nl-NL' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(key => {
    localStorage.setItem('openaec-office-instellingen', JSON.stringify({ taal: 'nl' }));
    if (!sessionStorage.getItem('recent-proef-gestart')) {
      localStorage.setItem(key, JSON.stringify([{ naam: 'oude-permanente-naam.docx', datum: 1 }]));
      sessionStorage.setItem(key, JSON.stringify([
        { naam: 'nieuw.xlsx', datum: 200, vast: false },
        { naam: 'vast.docx', datum: 100, vast: false },
      ]));
      sessionStorage.setItem('recent-proef-gestart', '1');
    }
  }, key);
  await page.goto(url);
  await page.getByRole('button', { name: 'vast.docx vastzetten', exact: true }).click();
  assert.deepEqual(await page.locator('.start-recent-tekst strong').allTextContents(), ['vast.docx', 'nieuw.xlsx']);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  await page.getByRole('button', { name: 'Lijst wissen', exact: true }).click();
  assert.deepEqual(await page.locator('.start-recent-tekst strong').allTextContents(), ['vast.docx']);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.start-recent-open').click();
  await chooser;
  await page.reload();
  await page.getByRole('button', { name: 'vast.docx losmaken', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.start-recent-tekst strong').allTextContents(), ['vast.docx']);
  const fresh = await context.newPage();
  await fresh.goto(url);
  await fresh.locator('.office-start').waitFor();
  assert.equal(await fresh.locator('.start-recent').count(), 0);
  await fresh.close();
  await page.getByRole('button', { name: 'vast.docx uit de lijst halen', exact: true }).click();
  assert.equal(await page.locator('.start-recent').count(), 0);
  await context.close();

  const blocked = await browser.newContext({ locale: 'nl-NL' });
  const deniedPage = await blocked.newPage();
  deniedPage.setDefaultTimeout(10000);
  deniedPage.on('pageerror', e => errors.push(e.message));
  await deniedPage.addInitScript(key => {
    localStorage.setItem('openaec-office-instellingen', JSON.stringify({ taal: 'nl' }));
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (name, ...args) {
        if (name === key) throw new DOMException('Blocked', 'SecurityError');
        return original.call(this, name, ...args);
      };
    }
  }, key);
  await deniedPage.goto(url);
  await deniedPage.locator('input[type=file]').setInputFiles({ name: 'geheugen-proef.txt', mimeType: 'text/plain', buffer: Buffer.from('Recente bestanden zonder browseropslag') });
  await deniedPage.getByText('geheugen-proef.txt', { exact: true }).first().waitFor({ state: 'attached' });
  await deniedPage.locator('.office-titelbalk-merk').click();
  await deniedPage.locator('.start-recent-tekst strong').filter({ hasText: 'geheugen-proef.txt' }).waitFor();
  await deniedPage.getByRole('button', { name: 'geheugen-proef.txt vastzetten', exact: true }).click();
  await deniedPage.getByRole('button', { name: 'Lijst wissen', exact: true }).click();
  assert.deepEqual(await deniedPage.locator('.start-recent-tekst strong').allTextContents(), ['geheugen-proef.txt']);
  await deniedPage.getByRole('button', { name: 'geheugen-proef.txt uit de lijst halen', exact: true }).click();
  assert.equal(await deniedPage.locator('.start-recent').count(), 0);
  assert.deepEqual(errors, []);
  const result = { normal: ['pin', 'clearKeepsPinned', 'chooseAgain', 'reload', 'freshTab', 'remove', 'legacyCleanup'], blocked: ['openTextFile', 'memoryList', 'pin', 'clearKeepsPinned', 'remove'], errors };
  await mkdir('.local/proef-recent', { recursive: true });
  await writeFile('.local/proef-recent/resultaat.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
