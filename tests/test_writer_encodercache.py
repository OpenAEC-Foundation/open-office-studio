"""De cacheproef blijft gescheiden van de ongewijzigde referentie-encoder."""
import importlib.util
from pathlib import Path, PurePosixPath, PureWindowsPath
import unittest

REPO=Path(__file__).resolve().parents[1]
ROOT=REPO/'native/onderzoek/writer-encodercache'
spec=importlib.util.spec_from_file_location('encodercache',ROOT/'uitvoeren.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class WriterEncoderCache(unittest.TestCase):
    def test_referentie_en_achterliggende_code_blijven_gelijk(self):
        bron=m.BRON.read_text();ref,kandidaat=m.genereer(bron)
        self.assertEqual(m.sha(m.BRON),m.BRON_SHA)
        self.assertEqual(ref,bron.split('#[cfg(test)]\nmod tests {')[0])
        anker='#[derive(Default)]\nstruct CountingEncoderV1'
        self.assertEqual(ref.split(anker)[1],kandidaat.split(anker)[1].split('\n// Alleen een afzonderlijke proef:')[0])
        self.assertIn('let sorted: BTreeMap<_, _> = values.iter().collect();',kandidaat)
        self.assertIn("Option<&'a mut WaardeCache>",kandidaat)
        self.assertNotIn('thread_local!',kandidaat)

    def test_ontbrekende_of_dubbele_ankers_worden_geweigerd(self):
        for s in ['','doel doel']:
            with self.assertRaisesRegex(RuntimeError,'Bronanker'):
                m.vervang(s,'doel','nieuw')
        with self.assertRaisesRegex(RuntimeError,'Bronanker'):
            m.genereer('Ander bestand')


class WriterEncoderCacheUitvoering(unittest.TestCase):
    def test_regressies_krijgen_geen_onbedoeld_naamfilter(self):
        # Het uitvoerbare pad volgt het platform; de regressieproef mag op
        # geen van beide platformen bron- of meetargumenten als naamfilter krijgen.
        for programma,bron,verwacht in [
            (PurePosixPath('/eigen/proef'),PurePosixPath('/eigen/bron'),['/eigen/proef','/eigen/bron']),
            (PureWindowsPath('C:/eigen/proef.exe'),PureWindowsPath('C:/eigen/bron'),['C:\\eigen\\proef.exe','C:\\eigen\\bron']),
        ]:
            with self.subTest(platform=type(programma).__name__):
                self.assertEqual(m.proefopdracht(programma,True,bron,['33554432']),verwacht[:1])
                self.assertEqual(m.proefopdracht(programma,False,bron,['33554432']),verwacht+['33554432'])

    def test_gefilterde_of_ontbrekende_rust_proeven_tellen_niet_als_geslaagd(self):
        namen=['vormen_mutaties_en_sterke_eigendom','nul_kleine_en_volle_grens_blijven_exact','twee_eigenaren_mutaties_en_externe_updates_blijven_exact']
        tekst='\n'.join(n+' ... ok'for n in namen)+'\n3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        m.controleer_regressies(tekst)
        for fout in ['0 passed; 0 failed; 0 ignored; 0 measured; 3 filtered out',tekst.replace(namen[0],'ontbreekt'),tekst.replace('0 filtered','1 filtered')]:
            with self.assertRaisesRegex(RuntimeError,'niet volledig uitgevoerd'):
                m.controleer_regressies(fout)

if __name__=='__main__':unittest.main()
