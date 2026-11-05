import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('writer_foutcontext', REPO / 'scripts/bewaar-writer-foutcontext.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WriterFoutcontext(unittest.TestCase):
    def test_bewaart_de_vaste_seed_en_oorspronkelijke_tabelgreepproef(self):
        self.gegevens['script_sha256'] = module.checksum(REPO/'scripts/test-writer-tabelgrepen-native.py')
        self.rapport.write_text(json.dumps(self.gegevens))
        begin = self.map/'Tabelproef-begin.docx'
        begin.write_bytes(b'Eigen oorspronkelijke tabelproefbron')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        with tarfile.open(self.uitvoer/'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/proef/Tabelproef-begin.docx').read(), begin.read_bytes())
            self.assertEqual(tar.extractfile('writer-foutcontext/public/templates/nieuw.docx').read(), (REPO/'public/templates/nieuw.docx').read_bytes())
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/test-writer-tabelgrepen-native.py').read(), (REPO/'scripts/test-writer-tabelgrepen-native.py').read_bytes())
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/test-writer-lang-native.py').read(), (REPO/'scripts/test-writer-lang-native.py').read_bytes())
            for naam in ['docs/voorbeelden/Ontwerpnotitie.docx', 'docs/tests/writer-rust-plakbatch/bron-128-tabellen.docx']:
                self.assertEqual(tar.extractfile('writer-foutcontext/'+naam).read(), (REPO/naam).read_bytes())
        self.assertEqual(context['bronbestanden']['public/templates/nieuw.docx']['sha256'], module.checksum(REPO/'public/templates/nieuw.docx'))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.map = Path(self.tmp.name)
        self.programma = self.map / 'programma met spatie'
        self.programma.write_bytes(b'\x7fELF-eigen-proefbinary')
        self.programma.chmod(0o755)
        self.rapport = self.map / 'rapport.json'
        self.gegevens = {'geslaagd': False, 'programma_sha256': module.checksum(self.programma), 'script_sha256': module.checksum(REPO / 'scripts/test-writer-lang-native.py'), 'versie': '2026.45.21', 'fout': 'Eigen afgekeurde proef'}
        self.schrijf()
        self.uitvoer = self.map / 'uitvoer'

    def schrijf(self):
        self.rapport.write_text(json.dumps(self.gegevens))

    def test_bewaart_exacte_bytes_en_herleidbare_checksums(self):
        with patch.dict('os.environ', {'GITHUB_SHA': 'a' * 40, 'GITHUB_TOKEN': 'niet-in-het-pakket'}):
            context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertEqual(context['programma_sha256'], self.gegevens['programma_sha256'])
        self.assertTrue(context['scripts']['test-writer-lang-native.py']['beschikbaar'])
        self.assertNotIn('niet-in-het-pakket', json.dumps(context))
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/open-office-studio').read(), self.programma.read_bytes())
            sommen = tar.extractfile('writer-foutcontext/SHA256SUMS').read().decode().splitlines()
            for regel in sommen:
                som, naam = regel.split('  ', 1)
                self.assertEqual(hashlib.sha256(tar.extractfile('writer-foutcontext/' + naam).read()).hexdigest(), som)

    def test_weigert_een_andere_binary_voordat_er_bestanden_worden_gemaakt(self):
        self.programma.write_bytes(b'andere binary')
        with self.assertRaisesRegex(ValueError, 'hoort niet'):
            module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertFalse(self.uitvoer.exists())

    def test_bewaart_de_begrensde_workerbron_en_haar_oorspronkelijke_helper(self):
        bron = self.map / 'workerbron.json'
        bron.write_text(json.dumps({'schema': 1, 'volledig': True, 'begin': [1, 2], 'berichten': []}))
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertEqual(context['proefbestanden']['workerbron.json']['sha256'], module.checksum(bron))
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/proef/workerbron.json').read(), bron.read_bytes())
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/gui/worker_bron.js').read(), (REPO/'scripts/gui/worker_bron.js').read_bytes())

    def test_bewaart_alleen_de_vaste_eigen_lettertypevarianten_met_exacte_helper(self):
        namen = ['Lettertype-caladea.docx', 'Lettertype-carlito.docx', 'Lettertype-vet.docx', 'Lettertype-cursief.docx']
        for naam in namen:
            (self.map/naam).write_bytes(('Eigen proef '+naam).encode())
        (self.map/'ander-lettertype.docx').write_bytes(b'Niet opnemen')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        with tarfile.open(self.uitvoer/'writer-foutcontext.tar.gz') as tar:
            for naam in namen:
                self.assertEqual(tar.extractfile('writer-foutcontext/proef/'+naam).read(), (self.map/naam).read_bytes())
                self.assertEqual(context['proefbestanden'][naam]['sha256'], module.checksum(self.map/naam))
            self.assertNotIn('writer-foutcontext/proef/ander-lettertype.docx', tar.getnames())
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/gui/lettertype_bewijs.js').read(), (REPO/'scripts/gui/lettertype_bewijs.js').read_bytes())

    def test_vervangt_geen_afkeuring_door_een_groen_rapport(self):
        groen = self.map / 'groen.json'
        groen.write_text(json.dumps({**self.gegevens, 'geslaagd': True}))
        context = module.bewaar(self.programma, [self.map / 'ontbreekt.json', groen, self.rapport], self.uitvoer, systeem=False)
        self.assertEqual(context['status'], 'afgekeurde_proef_met_exacte_binary')
        self.assertFalse(json.loads((self.uitvoer / 'inhoud/rapport.json').read_text())['geslaagd'])

    def test_slaat_ontbrekende_en_groene_proeven_over_zonder_pakket(self):
        self.gegevens['geslaagd'] = True
        self.schrijf()
        self.assertIsNone(module.bewaar(self.programma, [self.map / 'ontbreekt.json', self.rapport], self.uitvoer, systeem=False))
        self.assertFalse(self.uitvoer.exists())

    def test_noemt_een_ander_testscript_niet_de_oorspronkelijke_proef(self):
        self.gegevens['script_sha256'] = '0' * 64
        self.schrijf()
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertFalse(context['proefscript']['beschikbaar'])
        self.assertEqual(context['proefscript']['gerapporteerde_sha256'], '0' * 64)
        self.assertFalse((self.uitvoer / 'inhoud/scripts/test-writer-lang-native.py').exists())

    def test_bewaart_de_afgekeurde_plakproef_na_een_groene_langdocumentproef(self):
        groen = self.map / 'lang/rapport.json'
        groen.parent.mkdir()
        groen.write_text(json.dumps({**self.gegevens, 'geslaagd': True}))
        for naam in ['test-writer-rijk-plakken-native.py', 'test-writer-rust-plakken-volgorde-native.py', 'test-writer-rust-tekst-native.py']:
            with self.subTest(proefscript=naam):
                script = REPO / 'scripts' / naam
                self.uitvoer = self.map / naam
                self.gegevens['script_sha256'] = module.checksum(script)
                self.schrijf()
                (self.map / 'Ontwerpnotitie.docx').write_bytes(b'eigen kopie van de vaste proefbron')
                (self.map / 'programma.log').write_text('Eigen rendererfout')
                context = module.bewaar(self.programma, [groen, self.rapport], self.uitvoer, systeem=False)
                self.assertEqual(context['proefscript']['naam'], script.name)
                self.assertTrue(context['proefscript']['beschikbaar'])
                with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
                    self.assertEqual(tar.extractfile('writer-foutcontext/scripts/' + script.name).read(), script.read_bytes())
                    if naam == 'test-writer-rijk-plakken-native.py':
                        helper = 'scripts/gui/spelling_vervolginvoer.js'
                        self.assertEqual(tar.extractfile('writer-foutcontext/' + helper).read(), (REPO / helper).read_bytes())
                        self.assertEqual(context['scripts']['gui/spelling_vervolginvoer.js']['sha256'], module.checksum(REPO / helper))
                    self.assertEqual(tar.extractfile('writer-foutcontext/proef/Ontwerpnotitie.docx').read(), b'eigen kopie van de vaste proefbron')
                    self.assertEqual(tar.extractfile('writer-foutcontext/proef/programma.log').read().decode(), 'Eigen rendererfout')
                # De gedeelde basis wordt meegenomen, zonder een onbewezen claim over
                # de oorspronkelijke helperbytes van een historische uitvoering.
                self.assertIn('niet afzonderlijk', context['scripts']['test-writer-lang-native.py']['herkomst'])

    def test_plakrapport_met_verkeerde_binary_maakt_geen_pakket(self):
        self.gegevens['script_sha256'] = module.checksum(REPO / 'scripts/test-writer-rijk-plakken-native.py')
        self.schrijf()
        self.programma.write_bytes(b'een andere bouw van dezelfde versie')
        with self.assertRaisesRegex(ValueError, 'hoort niet'):
            module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertFalse(self.uitvoer.exists())

    def test_bewaart_de_exacte_rendererproef_met_eigen_bron_en_gedeelde_basis(self):
        script = REPO / 'scripts/test-writer-rendererfout-native.py'
        self.gegevens['script_sha256'] = module.checksum(script)
        self.schrijf()
        (self.map / 'Rendererproef.docx').write_bytes(b'eigen rendererbron')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertEqual(context['proefscript']['naam'], script.name)
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/' + script.name).read(), script.read_bytes())
            self.assertEqual(tar.extractfile('writer-foutcontext/proef/Rendererproef.docx').read(), b'eigen rendererbron')
            self.assertIn('test-writer-lang-native.py', context['scripts'])

    def test_kiest_geen_willekeurige_begeleidende_appimage(self):
        pakketten = self.map / 'pakketten'
        pakketten.mkdir()
        for naam in ['een.AppImage', 'twee.AppImage']:
            (pakketten / naam).write_bytes(b'eigen proefverpakking')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, pakketten, systeem=False)
        self.assertEqual(len(context['appimage']['gevonden']), 2)
        self.assertFalse(list((self.uitvoer / 'inhoud').glob('*.AppImage')))

    def test_bewaart_alleen_de_vaste_eigen_proefbestanden(self):
        (self.map / 'Prestatieproef.docx').write_bytes(b'eigen gewijzigde proefbron')
        (self.map / 'niet-meenemen.txt').write_text('ander bestand')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        self.assertEqual(context['proefbestanden']['Prestatieproef.docx']['sha256'], module.checksum(self.map / 'Prestatieproef.docx'))
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/proef/Prestatieproef.docx').read(), b'eigen gewijzigde proefbron')
            self.assertFalse(any(m.name.endswith('niet-meenemen.txt') for m in tar.getmembers()))

    def test_bewaart_de_afwijkende_eigen_herstelkopie_met_metadata(self):
        for naam, data in [('herstel-afwijkend.docx', b'eigen oudere herstelkopie'),
                           ('herstel-afwijkend.json', b'{"datum":123}')]:
            (self.map / naam).write_bytes(data)
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            for naam in ['herstel-afwijkend.docx', 'herstel-afwijkend.json']:
                self.assertEqual(tar.extractfile('writer-foutcontext/proef/' + naam).read(), (self.map / naam).read_bytes())
                self.assertIn(naam, context['proefbestanden'])

    def test_bewaart_framebasis_en_de_exacte_diagnosecode(self):
        for naam in ['framebasis.json', 'framebasis.inspectiefout.json', 'framebasis-lettertypen.json', 'framebasis-lettertypen.inspectiefout.json']:
            (self.map / naam).write_text('{"eigen_proef":true}\n')
        context = module.bewaar(self.programma, [self.rapport], self.uitvoer, systeem=False)
        with tarfile.open(self.uitvoer / 'writer-foutcontext.tar.gz') as tar:
            self.assertEqual(tar.extractfile('writer-foutcontext/scripts/gui/framebasis.js').read(), (REPO / 'scripts/gui/framebasis.js').read_bytes())
            for naam in ['framebasis.json', 'framebasis.inspectiefout.json', 'framebasis-lettertypen.json', 'framebasis-lettertypen.inspectiefout.json']:
                self.assertEqual(tar.extractfile('writer-foutcontext/proef/' + naam).read(), (self.map / naam).read_bytes())
                self.assertIn(naam, context['proefbestanden'])


if __name__ == '__main__':
    unittest.main()
