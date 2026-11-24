"""Guard/recording regressions only; no Mac, network, app, input or capture."""
from datetime import datetime, timezone, timedelta
import copy
import json
import os
from pathlib import Path
import plistlib
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

M = runpy.run_path(str(Path(__file__).with_name("mac-suite-save-capability.py")))
REQUEST = Path(__file__).parent.parent/".github/mac-suite-save-capability-request.json"


class CapabilityGuards(unittest.TestCase):
    def setUp(self):
        self.value = json.loads(REQUEST.read_bytes())
        self.now = datetime(2026, 11, 24, 12, tzinfo=timezone.utc)
        self.value.update(issuedAtUTC=self.now.isoformat(), expiresAtUTC=(self.now+timedelta(minutes=30)).isoformat())

    def test_valid_exact_metadata_request(self):
        M["validate_request"](self.value, self.now)

    def test_every_ambiguous_action_is_denied(self):
        for key in ("nativeBodyAcceptanceApproved", "saveTransportDifferentialApproved", "appLaunchApproved",
                    "inputApproved", "captureApproved", "attachApproved", "instrumentationApproved"):
            for setting in (True, None):
                with self.subTest(key=key, setting=setting):
                    v=copy.deepcopy(self.value);v[key]=setting
                    with self.assertRaises(PermissionError):M["validate_request"](v,self.now)

    def test_expired(self):
        self.value["expiresAtUTC"]=self.now.isoformat()
        with self.assertRaises(PermissionError):M["validate_request"](self.value,self.now)

    def test_future_issued(self):
        self.value["issuedAtUTC"]=(self.now+timedelta(seconds=1)).isoformat()
        with self.assertRaises(PermissionError):M["validate_request"](self.value,self.now)

    def test_overlong_grant(self):
        self.value["expiresAtUTC"]=(self.now+timedelta(hours=3)).isoformat()
        with self.assertRaises(PermissionError):M["validate_request"](self.value,self.now)

    def test_wrong_frozen_bindings(self):
        for key in ("sourceCommit","sourceTree","declaredVersion","packageSha256","executableSha256","allowedBranch"):
            with self.subTest(key=key):
                v=copy.deepcopy(self.value);v[key]="wrong"
                with self.assertRaises(PermissionError):M["validate_request"](v,self.now)

    def test_no_second_host_or_longer_workflow(self):
        for key in ("maximumHosts","maximumWorkflowMinutes"):
            v=copy.deepcopy(self.value);v[key]+=1
            with self.assertRaises(PermissionError):M["validate_request"](v,self.now)

    def test_source_manifest_cannot_be_empty_or_traverse(self):
        for files in ({},{"../other":"0"*64}):
            v=copy.deepcopy(self.value);v["probeSourceSha256"]=files
            with self.assertRaises(PermissionError):M["validate_request"](v,self.now)

    def test_naive_expiry_rejected(self):
        self.value["expiresAtUTC"]="2026-11-24T12:30:00"
        with self.assertRaises(ValueError):M["validate_request"](self.value,self.now)


class MetadataEvidence(unittest.TestCase):
    def test_full_entitlements_dictionary(self):
        value={"com.apple.security.get-task-allow":False,"array":["exact",7]}
        self.assertEqual(M["entitlement_plist"](plistlib.dumps(value))["value"],value)

    def test_empty_entitlements_remain_unknown(self):
        result=M["entitlement_plist"](b"")
        self.assertIsNone(result["value"])
        self.assertNotEqual(result["status"],"parsed")

    def test_malformed_entitlements_not_silently_empty(self):
        with self.assertRaises(Exception):M["entitlement_plist"](b"not a plist")

    def test_entitlements_list_rejected(self):
        with self.assertRaises(ValueError):M["entitlement_plist"](plistlib.dumps(["not","dict"]))

    def test_wrong_executable_bytes_rejected(self):
        info={"CFBundleIdentifier":"org.openaec.office-studio","CFBundleExecutable":"open-office-studio","CFBundleShortVersionString":"2026.48.1"}
        with self.assertRaises(ValueError):M["check_identity"](info,b"not original P5")

    def test_record_exact_stdout_stderr_and_failed_status(self):
        report={"commands":[]};future=datetime.now(timezone.utc)+timedelta(minutes=5)
        with tempfile.TemporaryDirectory() as d, patch("subprocess.run",return_value=subprocess.CompletedProcess(["codesign"],3,b"raw\x00out\n",b"raw\xfferr")) as called:
            out=Path(d);run=M["command_runner"](out,report,future)
            with self.assertRaises(RuntimeError):run("sample",["codesign","--display"],True)
            self.assertEqual((out/"sample.stdout").read_bytes(),b"raw\x00out\n")
            self.assertEqual((out/"sample.stderr").read_bytes(),b"raw\xfferr")
            self.assertEqual(report["commands"][0]["returncode"],3)
            self.assertEqual(called.call_count,1)

    def test_expired_work_budget_blocks_probe_but_not_cleanup(self):
        report={"commands":[]};past=datetime.now(timezone.utc)-timedelta(seconds=1)
        with tempfile.TemporaryDirectory() as d, patch("subprocess.run",return_value=subprocess.CompletedProcess(["hdiutil"],0,b"",b"")) as called:
            run=M["command_runner"](Path(d),report,past)
            with self.assertRaises(TimeoutError):run("probe",["file","own"])
            self.assertEqual(called.call_count,0)
            run("cleanup",["hdiutil","detach","own"],cleanup=True,seconds=15)
            self.assertEqual(called.call_count,1)

    def test_cleanup_rejects_foreign_folder(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(PermissionError):M["cleanup_acquisition"](Path(d),Path(d))

    def test_cleanup_preserves_other_files(self):
        before=Path.cwd()
        with tempfile.TemporaryDirectory() as d:
            try:
                os.chdir(d);folder=Path('.local/mac-save-capability-input');folder.mkdir(parents=True)
                (folder/'suite-child.zip').write_bytes(b'own')
                (folder/'do-not-touch.txt').write_bytes(b'preserve')
                out=Path('.local/proof');M["cleanup_acquisition"](folder,out)
                self.assertFalse((folder/'suite-child.zip').exists())
                self.assertEqual((folder/'do-not-touch.txt').read_bytes(),b'preserve')
            finally:os.chdir(before)


if __name__=="__main__":unittest.main()
