"""Verify one immutable producer archive, extract only the six approved DMGs."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import zipfile
from contracts import APPS, digest, validate_producer, validate_request, verify_under

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
            if actual != request["packages"][app]["sha256"]:
                raise ValueError("Extracted DMG SHA256 differs: "+app)
            proof = {"schemaVersion": 1, "app": app, "source": request["source"],
                     "parentArtifact": request["parentArtifact"], "member": member,
                     "package": {"filename": target.name, "sha256": actual, "bytes": target.stat().st_size},
                     "nativeAccepted": False}
            (target.parent/"provenance.json").write_text(json.dumps(proof, indent=2)+"\n", encoding="utf-8")
            (target.parent/"request.json").write_text(json.dumps(request, indent=2)+"\n", encoding="utf-8")
    return {"app": list(APPS)}


def main():
    parser=argparse.ArgumentParser();parser.add_argument("request", type=Path)
    parser.add_argument("output", type=Path);parser.add_argument("--archive", type=Path)
    args=parser.parse_args();request=validate_request(json.loads(args.request.read_text(encoding="utf-8")))
    root=Path(__file__).resolve().parents[2];check_harness(request,root)
    parent=request["parentArtifact"]
    run, artifact, job = (api("/actions/runs/"+str(parent["run"])),
                         api("/actions/artifacts/"+str(parent["id"])),
                         api("/actions/jobs/"+str(parent["producerJobId"])))
    validate_producer(request,run,artifact,job)
    if args.archive:
        archive=args.archive
    else:
        archive=args.output.parent/("parent-"+str(parent["id"])+".zip")
        with archive.open("xb") as target:
            subprocess.run(["gh","api","repos/"+REPO+"/actions/artifacts/"+str(parent["id"])+"/zip"],
                           stdout=target,check=True)
    matrix=extract(request,archive,args.output)
    (args.output/"producer-receipt.json").write_text(json.dumps({"run":run,"artifact":artifact,"job":job},indent=2)+"\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"],"a",encoding="utf-8") as stream:
            stream.write("matrix="+json.dumps(matrix,separators=(",",":"))+"\nready=true\n")


if __name__ == "__main__":main()
