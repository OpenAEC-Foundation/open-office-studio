"""De eigen wachtrijmeting bewaart retourwaarden, fouten en methode-eigendom."""
from pathlib import Path
import shutil,subprocess,unittest
REPO=Path(__file__).resolve().parents[1]
class WriterWachtrijmeting(unittest.TestCase):
    def test_echte_js_observator(self):
        node=shutil.which('node');self.assertIsNotNone(node)
        p=subprocess.run([node,str(REPO/'native/onderzoek/writer-wachtrijmeting/meting.test.cjs')],capture_output=True,text=True,timeout=30)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertIn('herstel slagen',p.stdout)
if __name__=='__main__':unittest.main()
