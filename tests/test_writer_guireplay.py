"""De opname van de eigen GUI-bron begrenst gegevens en behoudt het transport."""
from pathlib import Path
import shutil,subprocess,unittest
REPO=Path(__file__).resolve().parents[1]
class WriterGuiReplay(unittest.TestCase):
    def test_js_opname_begrenzing_en_doorgeven(self):
        node=shutil.which('node');self.assertIsNotNone(node)
        p=subprocess.run([node,str(REPO/'native/onderzoek/writer-guireplay/opnemen.test.cjs')],capture_output=True,text=True,timeout=30)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertIn('herstel slagen',p.stdout)
if __name__=='__main__':unittest.main()
