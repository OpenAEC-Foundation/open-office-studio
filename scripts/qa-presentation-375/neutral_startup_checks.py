"""Offline source/negative controls for #375; no compiler, VM or Office."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from neutral_startup import DOCS, DRAW, PATCH, RECIPE, plan, sha, verify


class NeutralStartupChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='375-neutral-source-')
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name)
        subprocess.run(['git', 'init', '--quiet', str(self.source)], check=True)
        subprocess.run(['git', 'config', 'core.autocrlf', 'false'], cwd=self.source, check=True)
        relatives = [DRAW, RECIPE, 'include/svtools/miscopt.hxx',
                     'svtools/source/config/miscopt.cxx', 'svtools/source/config/itemholder2.cxx',
                     'test/source/unoapi_test.cxx', 'solenv/gbuild/CppunitTest.mk',
                     'xmloff/source/draw/XMLShapeStyleContext.cxx']
        for relative in relatives:
            dest = self.source / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, dest)
        original = DOCS.parents[2] / 'scripts/qa-presentation-375/runtime-patch/375-solid-rgb-import.patch'
        self.git_apply(original, '--include=' + DRAW)
        self.git_apply(DOCS / '375-test-initialization-proposal.patch')

    def git_apply(self, patch, *extra):
        subprocess.run(['git', 'apply', '--whitespace=error', *extra, str(patch)], cwd=self.source, check=True)

    def test_exact_patch_and_color_assertions_preserved(self):
        before = (self.source / DRAW).read_text()
        result = verify(self.source)
        self.git_apply(PATCH)
        for relative, item in result['files'].items():
            self.assertEqual(item['afterSHA256'], sha(self.source / relative))
        after = (self.source / DRAW).read_text()
        # Preserve the entire original independent color/save/reopen/XML oracle,
        # not merely a marker or count of assertions.
        start = '    auto checkRectangles = [this]() {'
        end = '\nCPPUNIT_TEST_FIXTURE(XmloffDrawTest, testSolidRGBThemeInheritance)'
        self.assertEqual(before[before.index(start):before.index(end)],
                         after[after.index(start):after.index(end)])
        importer = 'xmloff/source/draw/XMLShapeStyleContext.cxx'
        self.assertEqual(result['primarySourceSHA256'][importer], sha(self.source / importer))
        for relative in result['primarySourceSHA256']:
            self.assertEqual((SOURCE / relative).read_bytes(), (self.source / relative).read_bytes())

    def test_changed_test_recipe_stops(self):
        with (self.source / RECIPE).open('ab') as stream:
            stream.write(b'\n# unexpected edit\n')
        with self.assertRaises(AssertionError):
            verify(self.source)

    def test_weakened_color_assertion_stops(self):
        target = self.source / DRAW
        target.write_text(target.read_text().replace('0x14213d', '0x18a303'))
        with self.assertRaises(AssertionError):
            verify(self.source)

    def test_changed_misc_options_source_stops(self):
        with (self.source / 'svtools/source/config/miscopt.cxx').open('ab') as stream:
            stream.write(b'\n// different implementation\n')
        with self.assertRaises(AssertionError):
            verify(self.source)

    def test_importer_already_changed_stops(self):
        with (self.source / 'xmloff/source/draw/XMLShapeStyleContext.cxx').open('ab') as stream:
            stream.write(b'\n// changed importer\n')
        with self.assertRaises(AssertionError):
            verify(self.source)

    def test_only_two_arms_and_two_routes(self):
        calls = plan()
        self.assertEqual(['blank-A', 'blank-B', 'uop-A', 'uop-B'], [c['label'] for c in calls])
        self.assertEqual(4, len({c['retainProfileAs'] for c in calls}))
        self.assertTrue(all(c['freshProfile'] for c in calls))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    SOURCE = args.source.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)
