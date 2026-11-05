"""Een diagnose bewaart de echte afkeuring en kan haar niet groen maken."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('afkeuringsbewaking', REPO/'scripts/gui/afkeuringsbewaking.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Afkeuringsbewaking(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.uit = Path(self.tmp.name)
        self.p = Mock(consoleberichten=[{'level': 'error', 'text': 'Eigen werkertrap'}], opruimfouten=[])
        self.p.ev = AsyncMock(side_effect=[True, {'toetsen': [], 'workers': [{'uitgevallen': True}]}])
        self.p.fouten = AsyncMock(return_value={'gui': ['Eigen werkertrap']})
        self.beeld = Mock()

    async def test_bewaart_primaire_werkerfout_en_toestand_voor_afsluiten(self):
        origineel = AssertionError('Native bewaren ontbreekt')
        with self.assertRaises(AssertionError) as r:
            async with module.bewaak(self.p, self.uit, self.beeld):
                raise origineel
        self.assertIs(r.exception, origineel)
        uit = json.loads((self.uit/'afkeuring-lijsten.json').read_text())
        self.assertEqual(uit['fouten']['gui'], ['Eigen werkertrap'])
        self.assertTrue(uit['toestand']['workers'][0]['uitgevallen'])
        self.beeld.assert_called_once_with('afgekeurd')

    async def test_verbroken_inspectie_en_beeld_verbergen_geen_afkeuring(self):
        self.p.ev.side_effect = [True, RuntimeError('Eigen pagina weg')]
        self.p.fouten.side_effect = RuntimeError('Eigen verbinding weg')
        self.beeld.side_effect = RuntimeError('Eigen venster weg')
        with self.assertRaisesRegex(AssertionError, 'Oorspronkelijk'):
            async with module.bewaak(self.p, self.uit, self.beeld):
                raise AssertionError('Oorspronkelijk')
        uit = json.loads((self.uit/'afkeuring-lijsten.json').read_text())
        self.assertIn('Eigen verbinding weg', uit['fouten_inspectiefout'])
        self.assertIn('Eigen pagina weg', uit['toestand_inspectiefout'])
        self.assertIn('Eigen venster weg', uit['beeld_inspectiefout'])

    async def test_onbeschrijfbare_uitvoer_verbergt_geen_afkeuring(self):
        with self.assertRaisesRegex(ValueError, 'Oorspronkelijk'):
            async with module.bewaak(self.p, self.uit/'ontbreekt', self.beeld):
                raise ValueError('Oorspronkelijk')
        self.assertEqual(len(self.p.opruimfouten), 1)

    async def test_geslaagde_proef_wordt_niet_onterecht_als_afkeuring_bewaard(self):
        async with module.bewaak(self.p, self.uit, self.beeld):
            pass
        self.p.fouten.assert_not_awaited()
        self.beeld.assert_not_called()
        self.assertFalse((self.uit/'afkeuring-lijsten.json').exists())

    async def test_ontbrekende_instrumentatie_is_geen_groene_proef(self):
        self.p.ev.side_effect = RuntimeError('Bewaking ontbreekt')
        with self.assertRaisesRegex(RuntimeError, 'Bewaking ontbreekt'):
            async with module.bewaak(self.p, self.uit, self.beeld):
                self.fail('Proef mag niet starten')

if __name__ == '__main__': unittest.main()
