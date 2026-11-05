"""De afzonderlijke transportmeting toetst haar bronbinding in de JS-runtime."""
from pathlib import Path
import shutil
import subprocess
import unittest

REPO=Path(__file__).resolve().parents[1]
class WriterBronhergebruik(unittest.TestCase):
    def test_echte_js_helper_behoudt_binding_en_transport(self):
        node=shutil.which('node')
        self.assertIsNotNone(node,'De JS-runtime is nodig voor de transportcontrole')
        p=subprocess.run([node,str(REPO/'native/onderzoek/writer-bronhergebruik/transport.test.cjs')],capture_output=True,text=True,timeout=30)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertIn('begrenzing slagen',p.stdout)
if __name__=='__main__':unittest.main()
