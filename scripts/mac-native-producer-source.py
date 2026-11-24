"""Explicit dual-head producer/app source contract; no network, app or build."""
import base64
import binascii
import hashlib
import json
import re

REPO="OpenAEC-Foundation/open-office-studio"
MEMBER=".local/macos-only-producer-source.json"
WORKFLOW=".github/workflows/release.yml"
SCOPE="Build-only producer/source binding; no native operation or publication"
sha=lambda data:hashlib.sha256(data).hexdigest()


def validate_pins(value, require_witness_hash=True):
    if value.get("separateProducerApproved") is not True:
        raise RuntimeError("Separate producer/application source requires explicit approval")
    for key,length in [("producerCommit",40),("producerTree",40),("producerWorkflowSha256",64),("checkoutWorkflowSha256",64)]:
        if not isinstance(value.get(key),str) or not re.fullmatch("[a-f0-9]{"+str(length)+"}",value[key]):
            raise RuntimeError("Exact separate producer source pin required: "+key)
    if (value["producerCommit"]==value["sourceCommit"] or value["producerTree"]==value["sourceTree"]
            or value["producerWorkflowSha256"]==value["checkoutWorkflowSha256"]
            or value.get("producerWorkflowPath")!=WORKFLOW
            or not isinstance(value.get("producerRef"),str) or not value["producerRef"].startswith("refs/heads/")
            or value.get("sourceWitnessRequired") is not True or value.get("sourceWitnessMember")!=MEMBER):
        raise RuntimeError("Producer/app tree, workflow hashes, ref or witness scope are conflated")
    if require_witness_hash and (not isinstance(value.get("sourceWitnessSha256"),str)
            or not re.fullmatch("[a-f0-9]{64}",value["sourceWitnessSha256"])):
        raise RuntimeError("Root-frozen hash of actual verified-parent witness required before download")
    if type(value.get("archiveBytes")) is not int or value["archiveBytes"]<=0:
        raise RuntimeError("Actual separate-producer parent byte count required")


def expected_witness(value):
    return {"appHead":value["sourceCommit"],"appTree":value["sourceTree"],"appVersion":value["declaredVersion"],
            "producerHead":value["producerCommit"],"producerWorkflowHead":value["producerCommit"],
            "producerRef":value["producerRef"],"producerWorkflowRef":REPO+"/"+WORKFLOW+"@"+value["producerRef"],
            "event":"workflow_dispatch","runId":str(value["artifactRun"]),"attempt":str(value["artifactAttempt"]),
            "job":"bouwen","checkoutWorkflowSha256":value["checkoutWorkflowSha256"],"publiceren":"false",
            "nativeAccepted":False,"scope":SCOPE}


def verify_api(value, run, artifact, job, commit, workflow):
    validate_pins(value)
    producer=value["producerCommit"]
    if (run.get("id")!=value["artifactRun"] or run.get("head_sha")!=producer
            or run.get("head_branch")!=value["producerRef"].removeprefix("refs/heads/")
            or run.get("path")!=WORKFLOW or run.get("event")!="workflow_dispatch"
            or run.get("run_attempt")!=value["artifactAttempt"]
            or artifact.get("id")!=value["artifactId"] or artifact.get("name")!=value["artifactName"]
            or artifact.get("expired") is not False or artifact.get("digest")!="sha256:"+value["archiveSha256"]
            or artifact.get("size_in_bytes")!=value["archiveBytes"]
            or artifact.get("workflow_run",{}).get("id")!=value["artifactRun"]
            or artifact.get("workflow_run",{}).get("head_sha")!=producer
            or job.get("id")!=value["successfulPlatformJob"] or job.get("run_id")!=value["artifactRun"]
            or job.get("head_sha")!=producer or job.get("run_attempt")!=value["artifactAttempt"]
            or job.get("name")!=value["successfulPlatformJobName"] or job.get("status")!="completed"
            or job.get("conclusion")!="success" or "macos-latest" not in job.get("labels",[])
            or commit.get("sha")!=producer or commit.get("tree",{}).get("sha")!=value["producerTree"]):
        raise RuntimeError("Official producer API head/tree/run/job/attempt differs from separate approved QA source")
    try:
        data=base64.b64decode("".join(workflow["content"].split()),validate=True)
    except (KeyError,AttributeError,TypeError,ValueError,binascii.Error) as error:
        raise RuntimeError("Actual producer workflow API bytes unavailable") from error
    blob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if (workflow.get("path")!=WORKFLOW or workflow.get("encoding")!="base64" or workflow.get("size")!=len(data)
            or workflow.get("sha")!=blob or sha(data)!=value["producerWorkflowSha256"]):
        raise RuntimeError("Actual producer workflow bytes differ; never substitute the app checkout workflow hash")
    return {"head":producer,"tree":value["producerTree"],"workflowSha256":sha(data),
            "applicationHead":value["sourceCommit"],"applicationTree":value["sourceTree"],"sourcesDistinct":True}


def verify_witness(value, witness):
    validate_pins(value)
    if not isinstance(witness,dict) or witness.get("member")!=MEMBER:
        raise RuntimeError("Actual verified-parent sourceWitness is missing or wrong")
    try:
        raw=base64.b64decode(witness["rawBase64"],validate=True)
        parsed=json.loads(raw.decode("utf-8"))
    except (KeyError,TypeError,ValueError,UnicodeError,binascii.Error) as error:
        raise RuntimeError("Original source witness base64/JSON bytes are unavailable") from error
    if (type(witness.get("bytes")) is not int or witness["bytes"]<=0 or witness["bytes"]!=len(raw)
            or witness.get("sha256")!=sha(raw) or sha(raw)!=value["sourceWitnessSha256"]
            or parsed!=witness.get("value") or parsed!=expected_witness(value)
            or parsed.get("nativeAccepted") is not False):
        raise RuntimeError("Actual source witness bytes/hash/value or frozen app/producer/run/ref facts differ")
    return raw
