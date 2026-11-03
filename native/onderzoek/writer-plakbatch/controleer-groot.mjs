import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createYrsSession, readClipboardSlice, applyClipboardFragment, saveYrsDocx } from '@betteroffice/docx/yrs';
import { unzipSync } from 'fflate';

const map = 'native/onderzoek/writer-plakbatch/.local/grote-proef';
const bronpad = process.argv[2] ?? 'docs/tests/writer-rust-plakbatch/bron-128-tabellen.docx';
const programma = process.env.OFFICE_PLAKBATCH_BIN ?? 'native/onderzoek/writer-plakbatch/.local/target/release/office-plakverkenning';
await mkdir(map, { recursive: true });
const bron = new Uint8Array(await readFile(bronpad));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function canon(v) {
  return Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
}
function stand(s) { return Object.fromEntries(s.storyIds().sort().map(story => [story, s.storySegments(story)])); }
function hash(s) { return sha(JSON.stringify(canon(stand(s)))); }
function aantallen(s) {
  return { bodyalinea: s.paragraphs('body').length,
    bodytabellen: s.storySegments('body').filter(d => d.kind === 'embed' && d.embedKind === 'table').length,
    verhalen: s.storyIds().length };
}
// Een nieuwe DOCX-opening deelt geen interne celverhaal-id's met de oude sessie.
// Vergelijk ieder verhaal daarom op zijn werkelijke structurele tabel-/celpad.
function verhaalteksten(s) {
  const ids = s.storyIds(), kinderen = new Set(), bezocht = new Set(), teksten = {};
  function tabellen(story) { return s.storySegments(story).filter(d => d.kind === 'embed' && d.embedKind === 'table'); }
  for (const id of ids) for (const t of tabellen(id)) for (const rij of t.payload.rows ?? [])
    for (const cel of rij.cells ?? []) if (typeof cel.story === 'string') kinderen.add(cel.story);
  function lees(story, pad, actief) {
    assert.ok(!actief.has(story), 'Geen cyclische celverhalen');
    const verder = new Set(actief); verder.add(story); bezocht.add(story);
    assert.ok(!Object.hasOwn(teksten, pad), 'Uniek structureel verhaalpad');
    teksten[pad] = s.paragraphs(story).map(p => p.text);
    for (const [ti, t] of tabellen(story).entries()) for (const [ri, rij] of (t.payload.rows ?? []).entries())
      for (const [ci, cel] of (rij.cells ?? []).entries()) {
        assert.equal(typeof cel.story, 'string'); lees(cel.story, `${pad}/t${ti}/r${ri}c${ci}`, verder);
      }
  }
  for (const id of ids.filter(id => !kinderen.has(id)).sort()) lees(id, id, new Set());
  assert.deepEqual([...bezocht].sort(), [...ids].sort(), 'Ieder verhaal wordt gecontroleerd');
  return teksten;
}
const basis = await createYrsSession({ clientId: 20264523 });
const ref = await createYrsSession({ clientId: 20264524 });
const native = await createYrsSession({ clientId: 20264525 });
const rapport = {
  scope: 'Afzonderlijke gegevens-/DOCX-proef, geen GUI of algemene snelheidsacceptatie. Twee verschillende runtimes; tijden bevatten verschillende kopieer-/brugkosten.',
  bron_sha256: sha(bron), programma_sha256: sha(await readFile(programma)), stappen: [],
};
try {
  basis.openDocx(bron, true);
  const laatste = basis.paragraphs('body').at(-1);
  const punt = { paraId: laatste.paraId, offset: laatste.text.length };
  const range = { story: 'body', start: punt, end: punt };
  const fragment = readClipboardSlice(basis, { story: 'body', from: 0, to: basis.storyLength('body') - 1 }).fragment;
  assert.ok(fragment, 'De grote bron bevat een gestructureerd fragment');
  const snapshot = basis.encodeStateAsUpdate(), voor = hash(basis);
  rapport.voor = aantallen(basis); rapport.voor_hash = voor;
  for (const s of [ref, native]) {
    s.openDocx(bron, false); s.applyUpdate(snapshot); s.beginUndoCapture();
    s.setUndoCaptureMode('manual'); s.addUndoBoundary(); assert.equal(hash(s), voor);
  }
  const begin = performance.now();
  const caret = applyClipboardFragment(ref, range, fragment);
  rapport.sdk_gegevens_ms = Math.round(performance.now() - begin);
  ref.addUndoBoundary(); const na = hash(ref);
  await writeFile(map + '/verzoek.json', JSON.stringify({ snapshot: Buffer.from(snapshot).toString('base64'), range, fragment, clientId: 20264524 }));
  const run = spawnSync(programma, [map + '/verzoek.json', map + '/uitvoer.json'], {
    env: { ...process.env, OFFICE_EEN_TRANSACTIE: '1' }, encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024,
  });
  await writeFile(map + '/native.log', (run.stdout ?? '') + (run.stderr ?? ''));
  assert.equal(run.status, 0, run.stderr);
  const uit = JSON.parse(await readFile(map + '/uitvoer.json'));
  native.applyLocalUpdate(Buffer.from(uit.delta, 'base64')); native.addUndoBoundary();
  assert.equal(hash(native), na, 'Alle verhalen, opmaak en identiteiten');
  assert.deepEqual(uit.caret, caret, 'Cursor'); rapport.stappen.push('Alle verhalen/opmaak/identiteiten en cursor exact');
  for (const s of [ref, native]) {
    assert.equal(s.undo(), true); assert.equal(hash(s), voor, 'Undo');
    assert.equal(s.redo(), true); assert.equal(hash(s), na, 'Redo');
  }
  rapport.stappen.push('Bronexacte undo en redo op beide routes');
  const r = (await saveYrsDocx(ref, { updateModifiedDate: false })).bytes;
  const n = (await saveYrsDocx(native, { updateModifiedDate: false })).bytes;
  await writeFile(map + '/referentie.docx', r); await writeFile(map + '/native.docx', n);
  const zr = unzipSync(r), zn = unzipSync(n);
  assert.deepEqual(Object.keys(zn).sort(), Object.keys(zr).sort());
  for (const naam of Object.keys(zr)) assert.deepEqual(zn[naam], zr[naam], 'Pakketonderdeel ' + naam);
  rapport.stappen.push('Alle uitgepakte DOCX-onderdelen bytegelijk');
  const terug = await createYrsSession();
  try {
    terug.openDocx(n, true); assert.deepEqual(aantallen(terug), aantallen(native));
    assert.deepEqual(verhaalteksten(terug), verhaalteksten(native), 'Alle teksten na heropenen op hun volledige structurele verhaalpad');
    rapport.stappen.push('Alle verhaalteksten na heropenen structureel exact');
  } finally { terug.destroy(); }
  Object.assign(rapport, { geslaagd: true, na: aantallen(native), na_hash: na,
    cursor: true, exacte_verhalen_opmaak_identiteiten: true, undo_redo: true,
    alle_docx_onderdelen_exact: true, heropenen_alle_verhaalteksten: true,
    native_voorbereiding_ms: uit.toepassen_ms, delta_bytes: uit.delta_bytes,
    docx_onderdelen: Object.keys(zr).length, native_docx_sha256: sha(n), referentie_docx_sha256: sha(r),
  });
} catch (e) { rapport.geslaagd = false; rapport.fout = String(e); process.exitCode = 1; }
finally {
  basis.destroy(); ref.destroy(); native.destroy();
  await writeFile(map + '/rapport.json', JSON.stringify(rapport, null, 2) + '\n');
  console.log(JSON.stringify(rapport));
}
