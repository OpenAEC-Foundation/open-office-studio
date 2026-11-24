"""Fetch only the Suite child, validating the pinned official-parent provenance chain."""
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
import re
import runpy
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
PARENT = runpy.run_path(str(Path(__file__).with_name("mac-native-current-fetch.py")))
PRODUCER = runpy.run_path(str(Path(__file__).with_name("mac-native-producer-source.py")))
sha = lambda data: hashlib.sha256(data).hexdigest()
SUITE_STEPS = (
    "Transfer Suite only to its separate validation owner",
    "Bind separate Suite child artifact to parent and DMG digests",
    "Preserve separate Suite-owner descriptor",
)
SCOPE = "seven-product-split-six-app-only-hosts"
TIME_SLOP = timedelta(seconds=2)  # API timestamps can omit log subsecond precision.


def source_pin(value):
    return {"commit":value["sourceCommit"],"tree":value["sourceTree"],"version":value["declaredVersion"]}


def parent_pin(value):
    return {"id":value["artifactId"],"run":value["artifactRun"],"producerJobId":value["successfulPlatformJob"],
            "name":value["artifactName"],"sha256":value["archiveSha256"],"attempt":value["artifactAttempt"],
            **({"bytes":value["archiveBytes"]} if "archiveBytes" in value else {})}


def installed_pin(value):
    return {"productName":"Open Office Studio","executable":"open-office-studio",
            "bundleIdentifier":"org.openaec.office-studio","version":value["declaredVersion"]}


def timestamp(value):
    try:
        result=datetime.fromisoformat(value.replace("Z","+00:00"))
        if result.utcoffset() is None:raise ValueError("Timezone required")
        return result
    except (AttributeError,TypeError,ValueError) as error:
        raise RuntimeError("Concrete timezone-aware artifact/step timestamps required") from error


def in_interval(value, start, end, label):
    actual, begin, finish=timestamp(value),timestamp(start),timestamp(end)
    if finish < begin or not begin-TIME_SLOP <= actual <= finish+TIME_SLOP:
        raise RuntimeError("Stale/out-of-window "+label)


def verify_archive(path, expected_hash, expected_bytes, label):
    digest=hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda:handle.read(1024*1024),b""):digest.update(block)
    actual={"sha256":digest.hexdigest(),"bytes":Path(path).stat().st_size,"wholeArchiveHashed":True}
    if actual["bytes"] != expected_bytes or actual["sha256"] != expected_hash:
        raise RuntimeError("Complete "+label+" ZIP bytes/hash differ; observed="+json.dumps(actual,sort_keys=True))
    return actual


def exact_member(names, name, suffix):
    if (not isinstance(name, str) or not name.endswith(suffix) or "\\" in name
            or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts
            or names.count(name) != 1):
        raise RuntimeError("One exact safe Suite transfer member required: "+str(name))
    return name


def child_members(value, names):
    descriptor = exact_member(names,value["transferDescriptorMember"],".json")
    request = exact_member(names,value["transferRequestMember"],".json")
    dmg = exact_member(names,value["transferDmgMember"],".dmg")
    if [name for name in names if name.endswith(".dmg")] != [dmg] or set(n for n in names if not n.endswith("/")) != {descriptor,request,dmg}:
        raise RuntimeError("Suite child must contain only its own DMG/request/provenance")
    return descriptor,request,dmg


def verify_transfer_origin(value, run, artifact, job):
    if (run["id"] != value["transferRun"] or run["head_sha"] != value["transferCommit"]
            or run["run_attempt"] != value["transferAttempt"]
            or artifact["id"] != value["transferArtifactId"] or artifact["name"] != value["transferArtifactName"]
            or artifact["expired"] or artifact["digest"] != "sha256:"+value["transferArchiveSha256"]
            or artifact.get("size_in_bytes") != value["transferArchiveBytes"]
            or artifact["workflow_run"]["id"] != value["transferRun"]
            or artifact["workflow_run"]["head_sha"] != value["transferCommit"]
            or job["id"] != value["transferProducerJob"] or job["run_id"] != value["transferRun"]
            or job["head_sha"] != value["transferCommit"] or job["run_attempt"] != value["transferAttempt"]
            or job["name"] != value["transferProducerJobName"] or job["status"] != "completed"
            or job["conclusion"] != "success"):
        raise RuntimeError("Suite child / preparer job / source / attempt differs")


def verify_support_origin(value, artifact):
    if (artifact.get("id") != value["supportDescriptorArtifactId"]
            or artifact.get("name") != value["supportDescriptorArtifactName"]
            or artifact.get("name") != "standalone-suite-support-descriptor-"+value["transferCommit"]
            or artifact.get("expired") is not False
            or artifact.get("digest") != "sha256:"+value["supportDescriptorArchiveSha256"]
            or artifact.get("size_in_bytes") != value["supportDescriptorArchiveBytes"]
            or artifact.get("workflow_run",{}).get("id") != value["transferRun"]
            or artifact.get("workflow_run",{}).get("head_sha") != value["transferCommit"]):
        raise RuntimeError("Concrete Suite support descriptor artifact/source/hash/size differs")


def verify_steps_and_times(official_artifact, official_job, child, support, preparer, raw_log):
    steps=[]
    for name in SUITE_STEPS:
        matches=[s for s in preparer.get("steps",[]) if s.get("name")==name]
        if len(matches)!=1 or matches[0].get("status")!="completed" or matches[0].get("conclusion")!="success":
            raise RuntimeError("Required Suite transfer/descriptor step not explicitly successful: "+name)
        step=matches[0]
        if "outcome" in step and step["outcome"] != "success":
            raise RuntimeError("Failed raw Suite step outcome despite continued job: "+name)
        in_interval(step["started_at"],preparer["started_at"],preparer["completed_at"],name+" start")
        if timestamp(step["completed_at"]) < timestamp(step["started_at"]):
            raise RuntimeError("Suite step completion predates its start")
        in_interval(step["completed_at"],step["started_at"],preparer["completed_at"],name+" completion")
        steps.append(step)
    if not all(type(s.get("number")) is int for s in steps) or not steps[0]["number"]<steps[1]["number"]<steps[2]["number"]:
        raise RuntimeError("Suite transfer/descriptor step ordering differs")
    for before,after in zip(steps,steps[1:]):
        if timestamp(after["started_at"]) < timestamp(before["completed_at"])-TIME_SLOP:
            raise RuntimeError("Suite transfer/descriptor timeline overlaps out of order")
    in_interval(official_artifact["created_at"],official_job["started_at"],official_job["completed_at"],"official parent artifact")
    if timestamp(steps[0]["started_at"]) < timestamp(official_job["completed_at"])-TIME_SLOP:
        raise RuntimeError("Suite child predates successful official Mac producer")
    for artifact,step,label in [(child,steps[0],"Suite child"),(support,steps[2],"support descriptor")]:
        in_interval(artifact["created_at"],step["started_at"],step["completed_at"],label+" creation")
        in_interval(artifact["updated_at"],artifact["created_at"],preparer["completed_at"],label+" update")
    if timestamp(child["created_at"]) > timestamp(steps[1]["started_at"])+TIME_SLOP:
        raise RuntimeError("Support binding predates its uploaded child")
    if timestamp(support["created_at"]) < timestamp(steps[1]["completed_at"])-TIME_SLOP:
        raise RuntimeError("Support artifact predates completed binding")
    # GitHub continue-on-error can present a successful conclusion after a raw
    # failure. The completed full official job log must independently exclude
    # runner error annotations in each required step's actual time interval.
    lines=[]
    for line in raw_log.decode("utf-8-sig").splitlines():
        line=re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]","",line).lstrip("\ufeff")
        match=re.match(r"^(\S+)\s+(.*)$",line)
        if match and re.match(r"^\d{4}-\d\d-\d\dT",match[1]):lines.append((timestamp(match[1]),match[2]))
    if (not lines or min(t for t,_ in lines)>timestamp(preparer["started_at"])+TIME_SLOP
            or max(t for t,_ in lines)<timestamp(preparer["completed_at"])-TIME_SLOP):
        raise RuntimeError("Complete official preparer job log unavailable; no raw step-success proof")
    for step in steps:
        records=[text for t,text in lines if timestamp(step["started_at"])-TIME_SLOP<=t<=timestamp(step["completed_at"])+TIME_SLOP]
        if not records or any("##[error]" in text or re.search(r"Process completed with exit code (?!0\b)-?\d+",text) for text in records):
            raise RuntimeError("Required Suite step raw log missing/failed despite job success: "+step["name"])
    return {"requiredSteps":steps,"rawPreparerLogSha256":sha(raw_log),"completeJobLogReviewed":True,
            "policy":"Explicit successful step metadata + complete time-scoped raw log without runner failures + concrete in-window artifacts; API precision tolerance2s"}


def verify_descriptor(value, descriptor, data):
    expected_source = source_pin(value)
    parent = parent_pin(value)
    member = PurePosixPath(value["packageMember"])
    package = descriptor.get("package", {})
    if (descriptor.get("schemaVersion") != 1 or descriptor.get("app") != "office"
            or descriptor.get("source") != expected_source or descriptor.get("parentArtifact") != parent
            or descriptor.get("member") != str(member) or descriptor.get("memberSHA256DerivedFromVerifiedParent") is not True
            or descriptor.get("purpose") != "separate-suite-owner" or descriptor.get("nativeExecutionApproved") is not False
            or descriptor.get("nativeAccepted") is not False
            or package.get("filename") != member.name or package.get("bytes") != len(data)
            or package.get("sha256") != sha(data)):
        raise RuntimeError("Suite child bytes do not match the exact verified-parent descriptor")
    if value.get("packageSha256") is not None and value["packageSha256"] != sha(data):
        raise RuntimeError("Suite DMG differs from integration's independent expected hash")
    if value.get("separateProducerApproved") is True:
        PRODUCER["verify_witness"](value,descriptor.get("sourceWitness"))


def verify_envelope(value, envelope, child):
    package=envelope.get("suitePackage",{})
    transfer=envelope.get("suiteTransferArtifact",{})
    snapshot=transfer.get("officialApiMetadata",{})
    if (envelope.get("schemaVersion")!=1 or envelope.get("scope")!=SCOPE
            or envelope.get("source")!=source_pin(value) or envelope.get("officialParentArtifact")!=parent_pin(value)
            or package.get("member")!=value["packageMember"]
            or package.get("filename")!=PurePosixPath(value["packageMember"]).name
            or type(package.get("bytes")) is not int or package["bytes"]<=0
            or not re.fullmatch(r"[a-f0-9]{64}",package.get("sha256", ""))
            or envelope.get("expectedInstalledIdentity")!=installed_pin(value)
            or envelope.get("validationOwner")!="mac_native_release_blocker"
            or envelope.get("nativeExecutionPerformed") is not False or envelope.get("nativeAccepted") is not False
            or envelope.get("suiteDeliveryToStandaloneHostsAuthorized") is not False):
        raise RuntimeError("Suite support envelope source/parent/DMG/installed identity/scope differs")
    if (transfer.get("id")!=value["transferArtifactId"] or transfer.get("name")!="standalone-support-suite"
            or transfer.get("sha256")!=value["transferArchiveSha256"] or transfer.get("qaRun")!=value["transferRun"]
            or transfer.get("qaCommit")!=value["transferCommit"] or transfer.get("officialApiDigestVerified") is not True
            or transfer.get("wholeChildArchiveHashVerifiedByPreparer") is not False):
        raise RuntimeError("Suite support envelope child/API/scope claim differs")
    for key in ["id","name","digest","size_in_bytes","created_at","workflow_run"]:
        if snapshot.get(key)!=child.get(key):
            raise RuntimeError("Suite support embedded API differs from live child: "+key)
    if snapshot.get("expired") is not False or snapshot.get("size_in_bytes")!=value["transferArchiveBytes"]:
        raise RuntimeError("Suite support embedded child expiry/size differs")
    if value.get("packageSha256") is not None and package["sha256"]!=value["packageSha256"]:
        raise RuntimeError("Suite support DMG hash differs from independent root pin")
    if value.get("separateProducerApproved") is True:
        return PRODUCER["verify_witness"](value,envelope.get("sourceWitness"))
    return None


def verify_original_request(value, original, provenance, envelope, data):
    support=original.get("supportingSuitePackage",{})
    if (original.get("schemaVersion")!=1 or original.get("scope")!="macos-standalone-six"
            or original.get("preparationScope")!=SCOPE or original.get("source")!=source_pin(value)
            or original.get("parentArtifact")!=parent_pin(value)
            or set(original.get("packages",{}))!={"writer","spreadsheet","presentation","email","notition","database"}
            or support.get("purpose")!="separate-suite-owner" or support.get("executionApproved") is not False
            or support.get("member")!=value["packageMember"]):
        raise RuntimeError("Original child request source/parent/separate Suite scope differs")
    if support.get("sha256") is None:
        if support.get("hashBinding")!="verified-parent-archive":raise RuntimeError("Original Suite member has no parent hash binding")
    elif support["sha256"]!=sha(data):raise RuntimeError("Original Suite member expected hash differs")
    verify_descriptor(value,provenance,data)
    expected=dict(provenance["package"],member=provenance["member"])
    if envelope["suitePackage"]!=expected:
        raise RuntimeError("Support envelope and actual original Suite provenance/DMG bytes differ")
    if value.get("separateProducerApproved") is True and provenance.get("sourceWitness")!=envelope.get("sourceWitness"):
        raise RuntimeError("Raw provenance and support envelope source witness differ")


def validate_go(value):
    if (value.get("executionApproved") is not True or value.get("suiteChildTransferApproved") is not True
            or value.get("supportDescriptorRequired") is not True
            or value.get("derivePackageIdentityFromVerifiedArchive") is not True
            or value.get("requireSignedNotarized") is not True or value.get("requireExactPackageMember") is not True):
        raise RuntimeError("Explicit official signed Suite child release is required before any download")
    for key in ["artifactRun","artifactAttempt","artifactId","successfulPlatformJob","transferRun","transferAttempt",
                "transferArtifactId","transferArchiveBytes","transferProducerJob","supportDescriptorArtifactId","supportDescriptorArchiveBytes"]:
        if type(value.get(key)) is not int or value[key]<=0:raise RuntimeError("Concrete positive binding required before download: "+key)
    for key,length in [("sourceCommit",40),("sourceTree",40),("archiveSha256",64),("transferCommit",40),
                       ("transferArchiveSha256",64),("supportDescriptorArchiveSha256",64)]:
        if not isinstance(value.get(key),str) or not re.fullmatch("[a-f0-9]{"+str(length)+"}",value[key]):
            raise RuntimeError("Exact hash binding required before download: "+key)
    for key in ["packageMember","transferDmgMember","transferRequestMember","transferDescriptorMember","supportDescriptorMember",
                "successfulPlatformJobName","transferProducerJobName","supportDescriptorArtifactName"]:
        if not isinstance(value.get(key),str) or not value[key]:raise RuntimeError("Concrete member/name binding required before download: "+key)
    if value.get("artifactName")!="uitgave-macOS" or value.get("transferArtifactName")!="standalone-support-suite":
        raise RuntimeError("Official Suite parent/child artifact names differ")
    if value.get("separateProducerApproved") is True:
        PRODUCER["validate_pins"](value)
    elif value.get("producerCommit") is not None:
        raise RuntimeError("Separate producer cannot silently fall back to app-head equality")
    PARENT["package_member"](value,[value["packageMember"]])


def main():
    request_path, output = Path(sys.argv[1]), Path(sys.argv[2])
    request = request_path.read_bytes(); value = json.loads(request)
    validate_go(value)
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    if (git("rev-parse", "HEAD") != value["sourceCommit"] or git("rev-parse", "HEAD^{tree}") != value["sourceTree"]
            or git("status", "--porcelain", "--untracked-files=no")):
        raise RuntimeError("Clean exact application source required")
    if value.get("separateProducerApproved") is True and sha(Path(value["producerWorkflowPath"]).read_bytes())!=value["checkoutWorkflowSha256"]:
        raise RuntimeError("Actual app checkout workflow bytes differ from the app witness pin")
    output.mkdir(parents=True, exist_ok=False)
    (output/"request.json").write_bytes(request)
    receipt={"status":"running","nativeAccepted":False,"requestSha256":sha(request),"parentZipDownloadedByThisRunner":False,
             "consumerSourceSha256":sha(Path(__file__).read_bytes()),
             "scope":"Package acquisition only; actual installed identity/signature/native checks remain separate"}

    def api(route,label):
        result=json.loads(subprocess.check_output(["gh","api",f"repos/{REPO}/"+route]))
        receipt[label]=result
        (output/(label+".json")).write_text(json.dumps(result,indent=2),encoding="utf-8")
        return result

    def download(artifact_id,path):
        with path.open("wb") as handle:
            subprocess.run(["gh","api",f"repos/{REPO}/actions/artifacts/{artifact_id}/zip"],stdout=handle,check=True,timeout=300)

    try:
        official=[api(f"actions/runs/{value['artifactRun']}","officialRun"),api(f"actions/artifacts/{value['artifactId']}","officialArtifact"),
                  api(f"actions/jobs/{value['successfulPlatformJob']}","officialMacJob")]
        if value.get("separateProducerApproved") is True:
            producer_commit=api(f"git/commits/{value['producerCommit']}","producerCommitMetadata")
            producer_workflow=api(f"contents/{value['producerWorkflowPath']}?ref={value['producerCommit']}","producerWorkflowMetadata")
            receipt["producerBinding"]=PRODUCER["verify_api"](value,*official,producer_commit,producer_workflow)
            receipt["applicationCheckout"]={**source_pin(value),"checkoutWorkflowSha256":value["checkoutWorkflowSha256"]}
        else:
            PARENT["verify_platform_origin"](value,*official)
        transfer=[api(f"actions/runs/{value['transferRun']}","transferRun"),api(f"actions/artifacts/{value['transferArtifactId']}","transferArtifact"),
                  api(f"actions/jobs/{value['transferProducerJob']}","transferPreparerJob")]
        verify_transfer_origin(value,*transfer)
        support=api(f"actions/artifacts/{value['supportDescriptorArtifactId']}","supportDescriptorArtifact")
        verify_support_origin(value,support)
        with (output/"preparer-job.log").open("wb") as log:
            subprocess.run(["gh","api","--allow-escape-sequences",f"repos/{REPO}/actions/jobs/{value['transferProducerJob']}/logs"],stdout=log,check=True,timeout=120)
        receipt["stepAndArtifactTimeGates"]=verify_steps_and_times(official[1],official[2],transfer[1],support,transfer[2],(output/"preparer-job.log").read_bytes())
        # Only after actual artifact presence, successful Suite steps and their
        # raw logs/timestamps are proven may either artifact ZIP be acquired.
        small=output/"suite-support-descriptor.zip";download(value["supportDescriptorArtifactId"],small)
        receipt["supportDescriptorArchive"]=verify_archive(small,value["supportDescriptorArchiveSha256"],value["supportDescriptorArchiveBytes"],"Suite support descriptor")
        with zipfile.ZipFile(small) as bundle:
            member=exact_member(bundle.namelist(),value["supportDescriptorMember"],".json")
            if [n for n in bundle.namelist() if not n.endswith("/")] != [member]:raise RuntimeError("Small support artifact must contain only its exact descriptor")
            envelope_bytes=bundle.read(member)
        envelope=json.loads(envelope_bytes);witness_bytes=verify_envelope(value,envelope,transfer[1])
        (output/"suite-support-descriptor.json").write_bytes(envelope_bytes)
        receipt["supportDescriptorSha256"]=sha(envelope_bytes)
        if witness_bytes is not None:
            (output/"actual-parent-source-witness.json").write_bytes(witness_bytes)
            receipt["sourceWitness"]={"member":value["sourceWitnessMember"],"sha256":sha(witness_bytes),"bytes":len(witness_bytes),
                                      "rawBytesHashVerifiedByConsumer":True,"value":json.loads(witness_bytes),
                                      "parentMembershipEstablishedBy":"Verified-parent preparer provenance and root-frozen witness hash; Suite does not download parent"}
        archive=output/"suite-child.zip";download(value["transferArtifactId"],archive)
        receipt["actualWholeChildArchive"]=verify_archive(archive,value["transferArchiveSha256"],value["transferArchiveBytes"],"Suite child")
        with zipfile.ZipFile(archive) as bundle:
            descriptor_member,request_member,dmg_member=child_members(value,bundle.namelist())
            descriptor_bytes=bundle.read(descriptor_member);original_bytes=bundle.read(request_member);data=bundle.read(dmg_member)
        descriptor=json.loads(descriptor_bytes);original=json.loads(original_bytes)
        verify_original_request(value,original,descriptor,envelope,data)
        (output/"transfer-provenance.json").write_bytes(descriptor_bytes)
        (output/"original-child-request.json").write_bytes(original_bytes)
        receipt.update(originalChildRequestSha256=sha(original_bytes),rawProvenanceSha256=sha(descriptor_bytes),
                       wholeChildArchiveHashVerifiedByPreparer=False,wholeChildArchiveHashVerifiedBySuiteConsumer=True,
                       expectedInstalledIdentity=envelope["expectedInstalledIdentity"])
        # No DMG output, mount, app copy or identity exists before all bindings
        # and both complete ZIP hashes have actually passed.
        package_path=output/PurePosixPath(value["packageMember"]).name;package_path.write_bytes(data)
        identity=dict(value,packageSha256=sha(data),packagePath=str(package_path.resolve()))
        (output/"identity.json").write_text(json.dumps(identity,indent=2),encoding="utf-8")
        receipt.update(status="package-chain-verified-native-pending",identity=identity)
    except Exception as error:
        receipt.update(status="failed",error=str(error))
        receipt["retainedFailureArchives"]=[{"path":str(path),"bytes":path.stat().st_size} for path in output.glob("*.zip")]
        raise
    finally:
        (output/"artifact-origin.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")


if __name__ == "__main__": main()
