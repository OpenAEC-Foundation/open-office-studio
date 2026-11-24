"""No network/app: reject broken parent/preparer/child chains and altered reports."""
import base64
import copy
import importlib.util
import io
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
    plan = dict(requireSigned=True, testTitleOverlap=True, runId=45177730188, producerRunAttempt=1, producerJobId=137703365803, applicationCommit="b696ab86bd1c128729a079b68c0082e6df3d36a5", applicationTree="e30879fd772871e690847c061ef66e6b81808a05", version="2026.48.1", artifactId=100, archiveSha256="b"*64, suitePreparerRun=200, suitePreparerCommit="d"*40, suitePreparerAttempt=1, suitePreparerJobId=201, expectedPackagedExecutableSha256="a"*64)
    installer = "Open Office Studio_2026.48.1_x64-setup.exe"
    plan["packageMember"] = "dist-installers/office/nsis/" + installer
    plan.update(suitePrefixSealed=True, suiteDescriptorArtifactId=301, suiteDescriptorArtifactSha256="e"*64, suiteDescriptorArtifactBytes=100)
    data = b"synthetic NSIS bytes; never executable"
    plan["packageSha256"] = c.sha(data)
    report = json.dumps(dict(programma="open-office-studio", platform="windows", versie=plan["version"], pakketten=[dict(naam=installer, bytes=len(data), sha256=c.sha(data))])).encode()
    receipt = dict(applicationCommit=plan["applicationCommit"], applicationTree=plan["applicationTree"], version=plan["version"], artifactRun=plan["runId"], platformJobId=plan["producerJobId"], sourceAttempt=1, artifactId=100, archiveSha256=plan["archiveSha256"], archiveBytes=1000, preparerRun=200, preparerHarness=plan["suitePreparerCommit"], installer=installer,
        application=dict(key="office", title="Open Office Studio", identifier="org.openaec.office-studio", executable="open-office-studio.exe", packagePath=plan["packageMember"], sha256=c.sha(data), bytes=len(data), signature="valid", timestampRequired=True, payloadExecutable=dict(member="open-office-studio.exe", sha256="a"*64, bytes=100, pe="x64", derivation="Synthetic unit fixture, no native acceptance")),
        canonicalPackageReport=dict(parentMember=".local/pakketcontrole-Windows.json", sha256=c.sha(report), bytes=len(report)), boundary="Synthetic unit fixture, no real package transfer")
    receipt_raw = json.dumps(receipt).encode()
    suite = copy.deepcopy(receipt)
    suite.update(childArtifact=dict(id=300, name="standalone-windows-p5-office-package", bytes=100, digest="sha256:"+"c"*64), packageReceiptSha256=c.sha(receipt_raw))
    descriptor = dict(schemaVersion=1, consumer="750b", source=dict(producer=plan["runId"], attempt=1, job=plan["producerJobId"], commit=plan["applicationCommit"], tree=plan["applicationTree"], version=plan["version"], parentArtifact=100, parentZipSha256=plan["archiveSha256"]), suite=suite, contract="Synthetic nonnetwork contract checks")
    return plan, descriptor, [(installer,data),("canonical-package-report.json",report),("package.json",receipt_raw)]


def freeze(plan, d):
    raw = (json.dumps(d, indent=2)+"\n").encode()
    plan.update(suiteDescriptorBase64=base64.b64encode(raw).decode(), suiteDescriptorSha256=c.sha(raw))


def metadata_fixture():
    plan,d,_=fixture();suite=d["suite"]
    run=dict(id=200,head_sha="d"*40,path=c.WORKFLOW,head_repository=dict(full_name=c.REPO),run_attempt=1)
    steps=[dict(number=4,name=c.PREP_GATE,status="completed",conclusion="success",completed_at="2026-11-23T12:02:00Z"),dict(number=6,name=c.BIND_GATE,status="completed",conclusion="success",started_at="2026-11-23T12:03:30Z",completed_at="2026-11-23T12:04:00Z"),dict(number=7,name="Run actions/upload-artifact@v4",status="completed",conclusion="success",completed_at="2026-11-23T12:04:30Z")]
    job=dict(id=201,run_id=200,head_sha="d"*40,run_attempt=1,name="prepare",status="completed",conclusion="success",started_at="2026-11-23T12:00:00Z",completed_at="2026-11-23T12:05:00Z",steps=steps)
    child=dict(id=300,name=suite["childArtifact"]["name"],size_in_bytes=100,digest=suite["childArtifact"]["digest"],expired=False,workflow_run=dict(id=200,head_sha="d"*40),created_at="2026-11-23T12:03:00Z")
    parent=dict(id=100,name="uitgave-Windows",expired=False,digest="sha256:"+plan["archiveSha256"],size_in_bytes=1000,workflow_run=dict(id=plan["runId"],head_sha=plan["applicationCommit"]))
    seal=dict(id=301,name=c.DESCRIPTOR_NAME,expired=False,digest="sha256:"+plan["suiteDescriptorArtifactSha256"],size_in_bytes=100,workflow_run=dict(id=200,head_sha="d"*40),created_at="2026-11-23T12:04:10Z")
    return plan,suite,run,job,child,parent,seal


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

    def test_find_scope_is_explicit_signed_and_cannot_disguise_a_title_pass(self):
        plan,d,_=fixture(); plan.update(focusedCase="find-replace-20261124",testTitleOverlap=False,titleOnly=False)
        freeze(plan,d)
        c.descriptor(plan)
        for change in (dict(requireSigned=False),dict(testTitleOverlap=True),dict(titleOnly=True),dict(focusedCase="arbitrary-case"),dict(focusedCase=None)):
            bad=copy.deepcopy(plan);bad.update(change)
            with self.subTest(change=change), self.assertRaises(AssertionError): c.descriptor(bad)
        legacy,_,_=fixture();legacy["testTitleOverlap"]=False
        with self.assertRaises(AssertionError): c.descriptor(legacy)

    def test_regex_scope_preserves_all_signature_source_and_title_boundaries(self):
        plan,d,_=fixture();plan.update(focusedCase="regex-20261124",testTitleOverlap=False,titleOnly=False);freeze(plan,d)
        c.descriptor(plan)
        for change in (dict(requireSigned=False),dict(testTitleOverlap=True),dict(titleOnly=True),dict(focusedCase="regex-arbitrary"),dict(applicationCommit="f"*40)):
            bad=copy.deepcopy(plan);bad.update(change)
            with self.subTest(change=change), self.assertRaises(AssertionError):c.descriptor(bad)

    def test_search_extras_does_not_allow_unsigned_or_unknown_scope(self):
        plan,d,_=fixture();plan.update(focusedCase="search-extras-20261124",testTitleOverlap=False,titleOnly=False);freeze(plan,d)
        c.descriptor(plan)
        for change in (dict(requireSigned=False),dict(testTitleOverlap=True),dict(titleOnly=True),dict(focusedCase="extras-arbitrary")):
            bad=copy.deepcopy(plan);bad.update(change)
            with self.subTest(change=change), self.assertRaises(AssertionError):c.descriptor(bad)

    def test_null_or_wrong_parent_source_rejects_even_with_matching_descriptor_hash(self):
        for key,value in (("parentArtifact",None),("commit","04fa6cd43b84e3f59fb9d5055bb2d00dde351a47"),("attempt",2)):
            plan,d,_=fixture(); d["source"][key]=value; freeze(plan,d)
            with self.assertRaises((AssertionError,TypeError)): c.descriptor(plan)
        plan,d,_=fixture();d["suite"]["childArtifact"]["id"]=None;freeze(plan,d)
        with self.assertRaises((AssertionError,TypeError)): c.descriptor(plan)
        plan,d,_=fixture();d["suite"]["application"]["payloadExecutable"]["member"]=None;freeze(plan,d)
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
        plan,suite,run,job,child,parent,seal=metadata_fixture()
        c.producer_metadata(plan,suite,run,job,child,parent,seal)
        for target,key,value in ((job,"head_sha",plan["applicationCommit"]),(job,"run_attempt",2),(child,"created_at","2026-11-23T12:01:00Z"),(parent,"digest","sha256:"+"f"*64),(seal,"created_at","2026-11-23T12:03:00Z"),(seal,"digest","sha256:"+"f"*64)):
            previous=target[key];target[key]=value
            with self.assertRaises(AssertionError):c.producer_metadata(plan,suite,run,job,child,parent,seal)
            target[key]=previous

    def test_own_sealed_prefix_is_independent_of_later_app_uploads(self):
        plan,suite,run,job,child,parent,seal=metadata_fixture()
        job.update(status="in_progress",conclusion=None,completed_at=None)
        result=c.producer_metadata(plan,suite,run,job,child,parent,seal)
        self.assertEqual(result["jobStatusAtValidation"],"in_progress")
        job.update(status="completed",conclusion="failure",completed_at="2026-11-23T12:05:00Z")
        job["steps"].append(dict(number=8,name="Unrelated later app upload",status="completed",conclusion="failure"))
        result=c.producer_metadata(plan,suite,run,job,child,parent,seal)
        self.assertEqual(result["jobConclusionAtValidation"],"failure")
        job["steps"].append(dict(number=5,name="Earlier Suite upload failed",status="completed",conclusion="failure"))
        with self.assertRaises(AssertionError):c.producer_metadata(plan,suite,run,job,child,parent,seal)

    def test_actual_descriptor_archive_must_match_both_zip_and_raw_descriptor(self):
        plan,d,entries=fixture();freeze(plan,d)
        def archive(raw):
            b=io.BytesIO()
            with zipfile.ZipFile(b,"w") as z:
                z.writestr("suite-consumer.json",raw);z.writestr("pakketcontrole-Windows.json",entries[1][1])
            return b.getvalue()
        blob=archive(base64.b64decode(plan["suiteDescriptorBase64"]))
        plan.update(suiteDescriptorArtifactSha256=c.sha(blob),suiteDescriptorArtifactBytes=len(blob))
        c.sealed_descriptor(blob,plan,d["suite"])
        wrong=archive(b'{}')
        plan.update(suiteDescriptorArtifactSha256=c.sha(wrong),suiteDescriptorArtifactBytes=len(wrong))
        with self.assertRaises(AssertionError):c.sealed_descriptor(wrong,plan,d["suite"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
