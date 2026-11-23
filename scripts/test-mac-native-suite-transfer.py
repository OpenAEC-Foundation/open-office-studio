import copy
import io
from pathlib import Path
import runpy
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

HERE = Path(__file__).parent
T = runpy.run_path(str(HERE/"mac-native-suite-transfer-fetch.py"))
R = runpy.run_path(str(HERE/"mac-native-361-remaining.py"))


def fixture():
    data = b"synthetic DMG bytes; identity-gate unit test only"
    value = dict(sourceCommit="a"*40, sourceTree="b"*40, declaredVersion="2026.48.1", artifactId=1, artifactRun=2,
                 successfulPlatformJob=3, successfulPlatformJobName="Bouwen – macOS", artifactName="uitgave-macOS", archiveSha256="c"*64, artifactAttempt=1,
                 packageMember="dist-installers/office/dmg/Open Office Studio_2026.48.1_aarch64.dmg",
                 transferRun=4, transferCommit="d"*40, transferAttempt=1, transferArtifactId=5,
                 transferArtifactName="standalone-support-suite", transferArchiveSha256="e"*64, transferArchiveBytes=100,transferProducerJob=6,
                 transferProducerJobName="prepare",transferDescriptorMember="provenance.json",transferRequestMember="request.json",
                 transferDmgMember="Open Office Studio_2026.48.1_aarch64.dmg",supportDescriptorArtifactId=7,
                 supportDescriptorArtifactName="standalone-suite-support-descriptor-"+"d"*40,
                 supportDescriptorArchiveSha256="f"*64,supportDescriptorArchiveBytes=100,supportDescriptorMember="suite-support-descriptor.json")
    descriptor = dict(schemaVersion=1, app="office", source=T["source_pin"](value),
        parentArtifact=T["parent_pin"](value),purpose="separate-suite-owner",nativeExecutionApproved=False,nativeAccepted=False,
        member=value["packageMember"], package={"filename":Path(value["packageMember"]).name,"bytes":len(data),"sha256":T["sha"](data)},
        memberSHA256DerivedFromVerifiedParent=True)
    run={"id":4,"head_sha":value["transferCommit"],"run_attempt":1,"conclusion":None}
    artifact={"id":5,"name":value["transferArtifactName"],"expired":False,"digest":"sha256:"+value["transferArchiveSha256"],"size_in_bytes":100,"workflow_run":{"id":4,"head_sha":value["transferCommit"]}}
    job={"id":6,"run_id":4,"head_sha":value["transferCommit"],"run_attempt":1,"name":"prepare","status":"completed","conclusion":"success"}
    return value,descriptor,data,run,artifact,job


def bundle_fixture():
    value,provenance,data,run,child,job=fixture()
    value.update(executionApproved=True,suiteChildTransferApproved=True,supportDescriptorRequired=True,
                 derivePackageIdentityFromVerifiedArchive=True,deriveExecutableFromVerifiedDmg=True,
                 requireSignedNotarized=True,requireExactPackageMember=True)
    original={"schemaVersion":1,"scope":"macos-standalone-six","preparationScope":T["SCOPE"],
              "source":T["source_pin"](value),"parentArtifact":T["parent_pin"](value),
              "packages":{name:{} for name in ["writer","spreadsheet","presentation","email","notition","database"]},
              "supportingSuitePackage":{"member":value["packageMember"],"sha256":None,"hashBinding":"verified-parent-archive",
                                         "purpose":"separate-suite-owner","executionApproved":False}}
    def zip_bytes(files):
        output=io.BytesIO()
        with zipfile.ZipFile(output,"w") as z:
            for name,raw in files.items():z.writestr(name,raw)
        return output.getvalue()
    child_bytes=zip_bytes({value["transferDmgMember"]:data,"provenance.json":json.dumps(provenance),"request.json":json.dumps(original)})
    value.update(transferArchiveSha256=T["sha"](child_bytes),transferArchiveBytes=len(child_bytes))
    child.update(digest="sha256:"+value["transferArchiveSha256"],size_in_bytes=len(child_bytes),
                 created_at="2026-11-23T12:12:30Z",updated_at="2026-11-23T12:12:31Z")
    envelope={"schemaVersion":1,"scope":T["SCOPE"],"source":T["source_pin"](value),"officialParentArtifact":T["parent_pin"](value),
              "suitePackage":dict(provenance["package"],member=value["packageMember"]),
              "suiteTransferArtifact":{"id":5,"name":"standalone-support-suite","sha256":value["transferArchiveSha256"],
                                       "qaRun":4,"qaCommit":value["transferCommit"],"officialApiDigestVerified":True,
                                       "wholeChildArchiveHashVerifiedByPreparer":False,"officialApiMetadata":copy.deepcopy(child)},
              "expectedInstalledIdentity":T["installed_pin"](value),"validationOwner":"mac_native_release_blocker",
              "nativeExecutionPerformed":False,"nativeAccepted":False,"suiteDeliveryToStandaloneHostsAuthorized":False}
    small_bytes=zip_bytes({value["supportDescriptorMember"]:json.dumps(envelope)})
    value.update(supportDescriptorArchiveSha256=T["sha"](small_bytes),supportDescriptorArchiveBytes=len(small_bytes))
    small={"id":7,"name":value["supportDescriptorArtifactName"],"expired":False,"digest":"sha256:"+value["supportDescriptorArchiveSha256"],
           "size_in_bytes":len(small_bytes),"workflow_run":copy.deepcopy(child["workflow_run"]),
           "created_at":"2026-11-23T12:14:30Z","updated_at":"2026-11-23T12:14:31Z"}
    job.update(started_at="2026-11-23T12:10:00Z",completed_at="2026-11-23T12:20:00Z",steps=[])
    for i,name in enumerate(T["SUITE_STEPS"]):
        job["steps"].append({"name":name,"number":10+i,"status":"completed","conclusion":"success",
                             "started_at":f"2026-11-23T12:{12+i}:00Z","completed_at":f"2026-11-23T12:{13+i}:00Z"})
    official_run={"id":2,"head_sha":value["sourceCommit"],"run_attempt":1,"conclusion":"failure"}
    parent={"id":1,"name":"uitgave-macOS","expired":False,"digest":"sha256:"+value["archiveSha256"],
            "workflow_run":{"id":2,"head_sha":value["sourceCommit"]},"created_at":"2026-11-23T12:04:30Z"}
    official_job={"id":3,"run_id":2,"head_sha":value["sourceCommit"],"run_attempt":1,"name":"Bouwen – macOS",
                  "status":"completed","conclusion":"success","labels":["macos-latest"],
                  "started_at":"2026-11-23T12:00:00Z","completed_at":"2026-11-23T12:05:00Z"}
    log=b"2026-11-23T12:10:00Z Started\n2026-11-23T12:12:10Z Upload child\n2026-11-23T12:13:10Z Run descriptor.py\n2026-11-23T12:14:10Z Upload descriptor\n2026-11-23T12:20:00Z Complete job\n"
    return dict(value=value,provenance=provenance,data=data,run=run,child=child,job=job,envelope=envelope,original=original,
                small=small,official_run=official_run,parent=parent,official_job=official_job,log=log,child_bytes=child_bytes,small_bytes=small_bytes)


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
        value={"transferDescriptorMember":"provenance.json","transferRequestMember":"request.json","transferDmgMember":"Suite.dmg"}
        self.assertEqual(T["child_members"](value,["provenance.json","request.json","Suite.dmg"]),("provenance.json","request.json","Suite.dmg"))
        for names in [["provenance.json","request.json","Suite.dmg","Writer.dmg"],["provenance.json","Suite.dmg"]]:
            with self.subTest(names=names),self.assertRaises(RuntimeError):T["child_members"](value,names)

    def test_official_attempt_and_own_success_independent_of_other_platforms(self):
        v,*_=fixture();v["successfulPlatformJobName"]="Bouwen – macOS"
        r={"id":2,"head_sha":v["sourceCommit"],"run_attempt":1,"conclusion":"failure"}
        a={"id":1,"name":"uitgave-macOS","expired":False,"digest":"sha256:"+v["archiveSha256"],"workflow_run":{"id":2,"head_sha":v["sourceCommit"]}}
        j={"id":3,"run_id":2,"head_sha":v["sourceCommit"],"run_attempt":1,"name":"Bouwen – macOS","status":"completed","conclusion":"success","labels":["macos-latest"]}
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


class SupportEnvelope(unittest.TestCase):
    def test_complete_new_contract_with_original_request_and_live_metadata(self):
        b=bundle_fixture();v=b["value"]
        T["validate_go"](v);T["verify_support_origin"](v,b["small"])
        T["verify_envelope"](v,b["envelope"],b["child"])
        T["verify_original_request"](v,b["original"],b["provenance"],b["envelope"],b["data"])
        T["verify_steps_and_times"](b["parent"],b["official_job"],b["child"],b["small"],b["job"],b["log"])

    def test_missing_or_failed_suite_steps_never_inherit_green_job(self):
        for index in range(3):
            for failure in ["missing","failure","masked-outcome"]:
                b=bundle_fixture()
                if failure=="missing":b["job"]["steps"].pop(index)
                elif failure=="failure":b["job"]["steps"][index]["conclusion"]="failure"
                else:b["job"]["steps"][index]["outcome"]="failure"
                with self.subTest(index=index,failure=failure),self.assertRaises(RuntimeError):
                    T["verify_steps_and_times"](b["parent"],b["official_job"],b["child"],b["small"],b["job"],b["log"])

    def test_masked_continue_on_error_and_incomplete_raw_log_rejected(self):
        b=bundle_fixture()
        for raw in [b["log"].replace(b"Run descriptor.py",b"##[error]Process completed with exit code 1."),
                    b["log"].replace(b"2026-11-23T12:20:00Z Complete job\n",b""),
                    b["log"]+b"2026-11-23T12:15:01.500Z ##[error]Process completed with exit code 1.\n"]:
            with self.subTest(raw=raw),self.assertRaises(RuntimeError):
                T["verify_steps_and_times"](b["parent"],b["official_job"],b["child"],b["small"],b["job"],raw)

    def test_missing_or_stale_support_and_child_artifacts_rejected(self):
        b=bundle_fixture()
        with self.assertRaises(RuntimeError):T["verify_support_origin"](b["value"],{})
        for name in ["child","small"]:
            b=bundle_fixture();b[name]["created_at"]="2026-11-22T12:12:30Z"
            with self.subTest(name=name),self.assertRaises(RuntimeError):
                T["verify_steps_and_times"](b["parent"],b["official_job"],b["child"],b["small"],b["job"],b["log"])

    def test_wrong_source_child_digest_or_api_size_in_envelope_rejected(self):
        for change in ["source","child-digest","child-size","installed-id"]:
            b=bundle_fixture();e=b["envelope"]
            if change=="source":e["source"]["commit"]="0"*40
            elif change=="child-digest":e["suiteTransferArtifact"]["sha256"]="0"*64
            elif change=="child-size":e["suiteTransferArtifact"]["officialApiMetadata"]["size_in_bytes"]+=1
            else:e["expectedInstalledIdentity"]["bundleIdentifier"]="org.openaec.writer-studio"
            with self.subTest(change=change),self.assertRaises(RuntimeError):T["verify_envelope"](b["value"],e,b["child"])

    def test_original_request_or_dmg_cannot_disagree_with_wrapper(self):
        for change in ["request-source","request-suite-go","dmg","wrapper-bytes"]:
            b=bundle_fixture()
            if change=="request-source":b["original"]["source"]["tree"]="0"*40
            elif change=="request-suite-go":b["original"]["supportingSuitePackage"]["executionApproved"]=True
            elif change=="dmg":b["data"]+=b"changed"
            else:b["envelope"]["suitePackage"]["bytes"]+=1
            with self.subTest(change=change),self.assertRaises(RuntimeError):
                T["verify_original_request"](b["value"],b["original"],b["provenance"],b["envelope"],b["data"])

    def test_actual_whole_child_zip_hash_and_size_not_only_dmg(self):
        b=bundle_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"child.zip";path.write_bytes(b["child_bytes"])
            T["verify_archive"](path,b["value"]["transferArchiveSha256"],b["value"]["transferArchiveBytes"],"child")
            path.write_bytes(b["child_bytes"]+b"changed archive comment")
            with self.assertRaises(RuntimeError):T["verify_archive"](path,b["value"]["transferArchiveSha256"],b["value"]["transferArchiveBytes"],"child")

    def test_full_consumer_keeps_identity_and_dmg_absent_until_all_gates_pass(self):
        for mode in ["valid","corrupt-child","continued-descriptor-error"]:
            b=bundle_fixture();v=b["value"]
            if mode=="continued-descriptor-error":b["log"]=b["log"].replace(b"Run descriptor.py",b"##[error]Process completed with exit code 1.")
            routes={"actions/runs/2":b["official_run"],"actions/artifacts/1":b["parent"],"actions/jobs/3":b["official_job"],
                    "actions/runs/4":b["run"],"actions/artifacts/5":b["child"],"actions/jobs/6":b["job"],"actions/artifacts/7":b["small"]}
            archives={"actions/artifacts/7/zip":b["small_bytes"],"actions/artifacts/5/zip":b["child_bytes"]+(b"bad" if mode=="corrupt-child" else b"")}
            acquired=[]
            def check_output(args,**kwargs):
                if args[0]=="git":return v["sourceCommit"] if args[-1]=="HEAD" else (v["sourceTree"] if args[-1]=="HEAD^{tree}" else "")
                return json.dumps(routes[args[-1].split("open-office-studio/")[1]]).encode()
            def run(args,**kwargs):
                route=args[-1].split("open-office-studio/")[1]
                payload=b["log"] if route=="actions/jobs/6/logs" else archives[route]
                kwargs["stdout"].write(payload);acquired.append(route)
                return subprocess.CompletedProcess(args,0)
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                request=Path(tmp)/"root-request.json";request.write_text(json.dumps(v),encoding="utf-8");out=Path(tmp)/"proof"
                with patch.object(sys,"argv",["fetch",str(request),str(out)]),patch.object(subprocess,"check_output",side_effect=check_output),patch.object(subprocess,"run",side_effect=run):
                    if mode=="valid":T["main"]()
                    else:
                        with self.assertRaises(RuntimeError):T["main"]()
                receipt=json.loads((out/"artifact-origin.json").read_text(encoding="utf-8"))
                if mode=="valid":
                    self.assertTrue((out/"identity.json").exists());self.assertEqual((out/Path(v["packageMember"]).name).read_bytes(),b["data"])
                    self.assertTrue(receipt["wholeChildArchiveHashVerifiedBySuiteConsumer"]);self.assertFalse(receipt["wholeChildArchiveHashVerifiedByPreparer"])
                    self.assertFalse(receipt["nativeAccepted"]);self.assertFalse(receipt["parentZipDownloadedByThisRunner"])
                else:
                    self.assertFalse((out/"identity.json").exists());self.assertFalse((out/Path(v["packageMember"]).name).exists());self.assertEqual(receipt["status"],"failed")
                if mode=="continued-descriptor-error":self.assertFalse(any(route.endswith("/zip") for route in acquired))


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
