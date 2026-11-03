"""Een versienummer alleen bewijst niet welke bron is meegeleverd."""
from pathlib import Path
import importlib.util
import hashlib
import json
import os
import runpy
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('pakketcontrole', Path(__file__).with_name('controleer-pakket.py'))
controle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controle)


class Pakketbron(unittest.TestCase):
    def test_pakketnaam_blijft_geldig_na_meeverpakken_van_webview_stijlbronnen(self):
        with tempfile.TemporaryDirectory(prefix='office-verpakproef-') as tijdelijk:
            repo = Path(tijdelijk)
            bestanden = {
                'native/Cargo.toml': '[workspace.package]\nversion="1.0.0-alpha.1"\n',
                'native/Cargo.lock': 'eigen lock\n',
                'native/README.md': 'Eigen pakket\n',
                'native/docs/proef.txt': 'Eigen documentatie\n',
                'native/target/release/open-office-studio-native': 'Eigen programmaproef\n',
                'native/target/release/controleer-bestand': 'Eigen controleproef\n',
                'native/vendor/openaec-ui/licenses/proef.txt': 'Eigen licentie\n',
                'native/vendor/openaec-ui/LICENSE.md': 'Eigen licentie\n',
                'native/vendor/openaec-ui/NOTICE.md': 'Eigen bron\n',
                'native/vendor/document-fonts/LICENSES/proef.txt': 'Eigen licentie\n',
                'native/vendor/document-fonts/LICENSES-CJK/proef.txt': 'Eigen licentie\n',
                'native/vendor/symbolen/OFL.txt': 'Eigen licentie\n',
                'native/crates/office-webview/stijlbronnen.json': '{"stijl":["src/office.css"],"benodigd":["src/stijl/bron.json"]}\n',
                'src/office.css': '.office{height:100dvh}\n',
                'src/stijl/bron.json': '{"eigen":true}\n',
                'public/templates/proef.txt': 'Eigen sjabloon\n',
                'docs/voorbeelden/proef.json': '{"eigen":true}\n',
                'LICENSE': 'Eigen licentie\n',
                '.gitattributes': '*.css text eol=lf\n',
            }
            for naam, inhoud in bestanden.items():
                pad = repo/naam
                pad.parent.mkdir(parents=True, exist_ok=True)
                pad.write_text(inhoud, encoding='utf-8')
            script = repo/'native/scripts/verpak.py'
            script.parent.mkdir(parents=True)
            shutil.copy2(Path(__file__).with_name('verpak.py'), script)
            uitvoer = repo/'github-output.txt'
            # Alleen de externe programma's zijn vervangen; het echte script
            # kopieert en verpakt alle bestanden en berekent de controlehash.
            antwoorden = ['Open Office Studio 1.0.0-alpha.1 (native)',
                          'Open Office native bestandscontrole 1.0.0-alpha.1 (release)',
                          json.dumps({'packages': []})]
            with patch('platform.system', return_value='Linux'), patch('platform.machine', return_value='proef'), patch('subprocess.check_output', side_effect=antwoorden), patch.dict(os.environ, {'GITHUB_OUTPUT': str(uitvoer)}):
                runpy.run_path(str(script), run_name='__main__')
            naam = 'Open-Office-Studio-native-1.0.0-alpha.1-Linux-proef'
            archief = repo/'native/target/distributie'/f'{naam}.zip'
            with zipfile.ZipFile(archief) as pakket:
                for bron in ['src/office.css', 'src/stijl/bron.json']:
                    self.assertEqual(pakket.read(f'{naam}/bron/{bron}'), (repo/bron).read_bytes())
                self.assertTrue(all(p.startswith(naam+'/') for p in pakket.namelist()))
            controlehash = hashlib.sha256(archief.read_bytes()).hexdigest()
            self.assertEqual(archief.with_suffix('.sha256').read_text(encoding='utf-8'), f'{controlehash}  {archief.name}\n')
            self.assertIn(f'pakket={archief}', uitvoer.read_text(encoding='utf-8'))

    def test_webview_stijlbron_buiten_native_moet_exact_aanwezig_zijn(self):
        with tempfile.TemporaryDirectory(prefix='office-webview-pakket-') as tijdelijk:
            checkout = Path(tijdelijk)/'checkout'
            verpakt = Path(tijdelijk)/'verpakt'
            bestanden = {
                'native/Cargo.toml': b'[workspace]\nmembers=[]\n',
                'native/Cargo.lock': b'eigen lock\n',
                'native/README.md': b'Eigen pakket\n',
                'LICENSE': b'Eigen licentie\n',
                '.gitattributes': b'*.css text eol=lf\n',
                'native/crates/office-webview/stijlbronnen.json': b'{"stijl":["src/office.css"],"benodigd":["src/stijl/merk.svg"]}\n',
                'src/office.css': b'.office{height:100dvh}\n',
                'src/stijl/merk.svg': b'<svg/>\n',
            }
            for naam, inhoud in bestanden.items():
                pad = checkout/naam
                pad.parent.mkdir(parents=True, exist_ok=True)
                pad.write_bytes(inhoud)
            shutil.copytree(checkout, verpakt)
            self.assertEqual(controle.controleer_bronbytes(verpakt, checkout), len(bestanden))
            stijl = verpakt/'src/office.css'
            stijl.write_bytes(b'.office{height:90dvh}\n')
            with self.assertRaisesRegex(AssertionError, 'Verpakte bron wijkt af'):
                controle.controleer_bronbytes(verpakt, checkout)
            stijl.unlink()
            with self.assertRaisesRegex(AssertionError, 'Bestandslijst'):
                controle.controleer_bronbytes(verpakt, checkout)

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
                'native/vendor/xlsx-parse-AANPASSINGEN.md': b'# Eigen parsernotities\n',
                'native/crates/proef/document.docx': b'PK\x00\x01\r\n\n',
                'native/docs/proef.png': b'\x89PNG\r\n\x1a\n\x00',
                'native/vendor/openaec-ui/src/proef.rs': b'// Oorspronkelijke bytes\r\n\n',
                'native/vendor/xlsx-parse/src/lf.rs': b'// Oorspronkelijke LF\n',
                'native/vendor/xlsx-parse/src/crlf.rs': b'// Oorspronkelijke CRLF\r\n',
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
