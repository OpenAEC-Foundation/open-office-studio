"""Small filesystem regressions using retained real ELF bytes, no execution."""
import gzip
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest

from runtime_prefix import Audit, differences, fresh_variant, inventory, sha

RETAINED = Path(os.environ.get('OOS_381_RETAINED',
    '.local/issue381/actual-45381046100/raw/.local/issue381/build-proof'))


class PrefixTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='issue381-prefix-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.canonical = self.root/'canonical'
        (self.canonical/'program').mkdir(parents=True)
        self.lib = 'program/libwps-0.4-lo.so.4'
        self.original = RETAINED/'packaged.so'
        self.patched = RETAINED/'patched.so'
        self.assertEqual(sha(self.original), 'c6f5c5dc6bcabf01e83591a9365983171a538fcf41f77294523bc0a77f82ecc4')
        self.assertEqual(sha(self.patched), 'e9f8123ab66523071efcef37790c29cd6cb19201d258df7d937e644bb6f03932')
        shutil.copyfile(self.original, self.canonical/self.lib)
        (self.canonical/'program/control').write_bytes(b'unchanged control bytes\n')
        self.expected = inventory(self.canonical)
        self.manifest = [dict(path=p, **{**v, 'mode': format(v['mode'], '04o')}) for p,v in self.expected.items()]

    def fresh(self, name, patched=False, control=False):
        source = RETAINED/'rebuilt-control.so' if control else self.patched if patched else self.original
        if control:self.assertEqual(sha(source),'00186a57c76193646e28aa6b06a67eeaff5a1d39f109b0c1d1339878181017ad')
        audit = Audit(self.root/('audit-'+name))
        expected, original = fresh_variant(self.canonical, self.root/name, self.manifest,
            self.lib, source, sha(self.original), sha(source), audit)
        return self.root/name, expected, audit

    def test_three_fresh_variants_have_only_explicit_library_delta(self):
        for name, patched, control in [('packaged',False,False),('control',False,True),('patched',True,False)]:
            root, expected, audit = self.fresh(name,patched,control)
            self.assertEqual(inventory(root),expected)
            delta=differences(self.expected,expected)
            self.assertEqual(list(delta['changed']),[self.lib] if patched or control else [])
            self.assertFalse(delta['missing'] or delta['extra'])
            self.assertEqual(inventory(self.canonical),self.expected)
            for receipt in audit.steps:
                snapshot=json.loads(gzip.decompress((audit.destination/receipt['inventory']).read_bytes()))
                self.assertEqual(len(snapshot),receipt['entries'])

    def test_cross_variant_mutation_rejected_and_not_inherited(self):
        dirty, expected, audit=self.fresh('control')
        (dirty/'program/unexpected-cache').write_bytes(b'not permitted')
        with self.assertRaisesRegex(AssertionError,'Unexpected runtime mutation'):
            audit.check('after-converter',dirty,expected,'Reject unknown new paths')
        clean, expected2, _=self.fresh('patched',True)
        self.assertFalse((clean/'program/unexpected-cache').exists())
        self.assertEqual(inventory(clean),expected2)
        self.assertEqual(audit.steps[-1]['differences']['extra'],['program/unexpected-cache'])

    def test_missing_file_rejected_with_exact_path(self):
        root, expected, audit=self.fresh('missing')
        (root/'program/control').unlink()
        with self.assertRaises(AssertionError):audit.check('after',root,expected,'No deletion')
        self.assertEqual(audit.steps[-1]['differences']['missing'],['program/control'])

    def test_unknown_hash_mutation_rejected(self):
        root, expected, audit=self.fresh('bytes')
        (root/'program/control').write_bytes(b'unexpected mutation')
        with self.assertRaises(AssertionError):audit.check('after',root,expected,'No byte changes')
        self.assertIn('program/control',audit.steps[-1]['differences']['changed'])

    def test_mode_mutation_rejected_without_normalization(self):
        root, expected, audit=self.fresh('mode')
        target=root/'program/control'
        target.chmod(stat.S_IREAD)
        try:
            with self.assertRaises(AssertionError):audit.check('after',root,expected,'No mode changes')
            self.assertNotEqual(audit.steps[-1]['differences']['changed']['program/control']['actual']['mode'],expected['program/control']['mode'])
        finally:target.chmod(stat.S_IREAD|stat.S_IWRITE)

    def test_existing_variant_cannot_be_reused(self):
        self.fresh('once')
        with self.assertRaisesRegex(AssertionError,'already exists'):
            fresh_variant(self.canonical,self.root/'once',self.manifest,self.lib,self.original,
                sha(self.original),sha(self.original),Audit(self.root/'second-audit'))

    def test_canonical_mutation_blocks_before_copy(self):
        (self.canonical/'program/control').write_bytes(b'corrupt canonical')
        with self.assertRaisesRegex(AssertionError,'canonical-before-copy'):self.fresh('blocked')
        self.assertFalse((self.root/'blocked').exists())


if __name__ == '__main__':unittest.main()
