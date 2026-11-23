"""Bind an isolated Suite transfer to its verified parent; never launch the Suite."""
import argparse,json,os
from pathlib import Path
from contracts import SUITE_PRODUCT,SEVEN_SPLIT_SCOPE,hex_value,validate_request,verify_supporting_suite_package
from prepare import api,check_harness


def verify_child_artifact(meta,artifact_id,artifact_digest,qa_run,qa_commit):
    expected=artifact_digest.removeprefix("sha256:")
    if (meta.get("id")!=artifact_id or meta.get("name")!="standalone-support-suite" or meta.get("expired") is not False
            or meta.get("digest")!="sha256:"+expected or meta.get("workflow_run",{}).get("id")!=qa_run
            or meta.get("workflow_run",{}).get("head_sha")!=qa_commit):
        raise ValueError("Official Suite transfer artifact digest/run/name/commit differs")


def descriptor(request,proof,folder,artifact_id,artifact_digest,qa_run,qa_commit):
    validate_request(request)
    dmg=verify_supporting_suite_package(request,proof,folder)
    child_hash=artifact_digest.removeprefix("sha256:")
    if type(artifact_id) is not int or artifact_id<=0 or not hex_value(child_hash,64):
        raise ValueError("Official uploaded Suite child artifact ID and digest required")
    if type(qa_run) is not int or qa_run<=0 or not hex_value(qa_commit,40):
        raise ValueError("Exact own QA transfer run/commit required")
    name,binary,identifier=SUITE_PRODUCT
    return {"schemaVersion":1,"scope":SEVEN_SPLIT_SCOPE,"source":request["source"],
            "officialParentArtifact":request["parentArtifact"],
            "suitePackage":{"member":proof["member"],"filename":dmg.name,**proof["package"]},
            "suiteTransferArtifact":{"id":artifact_id,"name":"standalone-support-suite","sha256":child_hash,
                                     "qaRun":qa_run,"qaCommit":qa_commit,"officialApiDigestVerified":False,
                                     "wholeChildArchiveHashVerifiedByPreparer":False},
            "expectedInstalledIdentity":{"productName":name,"executable":binary,"bundleIdentifier":identifier,
                                         "version":request["source"]["version"]},
            "validationOwner":"mac_native_release_blocker","nativeExecutionPerformed":False,"nativeAccepted":False,
            "suiteDeliveryToStandaloneHostsAuthorized":False,
            "pendingOwnerChecks":["actual CF identity/version/executable", "codesign/stapler/Gatekeeper",
                                  "normal native input/save/quit/reopen and core374"],
            "limitations":["Transfer binding only; no Suite native acceptance or Suite STW import is implied."]}


def main():
    parser=argparse.ArgumentParser();parser.add_argument("request",type=Path);parser.add_argument("folder",type=Path)
    parser.add_argument("output",type=Path);args=parser.parse_args()
    request=json.loads(args.request.read_text());check_harness(request,Path(__file__).resolve().parents[2])
    value=descriptor(request,json.loads((args.folder/"provenance.json").read_text()),
        args.folder,int(os.environ["SUITE_SUPPORT_ARTIFACT_ID"]),os.environ["SUITE_SUPPORT_ARTIFACT_DIGEST"],
        int(os.environ["GITHUB_RUN_ID"]),os.environ["GITHUB_SHA"])
    child=value["suiteTransferArtifact"];meta=api("/actions/artifacts/"+str(child["id"]))
    verify_child_artifact(meta,child["id"],child["sha256"],child["qaRun"],child["qaCommit"])
    child.update(officialApiDigestVerified=True,officialApiMetadata=meta)
    args.output.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":main()
