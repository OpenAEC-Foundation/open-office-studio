"""Een versienummer alleen bewijst niet welke bron is meegeleverd."""
from pathlib import Path
import importlib.util
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('pakketcontrole', Path(__file__).with_name('controleer-pakket.py'))
controle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controle)


class Pakketbron(unittest.TestCase):
    def test_windows_checkout_behoudt_eigen_lf_en_oorspronkelijke_binaire_en_vendorbytes(self):
        with tempfile.TemporaryDirectory(prefix='office-regelafbreking-') as tijdelijk:
            repo = Path(tijdelijk)/'repo'
            uitvoer = Path(tijdelijk)/'uitvoer'
            repo.mkdir()
            uitvoer.mkdir()
            subprocess.run(['git', 'init', '-q', str(repo)], check=True)
            bestanden = {
                '.gitattributes': (Path(__file__).resolve().parents[2]/'.gitattributes').read_bytes(),
                'native/Cargo.toml': b'[workspace]\nmembers = []\n',
                'native/crates/proef/src/lib.rs': b'pub fn proef() {}\n',
                'native/scripts/proef.py': b'print("proef")\n',
                'native/docs/proef.json': b'{"eigen": true}\n',
                'docs/voorbeelden/proef.json': b'{"eigen": true}\n',
                'LICENSE': b'Eigen proeftekst\n',
                'native/vendor/proef-bron.json': b'{"bron": "eigen"}\n',
                'native/crates/proef/document.docx': b'PK\x00\x01\r\n\n',
                'native/docs/proef.png': b'\x89PNG\r\n\x1a\n\x00',
                'native/vendor/openaec-ui/src/proef.rs': b'// Oorspronkelijke bytes\r\n\n',
            }
            for naam, inhoud in bestanden.items():
                pad = repo/naam
                pad.parent.mkdir(parents=True, exist_ok=True)
                pad.write_bytes(inhoud)
            subprocess.run(['git', '-C', str(repo), '-c', 'core.autocrlf=true', 'add', '.'], check=True)
            subprocess.run(['git', '-C', str(repo), '-c', 'core.autocrlf=true', 'checkout-index', '--all', '--prefix='+uitvoer.as_posix()+'/'], check=True)
            for naam, inhoud in bestanden.items():
                self.assertEqual((uitvoer/naam).read_bytes(), inhoud, naam)

    def test_dezelfde_versie_met_andere_ontbrekende_of_extra_bron_wordt_geweigerd(self):
        with tempfile.TemporaryDirectory(prefix='office-pakketbron-') as tijdelijk:
            checkout = Path(tijdelijk)/'checkout'
            verpakt = Path(tijdelijk)/'verpakt'
            bestanden = {
                'native/Cargo.toml': '[workspace.package]\nversion = "1.0.0-alpha.1"\n',
                'native/Cargo.lock': 'eigen proef\n',
                'native/README.md': 'Eigen pakketproef\n',
                'native/crates/kern/src/lib.rs': 'pub fn versie() -> u8 { 1 }\n',
                'LICENSE': 'Eigen proeftekst\n',
                '.gitattributes': '*.rs text eol=lf\n',
            }
            for naam, tekst in bestanden.items():
                pad = checkout/naam
                pad.parent.mkdir(parents=True, exist_ok=True)
                pad.write_text(tekst, encoding='utf-8')
            shutil.copytree(checkout, verpakt)
            cache = checkout/'native/scripts/__pycache__/tijdelijk.pyc'
            cache.parent.mkdir(parents=True)
            cache.write_bytes(b'niet meeverpakken')
            self.assertEqual(controle.controleer_bronbytes(verpakt, checkout), len(bestanden))
            kern = verpakt/'native/crates/kern/src/lib.rs'
            kern.write_text('pub fn versie() -> u8 { 2 }\n', encoding='utf-8')
            with self.assertRaisesRegex(AssertionError, 'Verpakte bron wijkt af'):
                controle.controleer_bronbytes(verpakt, checkout)
            kern.unlink()
            with self.assertRaisesRegex(AssertionError, 'Bestandslijst'):
                controle.controleer_bronbytes(verpakt, checkout)
            shutil.copy2(checkout/'native/crates/kern/src/lib.rs', kern)
            (verpakt/'extra.txt').write_text('Onverwachte bron', encoding='utf-8')
            with self.assertRaisesRegex(AssertionError, 'Bestandslijst'):
                controle.controleer_bronbytes(verpakt, checkout)


if __name__ == '__main__':
    unittest.main()
