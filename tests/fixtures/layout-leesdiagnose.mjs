import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bron = readFileSync(new URL('../../scripts/test-writer-lang-native.py', import.meta.url), 'utf8');
const begin = bron.indexOf('              window._workerMoment = () => {');
const einde = bron.indexOf('\n              window._workerVoorInvoer', begin);
const lus = bron.indexOf("              for (const naam of ['readParagraphs', 'paragraphSpans', 'layoutDocumentWithRegionsRetainedJson'");
const lusEinde = bron.indexOf('              window._canvasVergelijkOrig', lus);
assert.ok(begin >= 0 && einde > begin && lus >= 0 && lusEinde > lus, 'Diagnoseankers ontbreken');
const sessie = {}, ander = {}, native = [];
let tijd = 0, client = { worker: {}, hasFailed: () => false }, fout = null;
const context = vm.createContext({
  _nativeSessie: sessie, _nativeLees: {}, _nativeHerstel: [], _leesDiagnose: [],
  performance: { now: () => ++tijd },
  document: { querySelector() {
    if (fout) throw fout;
    return { '__reactFiber$eigen': { memoizedState: { memoizedState: { current: client }, next: null }, return: null } };
  } },
});
context.window = context;
vm.runInContext(bron.slice(begin, einde), context);
const gewoon = v => JSON.parse(JSON.stringify(v));
client = { engine: sessie, client: { worker: {}, hasFailed: () => false } };
assert.equal(context._workerMoment()[0].uitgevallen, false);
client.client.hasFailed = () => true;
assert.equal(context._workerMoment()[0].uitgevallen, true);
client.engine = ander;
assert.deepEqual(gewoon(context._workerMoment()), [], 'Vreemde sessie mag niet meetellen');
fout = Error('Eigen diagnosefout');
assert.match(context._workerMoment()[0].diagnosefout, /Eigen diagnosefout/);
const eigenFout = Error('Eigen oorspronkelijke motorfout');
for (const naam of ['readParagraphs', 'paragraphSpans', 'layoutDocumentWithRegionsRetainedJson', 'layoutFontRequirementsJson', 'residentWorkerSnapshot']) {
  sessie[naam] = function (...args) {
    assert.equal(this, sessie);
    native.push({ naam, args });
    if (args[0] === 'fout') throw eigenFout;
    return args;
  };
}
vm.runInContext(bron.slice(lus, lusEinde), context);
const teken = {};
assert.deepEqual(sessie.layoutDocumentWithRegionsRetainedJson(teken, 7), [teken, 7]);
assert.equal(native.at(-1).args[0], teken, 'Argumentenidentiteit behouden');
assert.match(context._leesDiagnose[0].worker[0].diagnosefout, /Eigen diagnosefout/);
assert.ok(context._leesDiagnose[0].stack);
assert.throws(() => sessie.layoutFontRequirementsJson('fout'), e => e === eigenFout, 'Primaire fout behouden');
for (let n = 0; n < 30; n++) sessie.layoutDocumentWithRegionsRetainedJson(n);
assert.equal(context._leesDiagnose.length, 20, 'Stackregistratie is begrensd');
assert.equal(context._nativeLees.layoutDocumentWithRegionsRetainedJson.calls, 31);
assert.equal(native.length, 32, 'Elke echte aanroep uitgevoerd ondanks diagnosefout of volle registratie');
sessie.readParagraphs('body');
assert.equal(context._leesDiagnose.length, 20);
assert.equal(context._nativeLees.readParagraphs.calls, 1);
console.log('Werkelijke layoutdiagnose behoudt bronbinding, argumenten, ontvanger en primaire fouten; twintig stacks maximaal.');
