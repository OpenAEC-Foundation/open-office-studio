"""Primaire werkerfouten mogen geen misleidende ZIP-fout of groene proef worden."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import AsyncMock
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lettertypebewijs', REPO/'scripts/gui/lettertype_bewijs.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LettertypeBewijs(unittest.IsolatedAsyncioTestCase):
    async def voer(self, r, resultaat=None):
        with tempfile.TemporaryDirectory() as tmp:
            p = type('Proef', (), {'run': AsyncMock(return_value=r)})()
            return await module.controleer(p, Path(tmp), resultaat)

    async def test_primaire_fout_blijft_voor_lege_zip_bewaard(self):
        uit = {}
        with self.assertRaisesRegex(AssertionError, 'Eigen primaire werkertrap'):
            await self.voer({'geslaagd': False, 'fout': 'Eigen primaire werkertrap', 'diagnose': {'fase': 'bewaren'}, 'gevallen': [{'naam': 'caladea', 'docx': []}]}, uit)
        self.assertFalse(uit['geslaagd'])
        self.assertEqual(uit['diagnose']['fase'], 'bewaren')
        self.assertEqual(uit['gevallen'][0]['docx'], [])

    async def test_minder_dan_vier_varianten_is_afgekeurd(self):
        with self.assertRaisesRegex(AssertionError, 'vier'):
            await self.voer({'geslaagd': True, 'gevallen': []})

    async def test_geen_null_leeg_of_onjuiste_binaire_export(self):
        for data in [None, [], 'bytes', [256], [-1], [True]]:
            with self.subTest(data=data), self.assertRaisesRegex(AssertionError, 'Ongeldige DOCX'):
                await self.voer({'geslaagd': True, 'gevallen': [{'naam': 'proef', 'docx': data} for _ in range(4)]})

    async def test_volledige_tekst_en_alle_opmaak_blijven_verplicht(self):
        gevallen = []
        for naam, opmaak in [('caladea', '<w:rFonts w:ascii="Caladea"/>'), ('carlito', '<w:rFonts w:ascii="Carlito"/>'), ('vet', '<w:b/>'), ('cursief', '<w:i/>')]:
            b = io.BytesIO()
            with ZipFile(b, 'w') as z:
                z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr>'+opmaak+'</w:rPr><w:t>Eigen tekst</w:t></w:r></w:p></w:body></w:document>')
            gevallen.append({'naam': naam, 'docx': list(b.getvalue()), **({'familie': naam.capitalize()} if naam in ['caladea', 'carlito'] else {'stijl': 'bold' if naam == 'vet' else 'italic'})})
        r = {'geslaagd': True, 'gevallen': gevallen, 'alinea_aantal': 1, 'tekst_sha256': hashlib.sha256(json.dumps(['Eigen tekst'], separators=(',', ':')).encode()).hexdigest()}
        import copy
        afwijkend = copy.deepcopy(r)
        afwijkend['tekst_sha256'] = '0' * 64
        with self.assertRaisesRegex(AssertionError, 'volledige documenttekst'):
            await self.voer(afwijkend)
        afwijkend = copy.deepcopy(r)
        afwijkend['gevallen'][0]['familie'] = 'Andere familie'
        with self.assertRaisesRegex(AssertionError, 'gekozen lettertype'):
            await self.voer(afwijkend)
        uit = await self.voer(r)
        self.assertTrue(uit['geslaagd'])
        self.assertTrue(all(g['xml_exact'] and g['volledige_tekst_exact'] for g in uit['gevallen']))

    def test_echte_javascript_helper_met_twaalf_scenarios(self):
        subprocess.run([shutil.which('node') or str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'), str(REPO/'tests/fixtures/lettertype-bewijs.mjs')], check=True, timeout=30)

if __name__ == '__main__': unittest.main()
