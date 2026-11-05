"""De sorteerproef mag bestaande bronnen of controles niet vervangen."""
import difflib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO/'native/onderzoek/writer-deterministische-sortering'
spec = importlib.util.spec_from_file_location('deterministischesortering', ROOT/'voorbereiden.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class WriterDeterministischeSortering(unittest.TestCase):
    def test_alleen_tijdelijke_sorteerstructuur_verandert(self):
        bron = (REPO/'native/vendor/docx-edit/src/deterministic.rs').read_text()
        nieuw = module.sorteercode(bron)
        verschil = list(difflib.ndiff(bron.splitlines(), nieuw.splitlines()))
        self.assertEqual([r[2:] for r in verschil if r.startswith('- ')], ['            let sorted: BTreeMap<_, _> = values.iter().collect();'])
        self.assertEqual([r[2:] for r in verschil if r.startswith('+ ')], [
            '            let mut sorted: Vec<_> = values.iter().collect();',
            '            sorted.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));',
        ])
        self.assertIn('for (key, value) in sorted', nieuw)

    def test_gewijzigd_anker_wordt_geweigerd(self):
        with self.assertRaisesRegex(RuntimeError, 'Bronanker'):
            module.sorteercode('Andere bron')
        with self.assertRaisesRegex(RuntimeError, 'Bronanker'):
            module.sorteercode('            let sorted: BTreeMap<_, _> = values.iter().collect();\n'*2)

    def test_bestaande_kopie_is_idempotent_en_wordt_nooit_overschreven(self):
        # Een eigen minimale referentie; CI heeft geen lokale onderzoeksbinary.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref = root/'referentie'
            bron = REPO/'native/vendor/docx-edit/src/deterministic.rs'
            bestanden = {
                'voorbereiden.py': 'def bereid(): pass\n',
                'Cargo.lock': '# Eigen vaste proeflock\n',
                'src/main.rs': 'fn main() {}\n',
                'controleer.mjs': 'const ROOT=dirname(fileURLToPath(import.meta.url));\n',
                '.local/gemeten/Cargo.toml': 'path = "../../src/main.rs"\n',
                '.local/gemeten/vendor/docx-edit/src/deterministic.rs': bron.read_text(),
            }
            for naam, tekst in bestanden.items():
                p = ref/naam; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(tekst)
            binary = ref/'.local/basis/office-writer-invoerprofiel'
            binary.parent.mkdir(parents=True); binary.write_bytes(b'\x7fELF-eigen-proef')
            (root/'bron.json').write_text(json.dumps({n:module.sha(ref/n) for n in ['voorbereiden.py','Cargo.lock','src/main.rs','controleer.mjs']}))
            lokaal = root/'.local'
            with patch.object(module, 'ROOT', root), patch.object(module, 'REFERENTIE', ref), patch.object(module, 'LOKAAL', lokaal), patch.object(module, 'BASIS_ELF', module.sha(binary)):
                module.bereid()
                module.bereid()
                bewijs = json.loads((lokaal/'bronnen.json').read_text())
                for n, h in bewijs['bestanden'].items():
                    self.assertEqual(module.sha(lokaal/n), h)
                p = lokaal/'gemeten/vendor/docx-edit/src/deterministic.rs'
                fout = p.read_text()+'\n// Bewaarde afwijkende proefkopie.\n'
                p.write_text(fout)
                with self.assertRaisesRegex(RuntimeError, 'Bestaande sorteerproef gewijzigd'):
                    module.bereid()
                self.assertEqual(p.read_text(), fout)

    def test_afwijkende_referentie_stopt_voor_aanmaken_kopie(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = Path(tmp)
            (r/'bron.json').write_text(json.dumps({'Cargo.lock':'0'*64}))
            with patch.object(module, 'ROOT', r), patch.object(module, 'LOKAAL', r/'.local'):
                with self.assertRaisesRegex(RuntimeError, 'Andere referentiebron'):
                    module.bereid()
            self.assertFalse((r/'.local').exists())

if __name__ == '__main__': unittest.main()
