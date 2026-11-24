"""Small source/resource controls; these do not execute LibreOffice or make."""
import argparse
from pathlib import Path
import shutil
import tempfile
import unittest

from test_initialization import PRIMARY, RECIPE, RESOURCE_INSTALLED, RESOURCE_SOURCE, resource_receipt, verified_inputs


class InitializationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='375-ui-control-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in PRIMARY:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, target)

    def test_exact_primary_inputs_and_target_mapping(self):
        result = verified_inputs(self.root)
        self.assertEqual(str(self.root.resolve() / 'workdir/UIConfig/modules/simpress.done'), result['resourceTarget'])
        self.assertEqual('UIConfig_modules/simpress', result['topLevelResourceGoal'])
        self.assertFalse(result['initializationPatchChangesProductionImporter'])

    def test_changed_bootstrap_fetch_wrapper_stops(self):
        wrapper = self.root / 'Makefile.in'
        wrapper.write_text(wrapper.read_text().replace('bootstrap fetch', 'bootstrap'))
        with self.assertRaises(AssertionError):
            verified_inputs(self.root)

    def test_changed_recipe_stops_before_patch(self):
        (self.root / RECIPE).write_text('unexpected recipe\n')
        with self.assertRaises(AssertionError):
            verified_inputs(self.root)

    def test_missing_installed_resource_stops(self):
        with self.assertRaises(FileNotFoundError):
            resource_receipt(self.root)

    def test_resource_requires_exact_source_bytes(self):
        installed = self.root / RESOURCE_INSTALLED
        installed.parent.mkdir(parents=True)
        shutil.copyfile(self.root / RESOURCE_SOURCE, installed)
        before = installed.read_bytes()
        result = resource_receipt(self.root)
        self.assertEqual(len(before), result['bytes'])
        self.assertEqual(before, installed.read_bytes())
        installed.write_bytes(b'wrong resource')
        with self.assertRaises(AssertionError):
            resource_receipt(self.root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    SOURCE = args.source.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)
