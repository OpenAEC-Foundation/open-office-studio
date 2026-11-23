"""Archive and provenance tests; never download or execute applications."""
from pathlib import Path
import copy
import tempfile
import unittest
import warnings
import zipfile
import json
import shutil
from unittest.mock import patch
from contracts import APPS, digest
from prepare import extract,rebind_transfer,reuse_transfers,REPO
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

    def test_retry_rebinds_only_qa_helpers_with_unchanged_package_chain(self):
        with tempfile.TemporaryDirectory(prefix="standalone-reuse-") as t:
            root=Path(t);q,z=self.archive(root);extract(q,z,root/"old")
            current=copy.deepcopy(q);current["harnessFiles"]={"scripts/standalone-macos/run.py":"f"*64}
            current["reuseTransfersFromRun"]=99;current["expiresAt"]="2099-01-02T00:00:00Z"
            current["executeApps"]=["writer","email"]
            folder=root/"old/writer";before=digest(next(folder.glob("*.dmg")))
            rebind_transfer(current,folder,"writer",99)
            proof=json.loads((folder/"provenance.json").read_text())
            self.assertTrue(proof["qaRequestRebind"]["packageBytesUnchanged"])
            self.assertEqual(proof["parentArtifact"],q["parentArtifact"])
            self.assertEqual(before,digest(next(folder.glob("*.dmg"))))
            self.assertEqual(json.loads((folder/"request.json").read_text()),current)
            self.assertEqual(len(list(folder.glob("origin-*.json"))),2)

    def test_selective_retry_retains_six_bound_transfers_but_executes_only_missing_cases(self):
        with tempfile.TemporaryDirectory(prefix="standalone-selective-") as t:
            root=Path(t);q,z=self.archive(root);q['executeApps']=['writer','spreadsheet','email','database']
            matrix=extract(q,z,root/'selected')
            self.assertEqual(matrix,{'app':q['executeApps']})
            self.assertEqual(sorted(p.name for p in (root/'selected').iterdir()),sorted(APPS))
            self.assertNotIn('office',matrix['app'])

    def test_retry_cannot_change_source_or_accept_tampered_dmg(self):
        for tamper in (False,True):
            with tempfile.TemporaryDirectory(prefix="standalone-reuse-") as t:
                root=Path(t);q,z=self.archive(root);extract(q,z,root/"old");folder=root/"old/writer"
                current=copy.deepcopy(q);current["reuseTransfersFromRun"]=99
                if tamper:next(folder.glob("*.dmg")).write_bytes(b"tampered")
                else:current["source"]["commit"]="f"*40
                with self.assertRaises(ValueError):rebind_transfer(current,folder,"writer",99)
                self.assertEqual(json.loads((folder/"request.json").read_text()),q)

    def test_retry_fetches_six_app_only_transfers_without_parent_archive(self):
        with tempfile.TemporaryDirectory(prefix="standalone-reuse-") as t:
            root=Path(t);q,z=self.archive(root);extract(q,z,root/"old")
            current=copy.deepcopy(q);current["reuseTransfersFromRun"]=99;calls=[]
            ownrun={"head_branch":"codex/standalone-macos-20261123","path":".github/workflows/standalone-macos-20261123.yml","repository":{"full_name":REPO}}
            artifacts={"artifacts":[{"name":"standalone-own-"+app,"expired":False} for app in APPS]}
            def download(args,**kwargs):
                self.assertEqual(args[:3],["gh","run","download"])
                app=args[args.index("--name")+1].removeprefix("standalone-own-")
                shutil.copytree(root/"old"/app,args[args.index("--dir")+1]);calls.append(app)
            with patch("prepare.api",side_effect=[ownrun,artifacts]),patch("prepare.subprocess.run",side_effect=download):
                self.assertEqual(reuse_transfers(current,root/"fresh"),{"app":list(APPS)})
            self.assertEqual(calls,list(APPS))


if __name__=="__main__":unittest.main()
