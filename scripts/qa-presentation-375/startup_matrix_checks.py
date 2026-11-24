"""Synthetic protocol/negative controls; never execute Office or make."""
import argparse
import ast
from pathlib import Path
import shutil
import tempfile
import unittest

from neutral_startup import plan
from startup_matrix import MARKER, PRIMARY, PROFILE, TEST_LOG, classify, execute, snapshot


def example(call, red=False):
    selector = call['argv'][-1].split('=', 1)[1]
    arm, route = call['arm'], call['route']
    text = f'[_RUN_____] {selector}\nUOP375_STARTUP arm={arm} phase=before-init documents=0 frames=0\n'
    if arm == 'B':
        text += 'UOP375_STARTUP arm=B phase=options-held theme=configured automatic=1\n'
    text += f'UOP375_STARTUP arm={arm} phase=before-load\nUOP375_STARTUP route={route} phase=after-load\n'
    if red:
        text += f'xmloff/qa/unit/draw.cxx:1:{selector}\nequality assertion failed\n- Expected: -1\n- Actual  : 4\n- {MARKER}\n'
    text += 'UOP375_STARTUP phase=after-base-teardown options-released\n'
    text += selector + ' finished in: 42ms\n'
    text += (f'Test name: {selector}\nFailures !!!\nRun: 1   Failure total: 1   Failures: 1   Errors: 0\n' if red else 'OK (1)\n')
    return text


class ProtocolChecks(unittest.TestCase):
    def test_full_leaf_selectors_and_exact_matrix(self):
        self.assertEqual(['blank-A', 'blank-B', 'uop-A', 'uop-B'], [c['label'] for c in plan()])
        self.assertEqual(['testUOP375BlankImpressStartup::TestBody'] * 2 +
                         ['testUOFExplicitRectangleFillColors::TestBody'] * 2,
                         [c['argv'][-1].split('=', 1)[1] for c in plan()])

    def test_one_completed_test_and_original_red(self):
        for call in plan():
            red = call['route'] == 'uop'
            result = classify(example(call, red), 2 if red else 0, call, 1)
            self.assertEqual('EXPECTED_COLOR_RED' if red else 'PASS', result['classification'])

    def test_no_test_is_never_pass(self):
        self.assertEqual('FAIL', classify('OK (0)\n', 0, plan()[0], 1)['classification'])

    def test_crash_after_original_assertion_is_not_red(self):
        call = plan()[3]
        self.assertEqual('FAIL', classify(example(call, True) + 'SIGSEGV\n', 2, call, 1)['classification'])

    def test_teardown_or_second_failure_is_not_red(self):
        call = plan()[3]
        for text in [example(call, True).replace('Failures: 1', 'Failures: 2'),
                     example(call, True).replace('after-base-teardown', 'teardown-never-completed'),
                     example(call, True).replace('Errors: 0', 'Errors: 1')]:
            self.assertEqual('FAIL', classify(text, 2, call, 1)['classification'])

    def test_wrong_value_location_or_selector_is_not_red(self):
        call = plan()[3]
        for text in [example(call, True).replace('Actual  : 4', 'Actual  : 5'),
                     example(call, True).replace('draw.cxx:1:', 'draw.cxx:2:'),
                     example(call, True).replace('testUOFExplicitRectangleFillColors', 'differentTest')]:
            self.assertEqual('FAIL', classify(text, 2, call, 1)['classification'])

    def test_changed_initialization_arm_is_fail(self):
        call = plan()[0]
        self.assertEqual('FAIL', classify(example(call) + 'phase=options-held\n', 0, call, 1)['classification'])

    def test_controller_has_no_importer_or_engine_execution(self):
        source = Path(__file__).with_name('source_build.py').read_text()
        ast.parse(source)
        self.assertNotIn("run('importer-diff'", source)
        self.assertNotIn("run('corrected-xmloff-draw'", source)
        self.assertNotIn("run('corrected-converter-engine'", source)
        self.assertIn("'gb_SUPPRESS_TESTS=TRUE'", source)


class MatrixChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='375-synthetic-controller-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'source'
        self.out = self.base / 'out'
        self.source.mkdir()
        self.out.mkdir()
        for relative in PRIMARY:
            dest = self.source / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, dest)
        files = ['instdir/program/soffice.bin',
                 'workdir/LinkTarget/CppunitTest/libtest_xmloff_draw.so',
                 'workdir/LinkTarget/Library/synthetic.so',
                 'workdir/LinkTarget/Executable/cppunittester', 'workdir/unittest/seed.xcu',
                 'workdir/UnpackedTarball/cppunit/src/cppunit/.libs/synthetic-cppunit.so',
                 'workdir/UnpackedTarball/cppunit/src/cppunit/CompilerOutputter.cpp',
                 'config_host.mk', 'config_host/config_global.h',
                 'xmloff/qa/unit/draw.cxx', 'xmloff/CppunitTest_xmloff_draw.mk',
                 'xmloff/source/draw/XMLShapeStyleContext.cxx',
                 'xmloff/qa/unit/data/uop-explicit-rectangle-fills.uop']
        for relative in files:
            dest = self.source / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text('CPPUNIT_ASSERT_EQUAL_MESSAGE("' + MARKER + '", synthetic);\n')
        self.calls = []

    def fake_run(self, name, argv, cwd, timeout, check, env):
        # Synthetic tests of controller invariants, never a runtime result.
        call = plan()[len(self.calls)]
        self.calls.append(call['label'])
        self.assertFalse((self.source / PROFILE).exists())
        self.assertEqual(call['environment']['OOS_375_STARTUP_ARM'], env['OOS_375_STARTUP_ARM'])
        profile = self.source / PROFILE
        profile.mkdir(parents=True)
        (profile / 'synthetic-profile.xcu').write_text(call['label'])
        (self.source / TEST_LOG).write_text(example(call, call['route'] == 'uop'))
        return 2 if call['route'] == 'uop' else 0

    def test_actual_profile_directories_retained_and_never_reused(self):
        result = execute(self.source, self.out, self.fake_run, {}, lambda: 30, lambda _: None)
        self.assertEqual(['blank-A', 'blank-B', 'uop-A', 'uop-B'], self.calls)
        self.assertTrue(result['completed'])
        self.assertTrue(result['allActualTestcasesNonzero'])
        self.assertFalse(result['productFixAccepted'])
        self.assertEqual(4, len({tuple(a['profileIdentity']) for a in result['arms']}))
        for call in plan():
            self.assertEqual(call['label'], (self.out / call['retainProfileAs'] / 'synthetic-profile.xcu').read_text())

    def test_runtime_mutation_stops_without_second_arm(self):
        def changed(*args, **kwargs):
            code = self.fake_run(*args, **kwargs)
            (self.source / 'instdir/program/soffice.bin').write_text('different binary')
            return code
        with self.assertRaisesRegex(AssertionError, 'Post-arm'):
            execute(self.source, self.out, changed, {}, lambda: 30, lambda _: None)
        self.assertEqual(['blank-A'], self.calls)

    def test_each_core_directory_preserved_before_next_call(self):
        def with_core(*args, **kwargs):
            core = self.source / 'workdir/CppunitTest/xmloff_draw.test.core'
            self.assertFalse(core.exists())
            code = self.fake_run(*args, **kwargs)
            core.mkdir()
            (core / 'synthetic-core').write_text(self.calls[-1])
            return code
        result = execute(self.source, self.out, with_core, {}, lambda: 30, lambda _: None)
        for arm in result['arms']:
            self.assertTrue(arm['coreUploaded'])
            self.assertEqual(arm['label'], (self.out / 'startup-cores' / arm['label'] / 'synthetic-core').read_text())

    def test_preexisting_profile_stops_before_runtime(self):
        (self.source / PROFILE).mkdir(parents=True)
        with self.assertRaises(AssertionError):
            execute(self.source, self.out, self.fake_run, {}, lambda: 30, lambda _: None)
        self.assertEqual([], self.calls)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    SOURCE = args.source.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)
