import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('frame_inspector', REPO/'scripts/gui/webkit_inspector.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Framebewaking(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pad = Path(self.tmp.name)/'framebasis.json'
        self.inspectie = module.Inspector(0)
        self.inspectie.ws = type('Verbinding', (), {'close': AsyncMock()})()

    async def test_bewaart_de_bevroren_diagnose_voor_de_foutaanroeper(self):
        i = self.inspectie
        i.ev = AsyncMock(return_value=True)
        await i.begin_framebewaking(self.pad)
        with self.assertRaisesRegex(RuntimeError, 'al gestart'):
            await i.begin_framebewaking(self.pad)
        gegevens = {'schema': 1, 'fout': {'tekst': 'FrameDelta: eigen proef', 'stacks': ['volledige stack']}}
        i.ev.side_effect = [[], [], gegevens]
        i.consoleberichten = [{'level': 'error', 'text': 'Eigen afgekeurde proef'}]
        fouten = await i.fouten()
        self.assertEqual(fouten['console'], i.consoleberichten)
        self.assertEqual(json.loads(self.pad.read_text()), gegevens)

    async def test_behoudt_de_oorspronkelijke_afkeuring_als_diagnose_export_faalt(self):
        i = self.inspectie
        i.framebasis_uitvoer = self.pad
        i.ev = AsyncMock(side_effect=RuntimeError('Eigen testpagina weg'))
        await i.__aexit__(AssertionError, AssertionError('Oorspronkelijke afkeuring'), None)
        self.assertIn('Eigen testpagina weg', self.pad.with_suffix('.inspectiefout.json').read_text())
        i.ws.close.assert_awaited_once()

    async def test_geeft_geen_groene_proef_bij_ontbrekende_diagnose(self):
        i = self.inspectie
        i.framebasis_uitvoer = self.pad
        i.ev = AsyncMock(return_value=None)
        with self.assertRaisesRegex(RuntimeError, 'ontbreekt'):
            await i.__aexit__(None, None, None)
        self.assertFalse(self.pad.exists())
        i.ws.close.assert_awaited_once()

    async def test_fouten_blijven_beschikbaar_als_de_diagnose_export_mislukt(self):
        i = self.inspectie
        i.framebasis_uitvoer = self.pad
        i.consoleberichten = [{'level': 'error', 'text': 'Oorspronkelijke workerfout'}]
        i.ev = AsyncMock(side_effect=[[], [], RuntimeError('Eigen diagnose niet leesbaar')])
        self.assertEqual((await i.fouten())['console'], i.consoleberichten)
        self.assertIn('Eigen diagnose niet leesbaar', self.pad.with_suffix('.inspectiefout.json').read_text())

    async def test_ook_een_schrijffout_vervangt_de_oorspronkelijke_afkeuring_niet(self):
        i = self.inspectie
        i.framebasis_uitvoer = self.pad/'ontbreekt/framebasis.json'
        i.ev = AsyncMock(return_value=None)
        await i.__aexit__(AssertionError, AssertionError('Oorspronkelijke workerfout'), None)
        self.assertIn('diagnosebestand niet geschreven', i.framebasis_exportfout)
        i.ws.close.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
