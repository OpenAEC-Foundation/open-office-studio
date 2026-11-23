import copy
from pathlib import Path
import runpy
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
T = runpy.run_path(str(HERE/"mac-native-suite-transfer-fetch.py"))
R = runpy.run_path(str(HERE/"mac-native-361-remaining.py"))


def fixture():
    data = b"synthetic DMG bytes; identity-gate unit test only"
    value = dict(sourceCommit="source", sourceTree="tree", declaredVersion="2026.48.1", artifactId=1, artifactRun=2,
                 successfulPlatformJob=3, artifactName="uitgave-macOS", archiveSha256="parenthash", artifactAttempt=1,
                 packageMember="dist-installers/office/dmg/Open Office Studio_2026.48.1_aarch64.dmg",
                 transferRun=4, transferCommit="qa", transferAttempt=1, transferArtifactId=5,
                 transferArtifactName="suite-child", transferArchiveSha256="childhash", transferProducerJob=6,
                 transferProducerJobName="prepare")
    descriptor = dict(schemaVersion=1, app="office", source={"commit":"source","tree":"tree","version":"2026.48.1"},
        parentArtifact={"id":1,"run":2,"producerJobId":3,"name":"uitgave-macOS","sha256":"parenthash","attempt":1},
        member=value["packageMember"], package={"filename":Path(value["packageMember"]).name,"bytes":len(data),"sha256":T["sha"](data)},
        memberSHA256DerivedFromVerifiedParent=True)
    run={"id":4,"head_sha":"qa","run_attempt":1,"conclusion":None}
    artifact={"id":5,"name":"suite-child","expired":False,"digest":"sha256:childhash","workflow_run":{"id":4,"head_sha":"qa"}}
    job={"id":6,"run_id":4,"head_sha":"qa","run_attempt":1,"name":"prepare","status":"completed","conclusion":"success"}
    return value,descriptor,data,run,artifact,job


class ChildChain(unittest.TestCase):
    def test_exact_descriptor_and_own_completed_preparer_accept_while_other_jobs_pending(self):
        v,d,b,r,a,j=fixture();T["verify_descriptor"](v,d,b);T["verify_transfer_origin"](v,r,a,j)

    def test_parent_source_member_and_hash_must_match(self):
        for field in ["app","source","parentArtifact","member","memberSHA256DerivedFromVerifiedParent"]:
            v,d,b,*_=fixture();d[field]=None
            with self.subTest(field=field),self.assertRaises(RuntimeError):T["verify_descriptor"](v,d,b)

    def test_wrong_actual_dmg_bytes_rejected(self):
        v,d,b,*_=fixture()
        with self.assertRaises(RuntimeError):T["verify_descriptor"](v,d,b+b"changed")

    def test_independent_integration_hash_enforced(self):
        v,d,b,*_=fixture();v["packageSha256"]="wrong"
        with self.assertRaises(RuntimeError):T["verify_descriptor"](v,d,b)

    def test_wrong_preparer_attempt_source_or_failure_rejected(self):
        for key,value in [("run_attempt",2),("head_sha","other"),("conclusion","failure")]:
            v,d,b,r,a,j=fixture();j[key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError):T["verify_transfer_origin"](v,r,a,j)

    def test_wrong_child_digest_or_expired_artifact_rejected(self):
        for key,value in [("digest","sha256:wrong"),("expired",True)]:
            v,d,b,r,a,j=fixture();a[key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError):T["verify_transfer_origin"](v,r,a,j)

    def test_exact_child_paths_only(self):
        for name,names in [("../Suite.dmg",["../Suite.dmg"]),("Suite.dmg",["Suite.dmg","Suite.dmg"]),("Other.dmg",["Suite.dmg"])]:
            with self.subTest(name=name),self.assertRaises(RuntimeError):T["exact_member"](names,name,".dmg")

    def test_other_product_dmg_cannot_enter_suite_child(self):
        value={"transferDescriptorMember":"provenance.json","transferDmgMember":"Suite.dmg"}
        self.assertEqual(T["child_members"](value,["provenance.json","Suite.dmg"]),("provenance.json","Suite.dmg"))
        with self.assertRaises(RuntimeError):T["child_members"](value,["provenance.json","Suite.dmg","Writer.dmg"])

    def test_official_attempt_and_own_success_independent_of_other_platforms(self):
        v,*_=fixture();v["successfulPlatformJobName"]="Bouwen – macOS"
        r={"id":2,"head_sha":"source","run_attempt":1,"conclusion":"failure"}
        a={"id":1,"name":"uitgave-macOS","expired":False,"digest":"sha256:parenthash","workflow_run":{"id":2,"head_sha":"source"}}
        j={"id":3,"run_id":2,"head_sha":"source","run_attempt":1,"name":"Bouwen – macOS","status":"completed","conclusion":"success","labels":["macos-latest"]}
        T["PARENT"]["verify_platform_origin"](v,r,a,j)
        j["run_attempt"]=2
        with self.assertRaises(RuntimeError):T["PARENT"]["verify_platform_origin"](v,r,a,j)

    def test_pending_request_stops_before_git_network_or_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            request=Path(tmp)/"pending.json";request.write_text(json.dumps({"executionApproved":False}))
            output=Path(tmp)/"uncreated"
            with patch.object(sys,"argv",["fetch",str(request),str(output)]),patch.object(subprocess,"check_output",side_effect=AssertionError("No Git/network while pending")):
                with self.assertRaisesRegex(RuntimeError,"before any download"):T["main"]()
            self.assertFalse(output.exists())


class PriorCore(unittest.TestCase):
    def setUp(self):
        self.identity={key:key for key in ["sourceCommit","sourceTree","declaredVersion","packageSha256","executableSha256"]}
        self.proof={"identity":copy.deepcopy(self.identity),"status":"native-core-passed","nativePass":True,
                    "nativeControlPreflight":{"status":"passed"},"nativeOriginalTable":{"status":"core-passed"}}

    def test_same_package_core(self):R["validate_previous_core"](self.identity,self.proof)

    def test_any_source_version_or_package_change_rejected(self):
        for key in self.identity:
            proof=copy.deepcopy(self.proof);proof["identity"][key]="old"
            with self.subTest(key=key),self.assertRaises(RuntimeError):R["validate_previous_core"](self.identity,proof)

    def test_signed_final_cannot_reuse_unsigned_or_missing_signature_proof(self):
        self.identity["requireSignedNotarized"]=True
        with self.assertRaises(RuntimeError):R["validate_previous_core"](self.identity,self.proof)
        self.proof["identity"]["requireSignedNotarized"]=True
        self.proof["signedPackagePreflight"]={"status":"passed"}
        R["validate_previous_core"](self.identity,self.proof)

    def test_nonpassed_native_core_rejected(self):
        self.proof["nativePass"]=False
        with self.assertRaises(RuntimeError):R["validate_previous_core"](self.identity,self.proof)

    def test_preserved_report_path_boundaries(self):
        R["preserved_report_path"]("docs/tests/P4/core/report.json")
        for path in ["../report.json","docs/tests/../../report.json","/tmp/report.json","docs\\tests\\P4\\report.json","docs/other/report.json"]:
            with self.subTest(path=path),self.assertRaises(RuntimeError):R["preserved_report_path"](path)


if __name__ == "__main__":unittest.main()
