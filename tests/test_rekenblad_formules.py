"""Onafhankelijke formulecontrole: handmatig afgeleide uitkomsten tegen de evaluator.

De verwachte waarden hieronder zijn met de hand uitgerekend (afleiding als commentaar). Zij
toetsen de evaluator; de evaluator toetst daarna de rekenkern in scripts/test-matrix-rekenbladen.mjs.
"""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).parents[1] / 'scripts'


def laad(naam, bestand):
    spec = importlib.util.spec_from_file_location(naam, SCRIPTS / bestand)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixtures = laad('rekenbladfixtures', 'maak-rekenbladfixtures.py')
formules = laad('rekenblad_formules', 'rekenblad_formules.py')


def waarden(resultaat):
    return {k: v['waarde'] for k, v in resultaat.items()}


class Formulecontrole(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.map = tempfile.TemporaryDirectory()
        cls.pad = Path(cls.map.name)
        for naam, maak in [('r1', fixtures.r1), ('r2', fixtures.r2), ('r3', fixtures.r3),
                           ('cache', fixtures.verouderde_cache), ('onbekend', fixtures.onbekende_functies),
                           ('fouten', fixtures.foutwaarden)]:
            maak().schrijf(cls.pad / f'{naam}.xlsx')
        fixtures.groot(rijen=3, kolommen=4)[0].schrijf(cls.pad / 'groot.xlsx')

    @classmethod
    def tearDownClass(cls):
        cls.map.cleanup()

    def test_r1_voor_en_na_bewerking(self):
        self.assertEqual(waarden(formules.verwacht(self.pad / 'r1.xlsx')), {
            'Berekening!B1': 25.0,          # 10 × 2,5
            'Berekening!B2': 22.5,          # 25 × (1 − 0,1)
            'Berekening!B3': 27.23,         # ROUND(22,5 × 1,21 = 27,225; 2) → 27,23
            'Samenvatting!B1': 74.73,       # 25 + 22,5 + 27,23
            'Samenvatting!B2': 4.2,         # (10 + 2,5 + 0,1) / 3
            'Samenvatting!B3': 'hoog',      # 74,73 > 50
            'Samenvatting!B4': 2.25,        # 22,5 / 10
            'Samenvatting!B5': 4.73,        # 27,23 − 22,5
        })
        na = waarden(formules.verwacht(self.pad / 'r1.xlsx', {('Invoer', 'B1'): '20'}))
        self.assertEqual(na['Berekening!B1'], 50.0)                    # 20 × 2,5
        self.assertEqual(na['Berekening!B2'], 45.0)                    # 50 × 0,9
        self.assertEqual(na['Berekening!B3'], 54.45)                   # 45 × 1,21
        self.assertAlmostEqual(na['Samenvatting!B1'], 149.45, places=9)
        self.assertAlmostEqual(na['Samenvatting!B2'], 22.6 / 3, places=9)
        self.assertEqual(na['Samenvatting!B4'], 2.25)                  # 45 / 20
        self.assertAlmostEqual(na['Samenvatting!B5'], 9.45, places=9)  # 54,45 − 45

    def test_r2_benoemd_bereik_en_verborgen_blad(self):
        self.assertEqual(waarden(formules.verwacht(self.pad / 'r2.xlsx')), {
            'Gegevens!B6': 400.0,           # 120 + 80 + 150 + 50 via Omzet
            'Gegevens!B7': 14.0,            # Verborgen!A1 (7) × 2
            'Verborgen!A2': 407.0,          # 7 + 400
        })

    def test_r3_bewerking_buiten_draaitabel(self):
        na = waarden(formules.verwacht(self.pad / 'r3.xlsx', {('Data', 'C2'): '15'}))
        self.assertEqual(na, {'Data!C6': 105.0, 'Data!C7': 4.0})        # 15 + 20 + 30 + 40

    def test_cachewaarden_tellen_niet(self):
        self.assertEqual(waarden(formules.verwacht(self.pad / 'cache.xlsx')), {
            'Cache!A3': 5.0, 'Cache!A4': 50.0, 'Cache!A5': 60.0, 'Cache!A6': 6.0, 'Cache!B1': 'ok'})
        na = waarden(formules.verwacht(self.pad / 'cache.xlsx', {('Cache', 'A1'): '4'}))
        self.assertEqual(na['Cache!A5'], 4 + 3 + 7 + 70)

    def test_onbekende_functies_en_fouten(self):
        self.assertEqual(waarden(formules.verwacht(self.pad / 'onbekend.xlsx')), {
            'Functies!C1': '#NAME?', 'Functies!C2': '#NAME?', 'Functies!C3': 'twee',
            'Functies!C4': '1-2-3', 'Functies!C5': 7.0, 'Functies!C6': '#NAME?',
            'Functies!C7': 1.0})                                       # FACT(1)
        self.assertEqual(waarden(formules.verwacht(self.pad / 'fouten.xlsx')), {
            'Fouten!B1': '#DIV/0!', 'Fouten!B2': '#REF!', 'Fouten!B3': '#N/A', 'Fouten!B4': '#N/A',
            'Fouten!B5': -1.0, 'Fouten!B6': True, 'Fouten!B7': '#VALUE!', 'Fouten!B8': '#DIV/0!'})

    def test_exportmeting_blijft_gescheiden_van_de_verwachting(self):
        # De bron bevat bewust 999 als cache, maar A1+A2 = 2+3 = 5.
        pad = self.pad / 'cache.xlsx'
        self.assertEqual(formules.opgeslagen(pad)['Cache!A3'], {'soort': 'number', 'waarde': 999.0})
        self.assertEqual(formules.verwacht(pad)['Cache!A3'], {'soort': 'number', 'waarde': 5.0})
        # Ook na lezen van de cache blijft de onafhankelijke berekening onaangetast.
        self.assertEqual(formules.verwacht(pad, {('Cache', 'A1'): '4'})['Cache!A3']['waarde'], 7.0)
        na = waarden(formules.verwacht(self.pad / 'fouten.xlsx', {('Fouten', 'A2'): '4'}))
        self.assertEqual((na['Fouten!B1'], na['Fouten!B5'], na['Fouten!B6']), (2.5, 2.5, False))

    def test_groot_werkboek_rijsommen(self):
        uit = waarden(formules.verwacht(self.pad / 'groot.xlsx'))
        rij = lambda r: sum((r * 7 + k * 13) % 1000 for k in range(4))
        self.assertEqual(uit['Groot!E1'], rij(1))
        self.assertEqual(uit['Groot!F1'], rij(1) + rij(2) + rij(3))

    def test_cache_in_fixtures_klopt_behalve_bij_bewuste_afwijkingen(self):
        for naam in ('r1', 'r2', 'r3', 'fouten', 'groot'):
            werkboek = formules.lees_werkboek(self.pad / f'{naam}.xlsx')
            verwacht = formules.verwacht(self.pad / f'{naam}.xlsx')
            with zipfile.ZipFile(self.pad / f'{naam}.xlsx') as archief:
                inhoud = ''.join(archief.read(n).decode() for n in archief.namelist() if n.startswith('xl/worksheets/'))
            for sleutel, v in verwacht.items():
                if v['soort'] == 'number':
                    tekst = fixtures.getal(v['waarde'])
                    self.assertIn(f'<v>{tekst}</v>', inhoud, f'{naam} {sleutel}')
            self.assertTrue(werkboek['formules'])

    def test_excel_afronding_en_niet_nagebouwde_functies(self):
        self.assertEqual(formules.excel_afronden(22.5 * 1.21, 2), 27.23)
        self.assertEqual(formules.excel_afronden(-2.5, 0), -3.0)
        rekenaar = formules.Bereken({'cellen': {}, 'formules': {('B', 'A1'): 'RAND()'}, 'namen': {}})
        with self.assertRaises(formules.NietNagebouwd):
            rekenaar.cel('B', 'A1')

    def test_fixtures_zijn_reproduceerbaar(self):
        a, b = self.pad / 'a.xlsx', self.pad / 'b.xlsx'
        fixtures.r3().schrijf(a)
        fixtures.r3().schrijf(b)
        self.assertEqual(hashlib.sha256(a.read_bytes()).digest(), hashlib.sha256(b.read_bytes()).digest())


if __name__ == '__main__':
    unittest.main()
