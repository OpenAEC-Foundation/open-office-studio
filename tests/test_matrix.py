"""Testmatrix-hulpmiddelen: synthetische fixtures en onafhankelijke kenmerkcontrole.

Deze proeven gebruiken alleen de standaardbibliotheek en geen engine; ze testen
of de fixtures de kenmerken uit de testmatrix bevatten en of de controle verlies
en onbedoelde tekstwijziging herkent. Ze vervangen de engineproef
(scripts/test-matrix-documenten.mjs) niet.
"""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SCRIPTS = Path(__file__).parents[1] / 'scripts'


def laad(naam, bestand):
    spec = importlib.util.spec_from_file_location(naam, SCRIPTS / bestand)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixtures = laad('matrixfixtures', 'maak-matrixfixtures.py')
kenmerken = laad('matrix_kenmerken', 'matrix_kenmerken.py')


class Matrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.map = tempfile.TemporaryDirectory()
        cls.pad = Path(cls.map.name)
        cls.delen = fixtures.maak_alle()
        for naam, delen in cls.delen.items():
            fixtures.schrijf_pakket(cls.pad / naam, delen)

    @classmethod
    def tearDownClass(cls):
        cls.map.cleanup()

    def variant(self, naam, wijzig=None, weglaten=()):
        delen = {k: v for k, v in self.delen[naam].items() if k not in weglaten}
        for deel, functie in (wijzig or {}).items():
            delen[deel] = functie(delen[deel])
        doel = self.pad / ('variant-' + naam)
        fixtures.schrijf_pakket(doel, delen)
        return doel

    def test_reproduceerbaar(self):
        # Vergelijk de werkelijke fixturepakketten. Een extra testarchief met
        # actuele ZIP-tijdstempels liet deze proef op een klokgrens onterecht falen.
        pakketten = []
        for klok in [(2026, 1, 2, 0, 0, 0, 4, 2, -1),
                     (2026, 1, 3, 0, 0, 0, 5, 3, -1)]:
            with patch('zipfile.time.localtime', return_value=klok):
                pakketten.append({naam: fixtures.zip_bytes(delen)
                                  for naam, delen in fixtures.maak_alle().items()})
        self.assertEqual(pakketten[0], pakketten[1])
        for naam, inhoud in pakketten[0].items():
            with self.subTest(bestand=naam), zipfile.ZipFile(io.BytesIO(inhoud)) as z:
                self.assertTrue(z.infolist())
                for deel in z.infolist():
                    self.assertEqual(deel.date_time, fixtures.TIJD, deel.filename)

    def test_fixtures_bevatten_de_matrixkenmerken(self):
        d1 = kenmerken.kenmerken(self.pad / 'D1.docx')
        for k in ('koppen', 'koptekst_relatie', 'voettekst_relatie', 'briefpapier_logo_in_koptekst', 'paginanummerveld'):
            self.assertTrue(d1[k], k)
        d2 = kenmerken.kenmerken(self.pad / 'D2.docx')
        self.assertEqual((d2['tabellen'], d2['secties']), (2, 2))
        self.assertTrue(d2['afbeelding_in_hoofdtekst'] and d2['liggende_sectie'])
        d3 = kenmerken.kenmerken(self.pad / 'D3.docx')
        for k in ('opmerkingen', 'voetnoten', 'custom_xml_onderdeel', 'custom_xml_eigenschappen',
                  'onbekend_onderdeel_met_relatie', 'onbekend_onderdeel_inhoudstype'):
            self.assertTrue(d3[k], k)
        self.assertEqual((d3['revisie_invoeging'], d3['revisie_verwijdering'], d3['onbekend_element_in_hoofdtekst']), (1, 1, 1))
        p1 = kenmerken.kenmerken(self.pad / 'P1.pptx')
        self.assertTrue(p1['masters'] and p1['lay_outs'] and p1['thema'] and p1['afbeelding'] and p1['dia_lettertype_expliciet'])
        self.assertEqual(p1['thema_lettertypen'], 'Calibri,Georgia')
        p2 = kenmerken.kenmerken(self.pad / 'P2.pptx')
        self.assertTrue(p2['grafiek'] and p2['tabel'] and p2['sprekersnotities'] and p2['notitiemaster'])
        p3 = kenmerken.kenmerken(self.pad / 'P3.pptx')
        self.assertTrue(p3['animatie'] and p3['overgang'] and p3['ingebed_object'] and p3['ole_verwijzing'])
        self.assertEqual(p3['onbekende_extensie_op_dia'], 2)
        self.assertTrue(p3['onbekend_onderdeel_met_relatie'] and p3['onbekend_onderdeel_inhoudstype'])

    def test_bewerkingsfragment_komt_eenmaal_voor(self):
        for geval, (deel, oud, nieuw) in fixtures.BEWERKINGEN.items():
            bestand = next(n for n in self.delen if n.startswith(geval))
            teksten = kenmerken.alineateksten(self.pad / bestand)
            self.assertEqual(sum(a.count(oud) for v in teksten.values() for a in v), 1, geval)
            self.assertIn(oud, ''.join(teksten[deel]))
            self.assertNotIn(nieuw, ''.join(''.join(v) for v in teksten.values()))

    def test_verloren_onbekend_onderdeel_en_kop(self):
        bron = self.pad / 'D3.docx'
        kopie = self.variant('D3.docx', weglaten=['word/openaec-matrix.xml'])
        r = kenmerken.beoordeel(bron, kopie)
        self.assertIn('onbekend_onderdeel_met_relatie', r['kenmerken_verloren'])
        self.assertEqual(r['pakket']['verwijderd'], ['word/openaec-matrix.xml'])
        zonder_kop = self.variant('D1.docx', wijzig={'word/document.xml': lambda x: x.replace('<w:headerReference w:type="default" r:id="rIdKop"/>', '')})
        self.assertIn('koptekst_relatie', kenmerken.beoordeel(self.pad / 'D1.docx', zonder_kop)['kenmerken_verloren'])

    def test_revisie_en_animatie_verloren(self):
        zonder_ins = self.variant('D3.docx', wijzig={'word/document.xml': lambda x: x.replace('<w:ins ', '<w:insX ').replace('</w:ins>', '</w:insX>')})
        self.assertIn('revisie_invoeging', kenmerken.beoordeel(self.pad / 'D3.docx', zonder_ins)['kenmerken_verloren'])
        zonder_timing = self.variant('P3.pptx', wijzig={'ppt/slides/slide1.xml': lambda x: x[:x.index('<p:timing>')] + x[x.index('</p:timing>') + len('</p:timing>'):]})
        self.assertIn('animatie', kenmerken.beoordeel(self.pad / 'P3.pptx', zonder_timing)['kenmerken_verloren'])

    def test_bedoelde_wijziging_en_onbedoelde_tekst(self):
        deel, oud, nieuw = fixtures.BEWERKINGEN['P2']
        bewerking = {'onderdeel': deel, 'oud': oud, 'nieuw': nieuw}
        goed = self.variant('P2.pptx', wijzig={deel: lambda x: x.replace(oud, nieuw)})
        t = kenmerken.beoordeel(self.pad / 'P2.pptx', goed, bewerking)
        self.assertTrue(t['tekst']['wijziging_aanwezig'] and t['tekst']['overige_tekst_ongewijzigd'])
        self.assertEqual(t['pakket']['pakketcontrole'], 'geen_onverwachte_pakketverschillen')
        self.assertEqual(t['xml_structureel_gelijk'], {deel: True})
        fout = self.variant('P2.pptx', wijzig={deel: lambda x: x.replace(oud, nieuw).replace('Kwartaalcijfers', 'Jaarcijfers')})
        t = kenmerken.beoordeel(self.pad / 'P2.pptx', fout, bewerking)
        self.assertFalse(t['tekst']['overige_tekst_ongewijzigd'])
        self.assertEqual(t['tekst']['onderdelen_met_afwijkende_tekst'], [deel])

    def test_herschreven_xml_is_structureel_gelijk(self):
        herschreven = self.variant('P1.pptx', wijzig={'ppt/slides/slide1.xml': lambda x: x.replace('lang="nl-NL" dirty="0"', 'dirty="0" lang="nl-NL"')})
        r = kenmerken.beoordeel(self.pad / 'P1.pptx', herschreven)
        self.assertEqual(r['pakket']['gewijzigd'], ['ppt/slides/slide1.xml'])
        self.assertEqual(r['xml_structureel_gelijk'], {'ppt/slides/slide1.xml': True})


if __name__ == '__main__':
    unittest.main()
