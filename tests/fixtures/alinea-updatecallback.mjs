import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { preloadEditWasm, createEditSession } = await import(pathToFileURL(process.cwd() + '/node_modules/@betteroffice/docx/dist/wasm-edit.mjs'));
await preloadEditWasm(readFileSync(process.env.OOS_NOOT_WASM ?? 'vendor/tekstengine/docx_edit_bg.wasm'));
const bron = createEditSession(81023);
bron.create_story('body', 'Begin 😀', 'Normal', 'left');
bron.create_story('hulp', 'Hulptekst', 'Normal', 'left');
const begin = bron.encode_state(), vector = bron.encode_state_vector();
bron.apply_raw_ops('body', JSON.stringify([{ op: 'insert', index: 0, text: 'Nieuwe tekst ' }]));
const update = bron.encode_diff(vector);
bron.free();
const gevallen = [];
for (const herkomst of ['local', 'remote']) for (const gedeeld of [false, true]) {
  const sessies = [createEditSession(81023), createEditSession(81023)];
  try {
    for (const s of sessies) {
      s.load(begin); s.track_undo();
      if (gedeeld) s.begin_shared_reads();
      s.paragraph_spans('body'); s.story_segment_unit_digests('body');
    }
    const [referentie, s] = sessies, meldingen = [];
    s.set_update_observer(() => {
      const melding = { geweigerd: [] };
      meldingen.push(melding);
      for (const verhaal of ['body', 'hulp']) {
        try { s.paragraph_spans(verhaal); melding.geweigerd.push(null); }
        catch (fout) { melding.geweigerd.push(String(fout)); }
      }
    });
    for (const sessie of sessies) {
      sessie.add_undo_boundary();
      if (herkomst === 'local') sessie.apply_local_update(update);
      else sessie.apply_update(update);
    }
    assert(meldingen.length > 0);
    for (const melding of meldingen) for (const fout of melding.geweigerd) {
      assert.equal(typeof fout, 'string');
      assert.match(fout, /read.only transaction/i);
      assert.doesNotMatch(fout, /RuntimeError|unreachable|recursive use/);
    }
    s.clear_update_observer();
    const na = s.encode_state(), naVector = s.encode_state_vector();
    for (const verhaal of ['body', 'hulp']) assert.equal(s.paragraph_spans(verhaal), referentie.paragraph_spans(verhaal));
    assert.deepEqual(s.encode_state(), referentie.encode_state());
    assert.deepEqual(s.encode_state_vector(), referentie.encode_state_vector());
    assert.deepEqual(s.encode_state(), na); assert.deepEqual(s.encode_state_vector(), naVector);
    if (herkomst === 'local') {
      for (const sessie of sessies) { assert(sessie.can_undo()); sessie.undo(); }
      assert.equal(s.paragraph_spans('body'), referentie.paragraph_spans('body'));
      for (const sessie of sessies) sessie.redo();
      assert.equal(s.paragraph_spans('body'), referentie.paragraph_spans('body'));
    }
    if (gedeeld) for (const sessie of sessies) sessie.end_shared_reads();
    gevallen.push({ herkomst, gedeeld, weigeringen: meldingen.length * 2, bronEnVectorGelijk: true, sessieBruikbaar: true });
  } finally { for (const sessie of sessies) sessie.free(); }
}
console.log(JSON.stringify({ gevallen }));
