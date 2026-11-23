"""No network/app: reject broken parent/preparer/child chains and altered reports."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("consumer", Path(__file__).with_name("windows-suite-child.py"))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def fixture():
    plan = dict(requireSigned=True, testTitleOverlap=True, runId=45172070275, producerRunAttempt=1, producerJobId=137683944804, applicationCommit="04fa6cd43b84e3f59fb9d5055bb2d00dde351a47", applicationTree="94fa38c20b51a73e4912964f37f0e1a659b0fb1b", version="2026.48.1", artifactId=100, archiveSha256="b"*64, suitePreparerRun=200, suitePreparerCommit="d"*40, suitePreparerAttempt=1, suitePreparerJobId=201, expectedPackagedExecutableSha256="a"*64)
    installer = "Open Office Studio_2026.48.1_x64-setup.exe"
    plan["packageMember"] = "dist-installers/office/nsis/" + installer
    data = b"synthetic NSIS bytes; never executable"
    plan["packageSha256"] = c.sha(data)
    report = json.dumps(dict(programma="open-office-studio", platform="windows", versie=plan["version"], pakketten=[dict(naam=installer, bytes=len(data), sha256=c.sha(data))])).encode()
    receipt = dict(applicationCommit=plan["applicationCommit"], applicationTree=plan["applicationTree"], version=plan["version"], artifactRun=plan["runId"], platformJobId=plan["producerJobId"], sourceAttempt=1, artifactId=100, archiveSha256=plan["archiveSha256"], archiveBytes=1000, preparerRun=200, preparerHarness=plan["suitePreparerCommit"], installer=installer,
        application=dict(key="office", title="Open Office Studio", identifier="org.openaec.office-studio", executable="open-office-studio.exe", packagePath=plan["packageMember"], sha256=c.sha(data), bytes=len(data), signature="valid", timestampRequired=True, payloadExecutable=dict(member="open-office-studio.exe", sha256="a"*64, bytes=100, pe="x64")),
        canonicalPackageReport=dict(parentMember=".local/pakketcontrole-Windows.json", sha256=c.sha(report), bytes=len(report)))
    receipt_raw = json.dumps(receipt).encode()
    suite = copy.deepcopy(receipt)
    suite.update(childArtifact=dict(id=300, name="standalone-windows-p4-office-package", bytes=100, digest="sha256:"+"c"*64), packageReceiptSha256=c.sha(receipt_raw))
    descriptor = dict(schemaVersion=1, consumer="750b", source=dict(producer=plan["runId"], attempt=1, job=plan["producerJobId"], commit=plan["applicationCommit"], tree=plan["applicationTree"], version=plan["version"], parentArtifact=100, parentZipSha256=plan["archiveSha256"]), suite=suite)
    return plan, descriptor, [(installer,data),("canonical-package-report.json",report),("package.json",receipt_raw)]


def freeze(plan, d):
    raw = (json.dumps(d, indent=2)+"\n").encode()
    plan.update(suiteDescriptorBase64=base64.b64encode(raw).decode(), suiteDescriptorSha256=c.sha(raw))


class ChildContracts(unittest.TestCase):
    def test_original_receipt_accepts_without_post_upload_fields(self):
        plan, d, entries = fixture()
        with tempfile.TemporaryDirectory(prefix="oos-child-contract-") as tmp:
            root=Path(tmp); archive=root/"child.zip"
            with zipfile.ZipFile(archive,"w") as z:
                for name,data in entries: z.writestr(name,data)
            d["suite"]["childArtifact"].update(bytes=archive.stat().st_size,digest="sha256:"+c.file_sha(archive))
            freeze(plan,d); c.descriptor(plan)
            result=c.unpack(archive,root,d["suite"])
            self.assertNotIn("childArtifact", result)
            self.assertNotIn("packageReceiptSha256", result)
            self.assertEqual((root/entries[0][0]).read_bytes(),entries[0][1])

    def test_null_or_wrong_parent_source_rejects_even_with_matching_descriptor_hash(self):
        for key,value in (("parentArtifact",None),("commit","e"*40),("attempt",2)):
            plan,d,_=fixture(); d["source"][key]=value; freeze(plan,d)
            with self.assertRaises((AssertionError,TypeError)): c.descriptor(plan)
        plan,d,_=fixture();d["suite"]["childArtifact"]["id"]=None;freeze(plan,d)
        with self.assertRaises((AssertionError,TypeError)): c.descriptor(plan)

    def test_changed_canonical_report_or_duplicate_member_rejects(self):
        for mode in ("report", "duplicate"):
            plan,d,entries=fixture()
            if mode=="report": entries[1]=(entries[1][0],b"x"*len(entries[1][1]))
            else: entries.append(entries[0])
            with tempfile.TemporaryDirectory(prefix="oos-child-contract-") as tmp:
                root=Path(tmp);archive=root/"child.zip"
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    with zipfile.ZipFile(archive,"w") as z:
                        for name,data in entries:z.writestr(name,data)
                # A consistent newly uploaded child ZIP must not erase the original report contract.
                d["suite"]["childArtifact"].update(bytes=archive.stat().st_size,digest="sha256:"+c.file_sha(archive))
                with self.assertRaises((AssertionError,json.JSONDecodeError)): c.unpack(archive,root,d["suite"])
                self.assertFalse((root/entries[0][0]).exists())

    def test_wrong_preparer_head_attempt_and_stale_artifact_reject(self):
        plan,d,_=fixture();suite=d["suite"]
        run=dict(id=200,head_sha="d"*40,path=c.WORKFLOW,head_repository=dict(full_name=c.REPO),run_attempt=1)
        steps=[dict(name=c.PREP_GATE,status="completed",conclusion="success",completed_at="2026-11-23T12:02:00Z"),dict(name=c.BIND_GATE,status="completed",conclusion="success",started_at="2026-11-23T12:04:00Z")]
        job=dict(id=201,run_id=200,head_sha="d"*40,run_attempt=1,name="prepare",status="completed",conclusion="success",started_at="2026-11-23T12:00:00Z",completed_at="2026-11-23T12:05:00Z",steps=steps)
        child=dict(id=300,name=suite["childArtifact"]["name"],size_in_bytes=100,digest=suite["childArtifact"]["digest"],expired=False,workflow_run=dict(id=200,head_sha="d"*40),created_at="2026-11-23T12:03:00Z")
        parent=dict(id=100,name="uitgave-Windows",expired=False,digest="sha256:"+plan["archiveSha256"],size_in_bytes=1000,workflow_run=dict(id=plan["runId"],head_sha=plan["applicationCommit"]))
        c.producer_metadata(plan,suite,run,job,child,parent)
        for target,key,value in ((job,"head_sha",plan["applicationCommit"]),(job,"run_attempt",2),(child,"created_at","2026-11-23T12:01:00Z"),(parent,"digest","sha256:"+"f"*64)):
            previous=target[key];target[key]=value
            with self.assertRaises(AssertionError):c.producer_metadata(plan,suite,run,job,child,parent)
            target[key]=previous


if __name__ == "__main__":
    unittest.main(verbosity=2)
