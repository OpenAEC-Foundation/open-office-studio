"""De gouden proef mag ontbrekende of dubbelzinnige Cargo-artefacten niet accepteren."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

PAD = Path(__file__).with_name('controleer-encoder-bytebehoud.py')
SPEC = importlib.util.spec_from_file_location('encoder_bytebehoud', PAD)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class EncoderArtefacten(unittest.TestCase):
    def lees(self, regels):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'artifacten.jsonl'
            p.write_text('\n'.join(json.dumps(r) for r in regels))
            return m.bibliotheken(p)

    def regels(self):
        return [
            {'reason': 'compiler-artifact', 'target': {'name': n}, 'package_id': 'registry+bron#' + n + '@' + v, 'filenames': ['/eigen/lib' + n + '.rlib'], 'fresh': True}
            for n, v in [('yrs', '0.27.4'), ('serde_json', '1.0.0'), ('sha2', '0.10.9')]
        ]

    def test_bestaande_cacheartefacten_tellen_ook(self):
        self.assertEqual(set(self.lees(self.regels())), set(m.NAMEN))

    def test_andere_versie_komt_niet_in_de_gouden_proef(self):
        r = self.regels()
        r.append({'reason': 'compiler-artifact', 'target': {'name': 'sha2'}, 'package_id': 'registry+bron#sha2@0.11.0', 'filenames': ['/anders/libsha2.rlib']})
        self.assertEqual(self.lees(r)['sha2'], Path('/eigen/libsha2.rlib'))

    def test_ontbrekende_bibliotheek_wordt_geweigerd(self):
        with self.assertRaisesRegex(RuntimeError, 'Ontbrekende of dubbelzinnige'):
            self.lees(self.regels()[:-1])

    def test_dubbele_bibliotheek_wordt_geweigerd(self):
        r = self.regels()
        r.append({**r[0], 'filenames': ['/anders/libyrs.rlib']})
        with self.assertRaisesRegex(RuntimeError, 'Ontbrekende of dubbelzinnige'):
            self.lees(r)


if __name__ == '__main__':
    unittest.main()
