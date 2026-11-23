"""Verify one immutable producer archive, extract only the six approved DMGs."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import zipfile
from contracts import APPS, digest, validate_producer, validate_request, verify_under,verify_package

REPO = "OpenAEC-Foundation/open-office-studio"


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", "repos/"+REPO+endpoint], text=True))


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
        for app in APPS:
            member = request["packages"][app]["member"]
            if names.count(member) != 1:
                raise ValueError("Approved DMG missing or duplicated: "+app)
            entry = source.getinfo(member)
            if entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("DMG member is not a regular file")
            target = verify_under(output/app/Path(member).name, output)
            target.parent.mkdir()
            with source.open(entry) as src, target.open("xb") as dest:
                shutil.copyfileobj(src, dest, 1024*1024)
            actual = digest(target)
            expected=request["packages"][app]["sha256"]
            if expected is not None and actual != expected:
                raise ValueError("Extracted DMG SHA256 differs: "+app)
            proof = {"schemaVersion": 1, "app": app, "source": request["source"],
                     "parentArtifact": request["parentArtifact"], "member": member,
                     "package": {"filename": target.name, "sha256": actual, "bytes": target.stat().st_size},
                     "memberSHA256DerivedFromVerifiedParent":True,"nativeAccepted": False}
            (target.parent/"provenance.json").write_text(json.dumps(proof, indent=2)+"\n", encoding="utf-8")
            (target.parent/"request.json").write_text(json.dumps(request, indent=2)+"\n", encoding="utf-8")
    return {"app": list(APPS)}


def rebind_transfer(request,folder,app,origin_run):
    """QA helpers/expiry may change; preserve exactly the same actual package/source."""
    folder=Path(folder)
    original=json.loads((folder/"request.json").read_text())
    proof=json.loads((folder/"provenance.json").read_text())
    changes={k for k in original.keys() | request.keys() if original.get(k)!=request.get(k)}
    if original.get("executionApproved") is not True or changes-{"harnessFiles","expiresAt","reuseTransfersFromRun"}:
        raise ValueError("A QA retry must not change source, version, package, approval or parent identity")
    verify_package(original,proof,folder,app)
    old_request_sha=digest(folder/"request.json");old_proof_sha=digest(folder/"provenance.json")
    for name,sha in (("request",old_request_sha),("provenance",old_proof_sha)):
        target=folder/("origin-"+name+"-"+sha+".json")
        if not target.exists():shutil.copyfile(folder/(name+".json"),target)
    proof["qaRequestRebind"]={"originQaRun":origin_run,"originalRequestSHA256":old_request_sha,
                              "originalProofSHA256":old_proof_sha,"changedFields":sorted(changes),
                              "packageBytesUnchanged":True}
    (folder/"request.json").write_text(json.dumps(request,indent=2)+"\n",encoding="utf-8")
    (folder/"provenance.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf-8")
    verify_package(request,proof,folder,app)


def reuse_transfers(request,output):
    origin=request["reuseTransfersFromRun"];run=api("/actions/runs/"+str(origin))
    if (run.get("head_branch")!="codex/standalone-macos-20261123"
            or run.get("path")!=".github/workflows/standalone-macos-20261123.yml"
            or run.get("repository",{}).get("full_name")!=REPO):
        raise ValueError("Reuse run must be this own QA workflow/repository/branch")
    artifacts=api("/actions/runs/"+str(origin)+"/artifacts?per_page=100")["artifacts"]
    for app in APPS:
        matching=[a for a in artifacts if a.get("name")=="standalone-own-"+app and a.get("expired") is False]
        if len(matching)!=1:raise ValueError("Exactly one existing own app transfer required: "+app)
    output.mkdir(parents=True,exist_ok=False)
    for app in APPS:
        subprocess.run(["gh","run","download",str(origin),"--repo",REPO,"--name","standalone-own-"+app,
                        "--dir",str(output/app)],check=True)
        rebind_transfer(request,output/app,app,origin)
    return {"app":list(APPS)}


def main():
    parser=argparse.ArgumentParser();parser.add_argument("request", type=Path)
    parser.add_argument("output", type=Path);parser.add_argument("--archive", type=Path)
    args=parser.parse_args();request=validate_request(json.loads(args.request.read_text(encoding="utf-8")))
    root=Path(__file__).resolve().parents[2];check_harness(request,root)
    commit=api("/git/commits/"+request["source"]["commit"])
    if commit.get("tree",{}).get("sha") != request["source"]["tree"]:
        raise ValueError("Producer source tree differs from coordinator request")
    parent=request["parentArtifact"]
    run, artifact, job = (api("/actions/runs/"+str(parent["run"])),
                         api("/actions/artifacts/"+str(parent["id"])),
                         api("/actions/jobs/"+str(parent["producerJobId"])))
    validate_producer(request,run,artifact,job)
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
    (args.output/"producer-receipt.json").write_text(json.dumps({"run":run,"artifact":artifact,"job":job},indent=2)+"\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"],"a",encoding="utf-8") as stream:
            stream.write("matrix="+json.dumps(matrix,separators=(",",":"))+"\nready=true\n")


if __name__ == "__main__":main()
