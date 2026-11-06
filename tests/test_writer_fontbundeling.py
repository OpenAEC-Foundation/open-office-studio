"""De host-poort behoudt actuele bronvragen en oorspronkelijke workerfouten."""
from pathlib import Path
import shutil,subprocess,unittest
REPO=Path(__file__).resolve().parents[1]
class WriterFontbundeling(unittest.TestCase):
    def test_echte_js_poort(self):
        node=shutil.which('node');self.assertIsNotNone(node)
        p=subprocess.run([node,str(REPO/'native/onderzoek/writer-fontbundeling/poort.test.cjs')],capture_output=True,text=True,timeout=30)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertIn('herstel slagen',p.stdout)
if __name__=='__main__':unittest.main()
