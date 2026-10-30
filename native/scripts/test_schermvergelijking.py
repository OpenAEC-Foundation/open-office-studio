"""Voorkom een onterecht groen resultaat bij onvergelijkbare of transparante beelden."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

SCRIPT = Path(__file__).with_name('vergelijk-schermen.py')

class Schermvergelijking(unittest.TestCase):
    def setUp(self):
        self.tijdelijk = tempfile.TemporaryDirectory()
        self.addCleanup(self.tijdelijk.cleanup)
        self.map = Path(self.tijdelijk.name)
        self.a = self.map/'a.png'
        self.b = self.map/'b.png'
        Image.new('RGBA',(4,3),(255,255,255,255)).save(self.a)
        Image.new('RGBA',(4,3),(255,255,255,255)).save(self.b)

    def vergelijk(self):
        r = subprocess.run([sys.executable,str(SCRIPT),str(self.a),str(self.b),'--uitvoer',str(self.map/'resultaat')],capture_output=True,text=True)
        return r.returncode, json.loads((self.map/'resultaat/rapport.json').read_text())

    def test_verliesvrije_identieke_beelden_slagen(self):
        code, r = self.vergelijk()
        self.assertEqual(code,0)
        self.assertTrue(r['geslaagd'])
        self.assertEqual(r['afwijkende_pixels'],0)

    def test_transparantieverschil_telt_mee(self):
        im = Image.open(self.b).copy()
        im.putpixel((1,1),(255,255,255,0))
        im.save(self.b)
        code, r = self.vergelijk()
        self.assertEqual(code,1)
        self.assertEqual(r['afwijkende_pixels'],1)
        self.assertFalse(r['geslaagd'])

    def test_jpeg_met_png_extensie_is_geen_pixelbewijs(self):
        Image.new('RGB',(4,3),'white').save(self.a,format='JPEG')
        code, r = self.vergelijk()
        self.assertEqual(code,2)
        self.assertFalse(r['meetbaar'])
        self.assertIn('JPEG',r['reden'])

    def test_verschillende_viewports_zijn_niet_meetbaar(self):
        Image.new('RGBA',(5,3),'white').save(self.b)
        code, r = self.vergelijk()
        self.assertEqual(code,2)
        self.assertFalse(r['geslaagd'])
        self.assertFalse(r['meetbaar'])

if __name__ == '__main__':
    unittest.main()
