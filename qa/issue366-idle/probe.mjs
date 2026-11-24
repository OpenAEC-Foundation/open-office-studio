// Diagnostic: actual app keyboard copy/paste, passive layout and counter reads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

const output = resolve(process.argv[2] || '.local/issue366-idle/two-minute');
await fs.mkdir(output, { recursive: true });
const sha = data => createHash('sha256').update(data).digest('hex');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const parts = unzipSync(await fs.readFile('public/templates/nieuw.docx'));
const xml = strFromU8(parts['word/document.xml']);
const section = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0];
assert(section);
const texts = Array.from({ length: 20 }, (_, i) =>
  `P366 ${String(i).padStart(3, '0')}. ` +
  'A synthetic paragraph for checking the page counter after copying the whole document. '.repeat(4));
parts['word/document.xml'] = strToU8(xml.replace(/<w:body>[\s\S]*<\/w:body>/,
  `<w:body>${texts.map(t => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('')}${section}</w:body>`));
const fixture = zipSync(parts);
await fs.writeFile(resolve(output, 'source.docx'), fixture);
const report = { source, fixtureSha256: sha(fixture), harnessSha256: sha(await fs.readFile(new URL(import.meta.url))),
  mode: 'Vite dev actual / browser route; two-minute passive observation after each real paste; not native/release acceptance',
  sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  startedAtUTC: new Date().toISOString(), driver: 'Canvas click plus real keyboard; public API getters read-only; no focus/content/layout setters',
  samples: [], actions: [], errors: [], cleanup: false };
let server, browser, page;
try {
  // Serve both installed bundled-font packages, as kopieer-assets does, without
  // changing a shared dependency directory or downloading extra font families.
  const fonts = new Map();
  for (const folder of ['fonts', 'fonts-cjk']) {
    const directory = `node_modules/@betteroffice/${folder}/assets`;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isFile()) fonts.set(entry.name, resolve(directory, entry.name));
    }
  }
  report.bundledFonts = [];
  for (const [name, path] of fonts) report.bundledFonts.push({ name, sha256: sha(await fs.readFile(path)) });
  server = await createServer({ configFile: resolve('scripts/app-performance.config.ts'),
    plugins: [{ name: 'issue366-bundled-font-assets', configureServer(server) {
      server.middlewares.use('/fonts', async (request, response, next) => {
        const name = request.url?.split('?')[0]?.replace(/^\//, '');
        const path = fonts.get(name);
        if (!path) return next();
        response.setHeader('Content-Type', name.endsWith('.otf') ? 'font/otf' : 'font/ttf');
        response.end(await fs.readFile(path));
      });
    } }],
    cacheDir: resolve(output, 'vite-cache'), server: { port: 0, strictPort: false,
      fs: { allow: [process.cwd(), await fs.realpath('node_modules')] } } });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  let context = await browser.newContext({ viewport: { width: 1400, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('openaec-office-instellingen', JSON.stringify({ taal: 'en', thema: 'light' })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator('.office > input[type=file]').setInputFiles({ name: 'page-counter-366.docx', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture) });
  await page.locator('.canvas-page canvas:visible').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const start = Date.now();
  const refIds = new WeakMap(); let nextRefId = 1;
  const read = phase => page.evaluate(({ phase, start }) => {
    const ref = window.__appApis?.tekst(), editor = ref?.getEditorRef();
    const layout = editor?.getLayout();
    return { phase, ms: Date.now() - start, current: ref?.getCurrentPage(), total: ref?.getTotalPages(),
      layout: layout ? { pages: layout.pages?.length, partial: layout.partial, version: layout.version } : null,
      status: window.__appStatus?.(), statusText: document.querySelector('.office-statusbalk')?.textContent,
      paragraphs: editor?.getYrsSession()?.paragraphs('body').map(p => p.text),
      focused: document.activeElement?.outerHTML?.slice(0, 300) };
  }, { phase, start });
  const observe = async (phase, ms = 5000) => {
    const began = Date.now(), until = began + ms;
    do { report.samples.push({ ...await read(phase), phaseElapsedMs: Date.now() - began }); await new Promise(r => setTimeout(r, Date.now() - began < 5000 ? 250 : 2000)); } while (Date.now() < until);
    report.samples.push({ ...await read(phase), phaseElapsedMs: Date.now() - began });
    await page.screenshot({ path: resolve(output, `${phase}.png`) });
    const { paragraphs, ...summary } = report.samples.at(-1);
    console.log(phase, JSON.stringify({ ...summary, paragraphs: paragraphs?.length }));
  };
  await observe('initial');
  let expected = texts;
  assert.deepEqual(report.samples.at(-1).paragraphs, expected);
  const check = () => {
    const sample = report.samples.at(-1);
    assert.deepEqual(sample.paragraphs, expected, 'exact source-derived paragraph oracle');
    assert.equal(sample.status.paginas, sample.layout.pages, 'displayed total equals actual layout');
    assert.equal(sample.status.pagina, sample.current, 'displayed current page equals editor');
  };
  await page.locator('.canvas-page canvas:visible').first().click({ position: { x: 120, y: 120 } });
  await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), expected.join('\n'));
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+s');
  const preDialog = page.getByRole('dialog', { name: /^Save as$/i }); await preDialog.waitFor();
  const preDownload = page.waitForEvent('download'); await preDialog.getByRole('button', { name: /^Save$/i }).click();
  const preSaved = await fs.readFile(await (await preDownload).path());
  await fs.writeFile(resolve(output, 'preflight-saved.docx'), preSaved);
  const preDom = new DOMParser().parseFromString(strFromU8(unzipSync(preSaved)['word/document.xml']), 'application/xml');
  const preParagraphs = Array.from(preDom.getElementsByTagNameNS('*', 'p')).map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join(''));
  assert.deepEqual(preParagraphs, expected, 'preflight independent XML');
  await context.close();
  context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage(); page.setDefaultTimeout(45000); page.on('pageerror', e => report.errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('openaec-office-instellingen', JSON.stringify({ taal: 'en', thema: 'light' })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator('.office > input[type=file]').setInputFiles({ name: 'preflight-reopened.docx', mimeType: 'application/octet-stream', buffer: preSaved });
  await page.locator('.canvas-page canvas:visible').first().waitFor(); await page.evaluate(() => document.fonts.ready);
  await observe('preflight-fresh-reopen'); check();
  report.preflight = { realCanvasClickKeyboardClipboard: true, ctrlSaveDialogDownload: true, independentXML: true, freshContextReopen: true, savedSha256: sha(preSaved) };
  for (let round = 1; round <= 3; round++) {
    await page.locator('.canvas-page canvas:visible').first().click({ position: { x: 120, y: 120 } });
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    const clipboard = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    assert.equal(clipboard, expected.join('\n'), 'real clipboard equals every source paragraph');
    await page.keyboard.press('Control+End');
    report.actions.push({ name: `double-${round}`, clipboardSha256: sha(clipboard), before: await read('before-paste') });
    await page.keyboard.press('Control+v');
    // Pasting at the end joins the last and first paragraphs; no added Enter.
    const previous = expected;
    expected = [...previous.slice(0, -1), previous.at(-1) + previous[0], ...previous.slice(1)];
    await observe(`double-${round}`, 120000);
    check();
    if (round === 3) {
      assert(report.samples.at(-1).layout.pages > 10);
      await page.keyboard.press('Control+z');
      expected = previous;
      await observe('undo'); check();
      await page.keyboard.press('Control+y');
      expected = [...previous.slice(0, -1), previous.at(-1) + previous[0], ...previous.slice(1)];
      await observe('redo'); check();
    }
  }
  await page.keyboard.press('Control+s');
  const dialog = page.getByRole('dialog', { name: /^Save as$/i });
  await dialog.waitFor();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /^Save$/i }).click();
  const saved = await fs.readFile(await (await downloaded).path());
  await fs.writeFile(resolve(output, 'saved.docx'), saved);
  const savedParts = unzipSync(saved);
  const dom = new DOMParser().parseFromString(strFromU8(savedParts['word/document.xml']), 'application/xml');
  const savedParagraphs = Array.from(dom.getElementsByTagNameNS('*', 'p')).map(p =>
    Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join(''));
  assert.deepEqual(savedParagraphs, expected, 'independent downloaded OOXML paragraph oracle');
  report.saved = { sha256: sha(saved), paragraphs: savedParagraphs.length, words: savedParagraphs.join(' ').trim().split(/\s+/).length, characters: savedParagraphs.join('').length, exact: true };
  await context.close();
  context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page = await context.newPage(); page.setDefaultTimeout(45000);
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('openaec-office-instellingen', JSON.stringify({ taal: 'en', thema: 'light' })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator('.office > input[type=file]').setInputFiles({ name: 'reopened-366.docx', mimeType: 'application/octet-stream', buffer: saved });
  await page.locator('.canvas-page canvas:visible').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await observe('fresh-context-reopen'); check();
  assert.deepEqual(report.errors, []);
  report.status = 'diagnostic-complete';
} catch (error) {
  report.status = 'failed'; report.failure = String(error.stack || error); console.error(report.failure);
  await page?.screenshot({ path: resolve(output, 'failure.png'), timeout: 5000 }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close(); await server?.close(); report.cleanup = true; report.finishedAtUTC = new Date().toISOString();
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
