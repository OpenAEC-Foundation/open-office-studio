"""Verify the small previous UOT result, without downloading/running Office again."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

assert sys.platform.startswith("linux")
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from oracle import CONFIG, source_bytes, write_json

pin = json.loads((Path(__file__).parent / "input.json").read_text())
runtime_pin = json.loads(Path("scripts/qa-uot/runtime-input.json").read_text())
repo = "repos/OpenAEC-Foundation/open-office-studio"
gh = lambda endpoint: json.loads(subprocess.check_output(["gh","api",endpoint],text=True))
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
run = gh(f"{repo}/actions/runs/{pin['run']}")
assert run["head_sha"] == pin["headSha"] and run["conclusion"] == pin["conclusion"]
meta = gh(f"{repo}/actions/artifacts/{pin['artifactId']}")
assert meta["workflow_run"]["id"] == pin["run"] and meta["workflow_run"]["head_sha"] == pin["headSha"]
assert meta["name"] == pin["name"] and not meta["expired"]
assert meta["digest"] == "sha256:" + pin["zipSha256"]
out = Path(".local/uot-engine")
out.mkdir(parents=True,exist_ok=True)
archive = Path(".local/uot-engine-input.zip")
with archive.open("wb") as target:
    subprocess.run(["gh","api",f"{repo}/actions/artifacts/{pin['artifactId']}/zip"],stdout=target,check=True)
assert archive.stat().st_size == pin["zipBytes"] and sha(archive) == pin["zipSha256"]
dest = out / "input"
assert not dest.exists()
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        p = PurePosixPath(entry.filename)
        assert not p.is_absolute() and ".." not in p.parts
        assert not (entry.external_attr >> 16) & 0o170000 == 0o120000
    z.extractall(dest)
source_bytes(dest / "source.uot")
assert sha(dest / "converted.docx") == pin["convertedSha256"]
assert sha(dest / "source-oracle.json") == pin["sourceOracleSha256"]
assert sha(dest / "runtime-binding.json") == pin["runtimeBindingSha256"]
binding = json.loads((dest / "runtime-binding.json").read_text())
assert binding["application"] == CONFIG["application"]
assert binding["artifact"] == runtime_pin
consumer = json.loads((dest / "runtime-consumer-verification.json").read_text())
assert consumer["status"] == "verified" and consumer["sourceCommit"] == CONFIG["application"]["commit"]
assert consumer["tarSha256"] == runtime_pin["tarSha256"]
conversion = json.loads((dest / "converter-report.json").read_text())
assert conversion["exitCode"] == 0 and conversion["sourceUnchanged"]
assert conversion["outputSha256"] == pin["convertedSha256"]
prior_engine = json.loads((dest / "engine-report.json").read_text())
assert prior_engine["passed"] is False
write_json(out / "input-artifact-verification.json",{
    "pin":pin,"officialArtifact":{"id":meta["id"],"name":meta["name"],"digest":meta["digest"],"workflowRun":meta["workflow_run"]},
    "wholeZipSha256":sha(archive),"bindingSha256":sha(dest / "runtime-binding.json"),
    "status":"verified","sourceImportAcceptance":"NOT PASSED; the earlier strict source-text mismatch remains unresolved",
    "newOfficeExecution":False})
print(json.dumps({"verifiedInputArtifact":pin["artifactId"],"convertedSha256":pin["convertedSha256"],"noNewOfficeExecution":True}))
