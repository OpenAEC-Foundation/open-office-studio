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
from prepare import extract,rebind_transfer,reuse_transfers,producer_state,REPO
from test_contracts import request,producer


class PrepareTests(unittest.TestCase):
    def test_email_only_retry_fetches_only_its_original_child_never_suite_or_other_apps(self):
        from test_suite_support import prepare as seven
        with tempfile.TemporaryDirectory(prefix='standalone-selected-reuse-') as t:
            root=Path(t);q,_,_,_=seven(root);current=copy.deepcopy(q)
            current.update(reuseTransfersFromRun=99,executeApps=['email']);calls=[]
            ownrun={'head_branch':'codex/standalone-macos-20261123',
                'path':'.github/workflows/standalone-macos-20261123.yml','repository':{'full_name':REPO}}
            artifacts={'artifacts':[{'name':'standalone-own-email','expired':False}]}
            def download(args,**kwargs):
                self.assertEqual(args[:3],['gh','run','download'])
                name=args[args.index('--name')+1];self.assertEqual(name,'standalone-own-email')
                shutil.copytree(root/'split/email',args[args.index('--dir')+1]);calls.append(name)
            with patch('prepare.api',side_effect=[ownrun,artifacts]),patch('prepare.subprocess.run',side_effect=download):
                self.assertEqual(reuse_transfers(current,root/'retry'),{'app':['email']})
            self.assertEqual(calls,['standalone-own-email'])
            self.assertEqual([p.name for p in (root/'retry').iterdir()],['email'])
            self.assertEqual(len(current['packages']),6)
            proof=json.loads((root/'retry/email/provenance.json').read_text())
            self.assertTrue(proof['qaRequestRebind']['packageBytesUnchanged'])

    def test_frozen_attempt_two_never_borrows_global_latest_attempt_three(self):
        q=request();q['parentArtifact'].update(attempt=2,producerJobId=33)
        run,a,j=producer();run['run_attempt']=2;j.update(id=33,run_attempt=2)
        payload={'/actions/runs/2':{**run,'run_attempt':3},'/actions/runs/2/attempts/2':run,
                 '/actions/artifacts/1':a,'/actions/jobs/33':j,
                 '/actions/runs/2/artifacts?per_page=100':{'total_count':1,'artifacts':[a]}}
        with patch('prepare.api',side_effect=lambda path:payload[path]) as mocked:
            self.assertEqual(producer_state(q)[:3],(run,a,j))
            self.assertNotIn('/actions/runs/2',[c.args[0] for c in mocked.call_args_list])
        payload['/actions/jobs/33']={**j,'run_attempt':1}
        with patch('prepare.api',side_effect=lambda path:payload[path]),self.assertRaises(ValueError):producer_state(q)

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
