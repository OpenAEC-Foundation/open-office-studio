"""Synthetic contract/oracle regressions; not Mac or native application tests."""
from datetime import datetime, timezone
from pathlib import Path
import copy
import json
import tempfile
import unittest
import zipfile
from contracts import APPS, VERSION, acceptance_from_evidence, validate_bundle, validate_producer, validate_request, verify_under
from fixtures import create, MARKERS
from oracles import verify


def request():
    return {"schemaVersion": 1, "scope": "macos-standalone-six", "executionApproved": True,
            "source": {"commit": "a"*40, "tree": "b"*40, "version": VERSION}, "expiresAt": "2099-01-01T00:00:00Z",
            "parentArtifact": {"id": 1, "run": 2, "producerJobId": 3, "name": "release-mac", "sha256": "c"*64},
            "packages": {k: {"member": n[0]+"_"+VERSION+"_aarch64.dmg", "sha256": "d"*64} for k,n in APPS.items()},
            "harnessFiles": {"scripts/standalone-macos/run.py": "e"*64}}


class ContractTests(unittest.TestCase):
    def test_exact_six_new_apps_request(self):
        self.assertEqual(len(validate_request(request())["packages"]), 6)

    def test_suite_old_version_expiry_and_missing_approval_rejected(self):
        variants = []
        x=request();x["packages"]["office"]=x["packages"]["writer"];variants.append(x)
        x=request();x["source"]["version"]="2026.47.1";variants.append(x)
        x=request();x["expiresAt"]="2000-01-01T00:00:00Z";variants.append(x)
        x=request();x["executionApproved"]=False;variants.append(x)
        for x in variants:
            with self.subTest(x=x), self.assertRaises((ValueError, PermissionError)):validate_request(x)

    def test_traversal_or_wrong_dmg_never_selected(self):
        for name in ["../Open Writer Studio_"+VERSION+"_aarch64.dmg", "/tmp/own.dmg", "Open Office Studio_"+VERSION+"_aarch64.dmg"]:
            x=request();x["packages"]["writer"]["member"]=name
            with self.assertRaises(ValueError):validate_request(x)

    def test_bundle_identity_version_and_binary_are_independent_gates(self):
        good={"CFBundleIdentifier":APPS["writer"][2],"CFBundleExecutable":APPS["writer"][1],"CFBundleShortVersionString":VERSION}
        validate_bundle(good,"writer")
        for key,bad in [("CFBundleIdentifier","org.openaec.office-studio"),("CFBundleExecutable","open-office-studio"),("CFBundleShortVersionString","2026.46.2")]:
            x={**good,key:bad}
            with self.assertRaises(ValueError):validate_bundle(x,"writer")

    def test_ready_mac_does_not_wait_for_unrelated_platforms(self):
        q=request();run={"id":2,"head_sha":"a"*40,"status":"in_progress","conclusion":""}
        a={"id":1,"name":"release-mac","expired":False,"workflow_run":{"id":2,"head_sha":"a"*40},"digest":"sha256:"+"c"*64}
        j={"id":3,"run_id":2,"status":"completed","conclusion":"success"}
        validate_producer(q,run,a,j)
        j["conclusion"]="failure"
        with self.assertRaises(PermissionError):validate_producer(q,run,a,j)

    def test_changed_artifact_source_is_rejected(self):
        q=request();run={"id":2,"head_sha":"f"*40}
        with self.assertRaises(ValueError):validate_producer(q,run,{}, {})

    def test_cleanup_path_cannot_escape_or_delete_owner_root(self):
        with tempfile.TemporaryDirectory(prefix="standalone-contract-") as t:
            root=Path(t).resolve();self.assertEqual(verify_under(root/"own",root),root/"own")
            for target in [root,root.parent,root/".."/"other"]:
                with self.assertRaises(ValueError):verify_under(target,root)

    def test_partial_evidence_never_native_acceptance(self):
        keys=("identityVerified","suiteAbsent","freshProfileVerified","ownCwdEnvironmentVerified","nativeFocusVerified","nativeSaveVerified","outputOraclePassed","fullQuitVerified","newPidReopenVerified","resourceObservationsReviewed","visualReviewPassed","cleanupPassed")
        good={k:True for k in keys};self.assertTrue(acceptance_from_evidence(good))
        for k in keys:self.assertFalse(acceptance_from_evidence({**good,k:False}),k)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="standalone-fixtures-");self.root=Path(self.temp.name).resolve()
        self.receipt=create(self.root/"inputs",Path(__file__).resolve().parents[2]/"public/templates")

    def tearDown(self):self.temp.cleanup()

    def test_all_six_synthetic_inputs_parse_independently(self):
        for app,f in self.receipt["files"].items():
            with self.subTest(app=app):self.assertTrue(verify(app,f["path"],edited=False)["passed"])

    def test_unedited_office_exports_do_not_satisfy_edit_case(self):
        for app in ["writer","spreadsheet","presentation","email","notition"]:
            with self.subTest(app=app),self.assertRaises(AssertionError):verify(app,self.receipt["files"][app]["path"])

    def test_oracle_detects_lost_control_despite_marker(self):
        original=Path(self.receipt["files"]["writer"]["path"]);dest=self.root/"bad.docx"
        with zipfile.ZipFile(original) as src,zipfile.ZipFile(dest,"w") as out:
            for e in src.infolist():
                b=src.read(e.filename)
                if e.filename=="word/document.xml":b=b.replace(b"STANDALONE_UNCHANGED_CONTROL",MARKERS["writer"].encode())
                out.writestr(e,b)
        with self.assertRaises(AssertionError):verify("writer",dest)

    def test_database_readonly_oracle_preserves_source_bytes(self):
        path=Path(self.receipt["files"]["database"]["path"]);before=path.read_bytes()
        verify("database",path);self.assertEqual(path.read_bytes(),before)


if __name__ == "__main__":unittest.main()
