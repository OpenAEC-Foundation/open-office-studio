"""Diagnostiek mag oorspronkelijke motoraanroepen en fouten niet vervangen."""
from pathlib import Path
import shutil
import subprocess
import unittest


class LayoutLeesdiagnose(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node ontbreekt')
    def test_werkelijke_js_meetpunten(self):
        repo = Path(__file__).resolve().parents[1]
        subprocess.run(['node', 'tests/fixtures/layout-leesdiagnose.mjs'], cwd=repo, check=True, timeout=15)
