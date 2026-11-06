"""Afgekeurde lettertypemeting behoudt de bronfout en herstelt haar omwikkelingen."""
from pathlib import Path
import shutil
import subprocess
import unittest

REPO = Path(__file__).resolve().parents[1]


class WriterLettertypebewaking(unittest.TestCase):
    def test_echte_meetbron_ruimt_ook_bij_afkeuring_op(self):
        node = shutil.which('node')
        self.assertIsNotNone(node)
        resultaat = subprocess.run(
            [node, str(REPO/'native/onderzoek/writer-lettertypebewaking/controleren.cjs')],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(resultaat.returncode, 0, resultaat.stdout+resultaat.stderr)
        self.assertEqual(resultaat.stdout.count('volledig herstel gecontroleerd'), 4)
