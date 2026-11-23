"""Regression against the actual failed-run config; never builds or edits source."""
import argparse
import hashlib
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

from source_targets import MODULE, OPTIONAL, RECIPES, select_cli_targets


class TargetSelectionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='375-target-control-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in [MODULE, *(p for _, p in RECIPES)]:
            dest = self.root / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, dest)
        archive = Path(__file__).resolve().parents[2] / 'docs/tests/presentation-375/retained/source-witness-45182719759.zip'
        self.assertEqual('3cf159df0870d218067b2f2f46e8b23e247f0ea4151bce9531579bb823df56a3',
                         hashlib.sha256(archive.read_bytes()).hexdigest())
        with zipfile.ZipFile(archive) as z:
            names = [n for n in z.namelist() if n.endswith('/config_host.mk')]
            self.assertEqual(1, len(names))
            self.config = self.root / 'config_host.mk'
            self.config.write_bytes(z.read(names[0]))

    def test_actual_failed_configuration_omits_unregistered_target(self):
        before = self.config.read_bytes()
        targets, report = select_cli_targets(self.root, self.config)
        self.assertNotIn(OPTIONAL, targets)
        self.assertEqual([OPTIONAL], report['omittedTargets'])
        self.assertEqual(6, len(targets))
        self.assertEqual(before, self.config.read_bytes())

    def test_explicitly_enabled_control_keeps_registered_target(self):
        self.config.write_text(self.config.read_text().replace('export ENABLE_OOENV=\n', 'export ENABLE_OOENV=TRUE\n'))
        targets, report = select_cli_targets(self.root, self.config)
        self.assertIn(OPTIONAL, targets)
        self.assertEqual([], report['omittedTargets'])

    def test_unknown_configuration_stops(self):
        self.config.write_text('export ENABLE_OOENV=guessed\n')
        with self.assertRaises(AssertionError):
            select_cli_targets(self.root, self.config)

    def test_missing_configuration_stops(self):
        self.config.write_text('export SOME_OTHER_FLAG=TRUE\n')
        with self.assertRaises(AssertionError):
            select_cli_targets(self.root, self.config)

    def test_duplicate_configuration_stops(self):
        self.config.write_text('export ENABLE_OOENV=\nexport ENABLE_OOENV=TRUE\n')
        with self.assertRaises(AssertionError):
            select_cli_targets(self.root, self.config)

    def test_changed_module_stops(self):
        (self.root / MODULE).write_text('unverified target registration\n')
        with self.assertRaises(AssertionError):
            select_cli_targets(self.root, self.config)

    def test_missing_required_recipe_stops(self):
        (self.root / RECIPES[0][1]).unlink()
        with self.assertRaises(FileNotFoundError):
            select_cli_targets(self.root, self.config)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    SOURCE = args.source.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)
