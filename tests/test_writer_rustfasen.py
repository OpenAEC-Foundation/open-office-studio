"""Meetkopieën mogen de productiekern of bestaande onderzoeksuitvoer nooit vervangen."""
import difflib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / 'native/onderzoek/writer-invoerfasen'
spec = importlib.util.spec_from_file_location('rustfasevoorbereiding', ROOT / 'voorbereiden.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RustFaseVoorbereiding(unittest.TestCase):
    def test_meetpatch_voegt_alleen_regels_toe(self):
        bron = (REPO / 'native/vendor/docx-edit/src/clipboard_batch.rs').read_text()
        gemeten = module.meetcode(bron)
        regels = list(difflib.ndiff(bron.splitlines(True), gemeten.splitlines(True)))
        self.assertFalse(any(r.startswith('- ') for r in regels))
        self.assertEqual(''.join(r[2:] for r in regels if r.startswith('  ')), bron)
        self.assertEqual(gemeten.count('eprintln!'), bron.count('eprintln!') + 2)

    def test_veranderd_meetanker_wordt_geweigerd(self):
        bron = (REPO / 'native/vendor/docx-edit/src/clipboard_batch.rs').read_text()
        with self.assertRaisesRegex(RuntimeError, 'Meetanker gewijzigd'):
            module.meetcode(bron.replace('let cached = cached.filter', 'let cached = andere_filter'))

    def test_bron_en_bestaande_kopieen_blijven_behouden(self):
        with tempfile.TemporaryDirectory(prefix='writer-rustfasen-') as tmp:
            root = Path(tmp)
            for naam in ['bron.json', 'Cargo.lock']:
                shutil.copy2(ROOT / naam, root / naam)
            with patch.object(module, 'ROOT', root), patch.object(module, 'LOKAAL', root / '.local'):
                module.bereid()
                bewijs = json.loads((root / '.local/bronnen.json').read_text())
                for naam in ['basis', 'gemeten']:
                    for rel, h in bewijs['varianten'][naam]['bestanden'].items():
                        self.assertEqual(module.sha(root / '.local' / naam / rel), h)
                module.bereid()
                bron = root / '.local/gemeten/vendor/docx-edit/src/clipboard_batch.rs'
                afwijkend = bron.read_text() + '\n// Bewaarde afwijkende proefkopie.\n'
                bron.write_text(afwijkend)
                with self.assertRaisesRegex(RuntimeError, 'Proefkopie gewijzigd'):
                    module.bereid()
                self.assertEqual(bron.read_text(), afwijkend)
                for rel, h in bewijs['bronnen'].items():
                    self.assertEqual(module.sha(REPO / rel), h)

    def test_afwijkend_bronbewijs_stopt_voor_aanmaken_kopie(self):
        with tempfile.TemporaryDirectory(prefix='writer-rustfasen-') as tmp:
            root = Path(tmp)
            (root / 'bron.json').write_text(json.dumps({'native/Cargo.toml': '0' * 64}))
            with patch.object(module, 'ROOT', root), patch.object(module, 'LOKAAL', root / '.local'):
                with self.assertRaisesRegex(RuntimeError, 'Andere appbron'):
                    module.bereid()
            self.assertFalse((root / '.local/basis').exists())

if __name__ == '__main__': unittest.main()
