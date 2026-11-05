"""De replicacacheproef houdt bronbinding en oorspronkelijke encoderregels vast."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

REPO=Path(__file__).resolve().parents[1]
ROOT=REPO/'native/onderzoek/writer-replicacache'
spec=importlib.util.spec_from_file_location('replicacache',ROOT/'voorbereiden.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class WriterReplicaCache(unittest.TestCase):
    def test_cache_blijft_binnen_bestaande_bevestigde_replicabinding(self):
        s=(REPO/'native/vendor/docx-edit/src/clipboard_batch.rs').read_text();nieuw=m.replicacode(s)
        a=s.index('    let cached = cached.filter');b=s.index('    let doc = if let Some(c)')
        self.assertIn(s[a:b],nieuw)
        self.assertIn('(c.doc,c.encoding_cache)',nieuw)
        self.assertIn('WaardeCache::nieuw(32*1024*1024)',nieuw)
        self.assertIn('if doc.holds_pending_update()',nieuw)
        self.assertIn('if snapshot.len() > max_source_bytes',nieuw)
        self.assertIn('encoding_cache, client_id,',nieuw)

    def test_geheugen_wordt_aan_bestaande_meting_toegevoegd(self):
        bron=(REPO/'native/crates/office-writer-plakken/src/bronspiegel.rs').read_text()
        nieuw=m.spiegelcode(bron)
        self.assertEqual(nieuw.replace('\n            .saturating_add(self.voorstel.as_ref().map_or(0,|p|p.encoding_cache_bytes()))',''),bron)

    def test_oorspronkelijke_encoder_en_algemene_testmodule_blijven_behouden(self):
        bron=(REPO/'native/vendor/docx-edit/src/deterministic.rs').read_text()
        nieuw=m.encodercode(bron,(ROOT.parent/'writer-encodercache/cache.rs').read_text())
        anker='#[derive(Default)]\nstruct CountingEncoderV1'
        self.assertTrue(nieuw.split(anker)[1].startswith(bron.split(anker)[1]))
        self.assertIn('pub(crate) fn encode_state_cached_v1',nieuw)
        self.assertNotIn('pub struct ProefReplica',nieuw)
        self.assertNotIn('thread_local!',nieuw)
        self.assertIn('return encode_state_as_update_v1(txn,&StateVector::default())',nieuw)

    def test_onbekende_en_dubbele_ankers_worden_geweigerd(self):
        for s in ['', 'anker anker']:
            with self.assertRaisesRegex(RuntimeError,'Bronanker'):
                m.vervang(s,'anker','nieuw')
        with self.assertRaisesRegex(RuntimeError,'Bronanker'):m.replicacode('Andere bron')

    def test_bewaarde_kopie_wordt_gecontroleerd_en_niet_overschreven(self):
        with tempfile.TemporaryDirectory()as tmp:
            r=Path(tmp);ref=r/'referentie';ref.mkdir();(ref/'voorbereiden.py').write_text('def bereid(): pass\n')
            basis=ref/'.local/basis/office-writer-invoerprofiel';basis.parent.mkdir(parents=True);basis.write_bytes(b'eigen ELF')
            lokaal=r/'.local';lokaal.mkdir();bron=lokaal/'eigen.rs';bron.write_text('eigen behouden code')
            (r/'bron.json').write_text('{}');(lokaal/'bronnen.json').write_text(json.dumps({'bestanden':{'eigen.rs':m.sha(bron)}}))
            with patch.object(m,'ROOT',r),patch.object(m,'LOKAAL',lokaal),patch.object(m,'REFERENTIE',ref),patch.object(m,'BASIS_ELF',m.sha(basis)):
                m.bereid();bron.write_text('afwijkende bewaarde code')
                with self.assertRaisesRegex(RuntimeError,'Bestaande proef gewijzigd'):m.bereid()
                self.assertEqual(bron.read_text(),'afwijkende bewaarde code')
if __name__=='__main__':unittest.main()
