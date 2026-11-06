/** Echte meetbron: afkeuring mag geen tijdelijke workeromwikkeling achterlaten. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const bron = fs.readFileSync(process.env.OFFICE_LETTERTYPE_MEETBRON ??
  path.resolve(__dirname, '../../../scripts/gui/lettertype_bewijs.js'), 'utf8');

async function proef(soort) {
  const luisteraars = new Map(), workerLuisteraars = new Map();
  const voeg = (map, naam, fn) => {
    if (!map.has(naam)) map.set(naam, new Set());
    map.get(naam).add(fn);
  };
  const wis = (map, naam, fn) => map.get(naam)?.delete(fn);
  let echtVerzonden = 0;
  class Worker {
    postMessage() { echtVerzonden++; return 'werkelijk antwoord'; }
    addEventListener(naam, fn) { voeg(workerLuisteraars, naam, fn); }
    removeEventListener(naam, fn) { wis(workerLuisteraars, naam, fn); }
  }
  const origineel = Worker.prototype.postMessage;
  const worker = new Worker();
  const sessie = {
    storyIds: () => ['body'], storySegments: () => [], version: () => 'bron-1',
    paragraphs: () => [{ paraId: 'alinea-1', text: 'Een proef.' }],
  };
  const client = { worker, fontRequirements() {}, hasFailed: () => soort === 'uitgevallen' };
  const canvas = { __reactFiber$proef: {
    memoizedState: { memoizedState: { current: {
      engine: soort === 'vreemde-bron' ? {} : sessie, client,
    } } },
  } };
  const ed = {
    getYrsSession: () => sessie,
    yrsLocToDisplayPosition: plek => plek.offset,
    setSelection() {},
  };
  const api = {
    getEditorRef: () => ed, scrollToPage() {}, focus() {},
    commands: { async execute() {
      assert.equal(worker.postMessage({ type: 'fontRequirements', layoutInput: '{}' }), 'werkelijk antwoord');
      throw Error('Oorspronkelijke opmaakafkeuring');
    } },
  };
  const window = {
    addEventListener(naam, fn) { voeg(luisteraars, naam, fn); },
    removeEventListener(naam, fn) { wis(luisteraars, naam, fn); },
  };
  const context = vm.createContext({
    window, Worker, crypto: webcrypto, TextEncoder,
    document: { querySelector: () => soort === 'geen-canvas' ? null : canvas },
    proefApi: () => api,
  });
  let resultaat, fout;
  try { resultaat = await vm.runInContext(bron, context, { timeout: 1000 }); }
  catch (e) { fout = e; }
  assert.equal(Worker.prototype.postMessage, origineel, `${soort}: prototype niet hersteld`);
  assert([...luisteraars.values()].every(s => s.size === 0), `${soort}: vensterluisteraar achtergebleven`);
  assert([...workerLuisteraars.values()].every(s => s.size === 0), `${soort}: workerluisteraar achtergebleven`);
  assert.equal(fout, undefined, `${soort}: primaire afkeuring ontbreekt in het resultaat`);
  assert.equal(resultaat.geslaagd, false);
  assert.equal(resultaat.gevallen.length, 0);
  if (soort === 'opmaakfout') {
    assert.match(resultaat.fout, /Oorspronkelijke opmaakafkeuring/);
    assert.equal(echtVerzonden, 1);
    assert.equal(resultaat.diagnose.verzoeken.length, 1);
    assert.equal(resultaat.diagnose.gereedheid.meting_geplaatst, true);
  } else {
    assert.match(resultaat.fout, soort === 'uitgevallen' ? /worker is uitgevallen/ : /worker niet gevonden/);
    assert.equal(echtVerzonden, 0);
    assert.equal(resultaat.diagnose.gereedheid.meting_geplaatst, soort === 'uitgevallen');
  }
  console.log(`${soort}: oorspronkelijke afkeuring en volledig herstel gecontroleerd`);
}

(async () => {
  for (const soort of ['geen-canvas', 'vreemde-bron', 'uitgevallen', 'opmaakfout']) await proef(soort);
})().catch(fout => { console.error(fout); process.exitCode = 1; });
