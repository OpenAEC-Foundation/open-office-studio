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
import shutil
import struct
import subprocess
import sys

spec = importlib.util.spec_from_file_location("standalone_fetch", Path(__file__).with_name("prepare-linux-release-input-p5.py"))
fetcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetcher)


class Provenance(unittest.TestCase):
    def setUp(self):
        self.actions_env=patch.dict(os.environ,{'GITHUB_ACTIONS':'false'});self.actions_env.start()
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = Path.cwd()
        os.chdir(self.temp.name)
        self.studio = {"sleutel": "writer", "programma": "open-writer-studio"}

    def tearDown(self):
        self.actions_env.stop()
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
        self.run=dict(id=45177730188,head_sha=fetcher.SOURCE,path='.github/workflows/release.yml',run_attempt=1,run_started_at='2026-11-23T09:49:00Z')
        self.job=dict(id=137703365848,run_id=self.run['id'],run_attempt=1,name='Bouwen – Linux',status='completed',conclusion='success',started_at='2026-11-23T09:49:22Z',completed_at='2026-11-23T10:46:00Z',steps=[dict(name=n,status='completed',conclusion='success') for n in fetcher.REQUIRED_GATES])
        self.artifact=dict(id=7,name='uitgave-Linux',expired=False,workflow_run=dict(id=self.run['id'],head_sha=fetcher.SOURCE),digest='sha256:'+'a'*64,size_in_bytes=100,created_at='2026-11-23T10:45:00Z',updated_at='2026-11-23T10:45:59Z')
        self.job['steps'].append(dict(name=fetcher.NON_LINUX_GATE,status='completed',conclusion='skipped'))
        a=self.artifact
        self.pin=dict(purpose='P5-frozen-candidate',sourceCommit=fetcher.SOURCE,sourceTree=fetcher.TREE,version='2026.48.1',run=self.run['id'],attempt=1,job=self.job['id'],artifact=dict(id=a['id'],name=a['name'],digest=a['digest'],bytes=a['size_in_bytes'],createdAt=a['created_at'],updatedAt=a['updated_at']),window=dict(jobStartedAt=self.job['started_at'],jobCompletedAt=self.job['completed_at']))
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


@unittest.skipUnless(sys.platform=='linux' and shutil.which('unsquashfs') and shutil.which('mksquashfs') and shutil.which('dpkg-deb'),'Linux package-inspection tools required')
class ActualMinimalPackageElfInspection(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.env=patch.dict(os.environ,{'RUNNER_TEMP':self.tmp.name});self.env.start()
        self.payload=self.root/'payload';target=self.payload/'usr/bin/open-office-studio';target.parent.mkdir(parents=True)
        header=bytearray(64);header[:6]=b'\x7fELF\x02\x01';struct.pack_into('<H',header,18,62)
        target.write_bytes(header+b'SYNTHETIC QA HEADER ONLY, NOT A PRODUCT APP');target.chmod(0o751)
        self.target=target
    def tearDown(self):self.env.stop();self.tmp.cleanup()
    def verify(self,package):
        result=fetcher.inspect_suite_elf(package)
        self.assertEqual(result['sha256'],hashlib.sha256(self.target.read_bytes()).hexdigest())
        self.assertEqual((result['mode'],result['elfClass'],result['machine']),(0o751,2,62))
    def deb(self):
        control=self.payload/'DEBIAN';control.mkdir()
        (control/'control').write_text('Package: synthetic-inspection-only\nVersion: 1\nArchitecture: amd64\nMaintainer: Synthetic QA <qa@example.invalid>\nDescription: Not a product app\n')
        package=self.root/'synthetic.deb'
        subprocess.run(['dpkg-deb','--build',str(self.payload),str(package)],check=True,stdout=subprocess.DEVNULL)
        return package
    def test_inspects_real_deb_stream_without_unpacking_suite_tree(self):self.verify(self.deb())
    def test_rejects_deb_executable_symlink(self):
        self.target.unlink();self.target.symlink_to('/untrusted/host/executable')
        with self.assertRaises(AssertionError):fetcher.inspect_suite_elf(self.deb())
    def test_inspects_real_squashfs_at_appimage_offset(self):
        squash=self.root/'payload.squashfs'
        subprocess.run(['mksquashfs',str(self.payload),str(squash),'-noappend','-processors','1','-no-progress'],check=True,stdout=subprocess.DEVNULL)
        prefix=bytearray(4096);prefix[:4]=b'\x7fELF';prefix[8:11]=b'AI\x02'
        package=self.root/'synthetic.AppImage';package.write_bytes(prefix+squash.read_bytes())
        self.verify(package)


if __name__ == "__main__":
    unittest.main()
