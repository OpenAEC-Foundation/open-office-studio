"""Contract tests for package provenance and isolation, without downloading GBs."""
import hashlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("standalone_fetch", Path(__file__).with_name("haal-standalone-linux-ci.py"))
fetcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetcher)


class Provenance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = Path.cwd()
        os.chdir(self.temp.name)
        self.studio = {"sleutel": "writer", "programma": "open-writer-studio"}

    def tearDown(self):
        os.chdir(self.cwd)
        self.temp.cleanup()

    def archive(self, wrong_hash=False, wrong_identity=False, duplicate=False):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, "w") as z:
            packages = []
            for extension in ("deb", "AppImage"):
                name = f"Open Writer Studio_2026.48.1_amd64.{extension}"
                data = f"synthetic-{extension}".encode()
                z.writestr(f"writer/{extension}/{name}", data)
                packages.append({"naam": name, "bytes": len(data), "sha256": "bad" if wrong_hash else hashlib.sha256(data).hexdigest()})
            report = {"programma": "wrong" if wrong_identity else "open-writer-studio", "versie": "2026.48.1", "pakketten": packages}
            z.writestr("pakketcontrole-writer-Linux.json", json.dumps(report))
            if duplicate:
                z.writestr("another/pakketcontrole-writer-Linux.json", json.dumps(report))
            z.writestr("office/deb/FULL-SUITE-MUST-NOT-EXTRACT.deb", "not allowed")
            z.writestr("spreadsheet/deb/OTHER-APP-MUST-NOT-EXTRACT.deb", "not allowed")
        return zipfile.ZipFile(io.BytesIO(raw.getvalue()))

    def extract(self, **options):
        with self.archive(**options) as bundle, patch.object(fetcher.subprocess, "check_output", return_value="source-tree\n"):
            fetcher.extract_app(bundle, self.studio, "2026.48.1", "a" * 40, "123", {"id": 7}, "b" * 64)

    def test_preserves_selected_bytes_and_origin_without_suite_or_other_apps(self):
        self.extract()
        out = Path(".local/standalone-linux-prepared/writer")
        self.assertEqual(len(list(out.iterdir())), 4)
        origin = json.loads((out / "origin.json").read_text())
        self.assertEqual(origin["sourceCommit"], "a" * 40)
        self.assertEqual(origin["artifact"]["zipSha256"], "b" * 64)
        self.assertFalse(list(Path(".").rglob("*MUST-NOT*")))
        for package in origin["packages"]:
            self.assertEqual(hashlib.sha256((out / package["path"]).read_bytes()).hexdigest(), package["sha256"])

    def test_rejects_package_bytes_changed_after_build_report(self):
        with self.assertRaises(AssertionError): self.extract(wrong_hash=True)

    def test_rejects_wrong_app_identity(self):
        with self.assertRaises(AssertionError): self.extract(wrong_identity=True)

    def test_rejects_ambiguous_duplicate_package_report(self):
        with self.assertRaises(AssertionError): self.extract(duplicate=True)

class ImmutableIntake(unittest.TestCase):
    def setUp(self):
        self.run=dict(id=45150438420,head_sha=fetcher.SOURCE,path='.github/workflows/release.yml',run_attempt=1,run_started_at='2026-11-23T09:49:00Z')
        self.job=dict(id=137610274931,run_id=self.run['id'],run_attempt=1,name='Bouwen – Linux',status='completed',conclusion='success',started_at='2026-11-23T09:49:22Z',completed_at='2026-11-23T10:46:00Z',steps=[dict(name=n,status='completed',conclusion='success') for n in fetcher.REQUIRED_GATES])
        self.artifact=dict(id=7,name='uitgave-Linux',expired=False,workflow_run=dict(id=self.run['id'],head_sha=fetcher.SOURCE),digest='sha256:'+'a'*64,size_in_bytes=100,created_at='2026-11-23T10:45:00Z',updated_at='2026-11-23T10:45:59Z')
        a=self.artifact
        self.pin=dict(purpose='P2-baseline-only',sourceCommit=fetcher.SOURCE,sourceTree=fetcher.TREE,version='2026.48.1',run=self.run['id'],attempt=1,job=self.job['id'],artifact=dict(id=a['id'],name=a['name'],digest=a['digest'],bytes=a['size_in_bytes'],createdAt=a['created_at'],updatedAt=a['updated_at']),window=dict(jobStartedAt=self.job['started_at'],jobCompletedAt=self.job['completed_at']))
    def verify(self):fetcher.verify_intake(self.pin,self.run,self.job,self.artifact)
    def test_accepts_exact_own_linux_success_while_other_os_are_independent(self):self.verify()
    def test_rejects_changed_attempt(self):
        self.run['run_attempt']=2
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_artifact_from_another_run(self):
        self.artifact['workflow_run']['id']+=1
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_artifact_outside_job_window(self):
        self.pin['artifact']['createdAt']=self.artifact['created_at']='2026-11-23T09:40:00Z'
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_missing_native_package_gate(self):
        self.job['steps']=[s for s in self.job['steps'] if s['name']!=fetcher.REQUIRED_GATES[-2]]
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_failed_own_linux_job(self):
        self.job['conclusion']='failure'
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_replaced_archive_digest(self):
        self.artifact['digest']='sha256:'+'b'*64
        with self.assertRaises(AssertionError):self.verify()
    def test_rejects_ambiguous_duplicate_package_gate(self):
        self.job['steps'].append(copy.deepcopy(self.job['steps'][0]))
        with self.assertRaises(AssertionError):self.verify()


if __name__ == "__main__":
    unittest.main()
