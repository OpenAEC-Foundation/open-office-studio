"""Archive and provenance tests; never download or execute applications."""
from pathlib import Path
import copy
import tempfile
import unittest
import warnings
import zipfile
from contracts import APPS, digest
from prepare import extract
from test_contracts import request


class PrepareTests(unittest.TestCase):
    def archive(self, root, *, duplicate=False):
        q=request();archive=root/"parent.zip"
        with zipfile.ZipFile(archive,"w") as z:
            for app in APPS:
                raw=("synthetic "+app).encode();p=root/(app+".dmg");p.write_bytes(raw)
                q["packages"][app]["sha256"]=digest(p)
                z.writestr(q["packages"][app]["member"],raw)
            z.writestr("Open Office Studio_suite.dmg",b"SUITE MUST NEVER EXTRACT")
            z.writestr("../outside.dmg",b"NOT SELECTED")
            if duplicate:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore");z.writestr(q["packages"]["writer"]["member"],b"duplicate")
        q["parentArtifact"]["sha256"]=digest(archive)
        return q,archive

    def test_extracts_only_six_approved_packages_and_parent_chain(self):
        with tempfile.TemporaryDirectory(prefix="standalone-archive-") as t:
            root=Path(t);q,z=self.archive(root);out=root/"selected"
            self.assertEqual(extract(q,z,out),{"app":list(APPS)})
            self.assertEqual(sorted(p.name for p in out.iterdir()),sorted(APPS))
            for app in APPS:
                files=list((out/app).iterdir());self.assertEqual(len(files),3)
                self.assertEqual(digest(next((out/app).glob("*.dmg"))),q["packages"][app]["sha256"])
            self.assertFalse((root/"outside.dmg").exists())

    def test_wrong_parent_hash_blocks_before_output_creation(self):
        with tempfile.TemporaryDirectory(prefix="standalone-archive-") as t:
            root=Path(t);q,z=self.archive(root);q["parentArtifact"]["sha256"]="f"*64
            with self.assertRaises(ValueError):extract(q,z,root/"selected")
            self.assertFalse((root/"selected").exists())

    def test_unknown_member_hash_can_bind_only_to_verified_immutable_parent(self):
        from contracts import validate_request
        with tempfile.TemporaryDirectory(prefix="standalone-archive-") as t:
            root=Path(t);q,z=self.archive(root)
            q["packages"]["writer"].update(sha256=None,hashBinding="verified-parent-archive")
            validate_request(q);extract(q,z,root/"selected")
            import json
            proof=json.loads((root/"selected/writer/provenance.json").read_text())
            self.assertTrue(proof["memberSHA256DerivedFromVerifiedParent"])
            self.assertEqual(proof["package"]["sha256"],digest(next((root/"selected/writer").glob("*.dmg"))))
            del q["packages"]["writer"]["hashBinding"]
            with self.assertRaises(ValueError):validate_request(q)

    def test_duplicate_or_corrupt_package_cannot_gain_provenance(self):
        for duplicate in (True,False):
            with tempfile.TemporaryDirectory(prefix="standalone-archive-") as t:
                root=Path(t);q,z=self.archive(root,duplicate=duplicate)
                if not duplicate:q["packages"]["writer"]["sha256"]="f"*64
                with self.assertRaises(ValueError):extract(q,z,root/"selected")
                self.assertFalse((root/"selected/writer/provenance.json").exists())


if __name__=="__main__":unittest.main()
