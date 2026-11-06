"""De echte GUI-voorwaarde weigert een ongeldige spellingonderbrekingsproef."""
from pathlib import Path
import shutil
import subprocess
import unittest


class SpellingStartvoorwaarde(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node ontbreekt')
    def test_werkelijke_js_startvoorwaarde(self):
        repo = Path(__file__).resolve().parents[1]
        subprocess.run(['node', 'tests/fixtures/spelling-startvoorwaarde.mjs'], cwd=repo, check=True, timeout=15)
