"""Split one verified parent into six app-only transfers and optional Suite support."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import zipfile
from contracts import APPS, digest, validate_producer, validate_request, verify_under,verify_package,verify_supporting_suite_package

REPO = "OpenAEC-Foundation/open-office-studio"


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", "repos/"+REPO+endpoint], text=True))


def producer_run_endpoint(request):
    parent=request["parentArtifact"]
    return "/actions/runs/"+str(parent["run"])+"/attempts/"+str(parent["attempt"])


def producer_state(request):
    """Read the frozen platform attempt, never borrow global latest-run state."""
    parent=request["parentArtifact"]
    run=api(producer_run_endpoint(request))
    artifact=api("/actions/artifacts/"+str(parent["id"]))
    job=api("/actions/jobs/"+str(parent["producerJobId"]))
    listing=api("/actions/runs/"+str(parent["run"])+"/artifacts?per_page=100")
    if listing.get("total_count")!=len(listing.get("artifacts",[])):
        raise ValueError("Complete producer artifact listing required to exclude duplicate Mac artifacts")
    validate_producer(request,run,artifact,job,listing["artifacts"])
    return run,artifact,job,listing


def check_harness(request, root):
    actual = {p.relative_to(root).as_posix(): digest(p) for p in
              (root/"scripts/standalone-macos").iterdir() if p.is_file() and p.suffix in (".py", ".swift")}
    if request["harnessFiles"] != actual:
        raise ValueError("QA files differ from the exact coordinator-approved harness map")


def extract(request, archive, output):
    if digest(archive) != request["parentArtifact"]["sha256"]:
        raise ValueError("Downloaded parent archive SHA256 differs")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        products=[(app,request["packages"][app],app) for app in APPS]
        if request.get("supportingSuitePackage"):
            products.append(("office",request["supportingSuitePackage"],"suite-support"))
        for app,package,folder in products:
            member = package["member"]
            if names.count(member) != 1:
                raise ValueError("Approved DMG missing or duplicated: "+app)
            entry = source.getinfo(member)
            if entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("DMG member is not a regular file")
            target = verify_under(output/folder/Path(member).name, output)
            target.parent.mkdir()
            with source.open(entry) as src, target.open("xb") as dest:
                shutil.copyfileobj(src, dest, 1024*1024)
            actual = digest(target)
            expected=package["sha256"]
            if expected is not None and actual != expected:
                raise ValueError("Extracted DMG SHA256 differs: "+app)
            proof = {"schemaVersion": 1, "app": app, "source": request["source"],
                     "parentArtifact": request["parentArtifact"], "member": member,
                     "package": {"filename": target.name, "sha256": actual, "bytes": target.stat().st_size},
                     "memberSHA256DerivedFromVerifiedParent":True,"nativeAccepted": False}
            if app=="office":
                proof.update(purpose="separate-suite-owner",nativeExecutionApproved=False,
                             preparationScope=request["preparationScope"])
            (target.parent/"provenance.json").write_text(json.dumps(proof, indent=2)+"\n", encoding="utf-8")
            (target.parent/"request.json").write_text(json.dumps(request, indent=2)+"\n", encoding="utf-8")
    return {"app": request.get("executeApps",list(APPS))}


def rebind_transfer(request,folder,app,origin_run):
    """QA helpers/expiry may change; preserve exactly the same actual package/source."""
    folder=Path(folder)
    original=json.loads((folder/"request.json").read_text())
    proof=json.loads((folder/"provenance.json").read_text())
    changes={k for k in original.keys() | request.keys() if original.get(k)!=request.get(k)}
    if original.get("executionApproved") is not True or changes-{"harnessFiles","expiresAt","reuseTransfersFromRun","executeApps"}:
        raise ValueError("A QA retry must not change source, version, package, approval or parent identity")
    def verify(q,p):
        if app=="office":return verify_supporting_suite_package(q,p,folder)
        return verify_package(q,p,folder,app)
    verify(original,proof)
    old_request_sha=digest(folder/"request.json");old_proof_sha=digest(folder/"provenance.json")
    for name,sha in (("request",old_request_sha),("provenance",old_proof_sha)):
        target=folder/("origin-"+name+"-"+sha+".json")
        if not target.exists():shutil.copyfile(folder/(name+".json"),target)
    proof["qaRequestRebind"]={"originQaRun":origin_run,"originalRequestSHA256":old_request_sha,
                              "originalProofSHA256":old_proof_sha,"changedFields":sorted(changes),
                              "packageBytesUnchanged":True}
    (folder/"request.json").write_text(json.dumps(request,indent=2)+"\n",encoding="utf-8")
    (folder/"provenance.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf-8")
    verify(request,proof)


def reuse_transfers(request,output):
    origin=request["reuseTransfersFromRun"];run=api("/actions/runs/"+str(origin))
    if (run.get("head_branch")!="codex/standalone-macos-20261123"
            or run.get("path")!=".github/workflows/standalone-macos-20261123.yml"
            or run.get("repository",{}).get("full_name")!=REPO):
        raise ValueError("Reuse run must be this own QA workflow/repository/branch")
    artifacts=api("/actions/runs/"+str(origin)+"/artifacts?per_page=100")["artifacts"]
    products=[(app,"standalone-own-"+app,app) for app in APPS]
    if request.get("supportingSuitePackage"):
        products.append(("office","standalone-support-suite","suite-support"))
    for app,name,folder in products:
        matching=[a for a in artifacts if a.get("name")==name and a.get("expired") is False]
        if len(matching)!=1:raise ValueError("Exactly one existing own app transfer required: "+app)
    output.mkdir(parents=True,exist_ok=False)
    for app,name,folder in products:
        subprocess.run(["gh","run","download",str(origin),"--repo",REPO,"--name",name,
                        "--dir",str(output/folder)],check=True)
        rebind_transfer(request,output/folder,app,origin)
    return {"app":request.get("executeApps",list(APPS))}


def main():
    parser=argparse.ArgumentParser();parser.add_argument("request", type=Path)
    parser.add_argument("output", type=Path);parser.add_argument("--archive", type=Path)
    args=parser.parse_args();request=validate_request(json.loads(args.request.read_text(encoding="utf-8")))
    root=Path(__file__).resolve().parents[2];check_harness(request,root)
    commit=api("/git/commits/"+request["source"]["commit"])
    if commit.get("tree",{}).get("sha") != request["source"]["tree"]:
        raise ValueError("Producer source tree differs from coordinator request")
    parent=request["parentArtifact"]
    run,artifact,job,listing=producer_state(request)
    if request.get("reuseTransfersFromRun"):
        matrix=reuse_transfers(request,args.output)
    elif args.archive:
        archive=args.archive
    else:
        archive=args.output.parent/("parent-"+str(parent["id"])+".zip")
        with archive.open("xb") as target:
            subprocess.run(["gh","api","repos/"+REPO+"/actions/artifacts/"+str(parent["id"])+"/zip"],
                           stdout=target,check=True)
    if not request.get("reuseTransfersFromRun"):
        matrix=extract(request,archive,args.output)
    (args.output/"producer-receipt.json").write_text(json.dumps({"run":run,"artifact":artifact,"job":job,"artifactListing":listing,
        "producerRunEndpoint":producer_run_endpoint(request),
        "preparationScope":request.get("preparationScope","six-app-only-split"),
        "nativeAppsRequested":matrix["app"],
        "nativeMatrixScope":"Only requested dedicated app identities; Suite never a native matrix member"},indent=2)+"\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"],"a",encoding="utf-8") as stream:
            stream.write("matrix="+json.dumps(matrix,separators=(",",":"))+"\nready=true\n")
            stream.write("suite-support-prepared="+str(bool(request.get("supportingSuitePackage"))).lower()+"\n")


if __name__ == "__main__":main()
