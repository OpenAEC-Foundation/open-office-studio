// Voer de echte GUI-helper uit, inclusief afwijzingen en opruimen van listeners.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const bron = readFileSync(new URL('../../scripts/gui/lettertype_bewijs.js', import.meta.url), 'utf8');
for (const geval of ['goed', 'null', 'leeg', 'tekst', 'worker', 'bron', 'venster', 'api-vervangen', 'sync', 'sync-oud', 'sync-leeg', 'vreemde-worker']) {
  const listeners = new Map();
  const window = {
    addEventListener: (k, f) => listeners.set(k, f),
    removeEventListener: k => listeners.delete(k),
  };
  let versie = 1, familie = 'Begin', stijl = null, mislukt = false, vervangen = false;
  const opdrachten = [];
  class Worker {
    handlers = new Map();
    postMessage() {}
    addEventListener(k, f) { this.handlers.set(k, f); }
    removeEventListener(k) { this.handlers.delete(k); }
  }
  const origineel = Worker.prototype.postMessage, w = new Worker(), vreemd = new Worker();
  const behoeften = () => JSON.stringify([{ family: familie, bold: stijl === 'bold', italic: stijl === 'italic' }]);
  const s = {
    storyIds: () => ['body'], storySegments: () => [familie, stijl], version: () => versie,
    paragraphs: () => [{ paraId: 'a', text: 'Eigen proeftekst' }], layoutFontRequirementsJson: behoeften,
  };
  const vragen = [];
  const client = { worker: w, hasFailed: () => mislukt, fontRequirements: async input => { vragen.push(input); return behoeften(); } };
  const el = { __reactFiber$proef: { memoizedState: { memoizedState: { current: { engine: s, client } } } } };
  const ed = { getYrsSession: () => vervangen ? {} : s, yrsLocToDisplayPosition: x => x, setSelection() {} };
  const api = {
    getEditorRef: () => ed, scrollToPage() {}, focus() {}, flushPendingInput: async () => {},
    commands: { execute: async (naam, args) => {
      opdrachten.push(naam); versie++;
      if (naam === 'undo') { familie = 'Begin'; stijl = null; }
      else if (naam === 'fontFamily') familie = args.family;
      else stijl = naam;
      if (geval.startsWith('sync')) {
        w.postMessage({ type: 'sync', snapshot: { layoutInput: geval==='sync-leeg' ? '' : JSON.stringify({versie}), layoutRevision: versie }, expectedFrameEpoch: versie });
        if (geval==='sync-oud') versie++;
      } else if (geval==='vreemde-worker') vreemd.postMessage({ type:'sync', snapshot:{ layoutInput:'{}' } });
      else w.postMessage({ type: 'fontRequirements', layoutInput: '{}' });
    } },
    save: async () => {
      if (geval === 'worker') { mislukt = true; w.handlers.get('message')({ data: { id: 42, ok: false, terminal: true, error: 'Eigen retained-layout-trap' } }); return null; }
      if (geval === 'bron') vervangen = true;
      if (geval === 'venster') listeners.get('error')({ type: 'error', message: 'Eigen primaire vensterfout' });
      return geval === 'null' ? null : geval === 'tekst' ? 'geen bytes' : new ArrayBuffer(geval === 'leeg' ? 0 : 4);
    },
  };
  let tijd = 0;
  const context = { window, Worker, proefApi: () => geval === 'api-vervangen' ? { ...api } : api, document: { querySelector: () => el }, crypto: webcrypto, TextEncoder, Uint8Array, ArrayBuffer, performance: ['sync-oud','sync-leeg','vreemde-worker'].includes(geval) ? {now:()=>tijd+=31000} : performance, setTimeout };
  const r = await vm.runInNewContext(bron, context);
  assert.equal(r.geslaagd, ['goed', 'api-vervangen', 'sync'].includes(geval), geval);
  assert.equal(Worker.prototype.postMessage, origineel);
  assert.equal(listeners.size, 0);
  assert.equal(w.handlers.size, 0); assert.equal(vreemd.handlers.size, 0);
  if (['goed', 'api-vervangen', 'sync'].includes(geval)) {
    assert.equal(r.gevallen.length, 4); assert.equal(opdrachten.length, 8);
    assert.ok(r.gevallen.every(g => g.bron_hersteld && g.exact && g.docx.length === 4));
    assert.equal(vragen.length,4);
    if(geval==='sync')assert.deepEqual(vragen,['{"versie":2}','{"versie":4}','{"versie":6}','{"versie":8}']);
  } else if (['sync-oud','sync-leeg','vreemde-worker'].includes(geval)) {
    assert.match(r.fout,/Geen actuele layoutbron/);assert.equal(vragen.length,0);assert.equal(r.gevallen.length,0);
  } else {
    assert.equal(opdrachten.length, 1, 'Geen Undo of volgende variant na een mislukte bewaring');
    assert.equal(r.diagnose.fase, 'bewaren'); assert.equal(r.diagnose.variant, 'caladea');
    if (geval === 'worker') { assert.equal(r.diagnose.worker_uitgevallen, true); assert.match(r.diagnose.fouten[0].tekst, /retained-layout-trap/); }
    if (geval === 'bron') assert.equal(r.diagnose.bron_actief, false);
    if (geval === 'venster') assert.match(r.fout, /primaire vensterfout/);
    if (['null', 'leeg', 'tekst'].includes(geval)) assert.match(r.fout, /Geen geldige DOCX-export/);
  }
  console.log(geval + ': geslaagd');
}
