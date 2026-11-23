"""Verify only our small prior result artifact for read-only XML triage."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

assert sys.platform.startswith("linux")
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from oracle import CONFIG, source_bytes, write_json

pin=json.loads((Path(__file__).parent / "input.json").read_text())
repo="repos/OpenAEC-Foundation/open-office-studio"
gh=lambda endpoint:json.loads(subprocess.check_output(["gh","api",endpoint],text=True))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
run=gh(f"{repo}/actions/runs/{pin['run']}")
assert run["head_sha"] == pin["headSha"] and run["conclusion"] == "failure"
meta=gh(f"{repo}/actions/artifacts/{pin['artifactId']}")
assert meta["name"] == pin["name"] and not meta["expired"]
assert meta["workflow_run"]["id"] == pin["run"] and meta["workflow_run"]["head_sha"] == pin["headSha"]
assert meta["digest"] == "sha256:" + pin["zipSha256"]
out=Path(".local/uop-analysis");out.mkdir(parents=True,exist_ok=True)
archive=Path(".local/uop-analysis-input.zip")
with archive.open("wb") as target:
    subprocess.run(["gh","api",f"{repo}/actions/artifacts/{pin['artifactId']}/zip"],stdout=target,check=True)
assert archive.stat().st_size == pin["zipBytes"] and sha(archive) == pin["zipSha256"]
dest=out / "input";assert not dest.exists()
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        p=PurePosixPath(entry.filename)
        assert not p.is_absolute() and ".." not in p.parts
        assert ((entry.external_attr >> 16) & 0o170000) != 0o120000
    z.extractall(dest)
source_bytes(dest / "source.uop")
binding=json.loads((dest / "runtime-binding.json").read_text())
assert binding["application"] == CONFIG["application"]
assert binding["artifact"] == json.loads(Path("scripts/qa-uop/runtime-input.json").read_text())
prior=json.loads((dest / "engine-report.json").read_text())
assert prior["engineFunctionalPassed"] is True and prior["passed"] is False
for stem in ("converted","saved","reopened-saved"):
    prior_check=json.loads((dest / (stem+"-independent.json")).read_text())
    assert sha(dest / (stem+".pptx")) == prior_check["sha256"]
write_json(out / "input-verification.json",{"input":pin,"officialDigest":meta["digest"],"wholeZipSha256":sha(archive),"sourceSha256":sha(dest / "source.uop"),"status":"verified","newRuntimeExecution":False})
print(json.dumps({"status":"verified","artifact":pin["artifactId"],"newRuntimeExecution":False}))
