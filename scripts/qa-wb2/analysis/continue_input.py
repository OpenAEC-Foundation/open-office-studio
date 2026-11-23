"""Authenticate tiny retained prior CI output; do not execute/download Office."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from oracle import CONFIG, parse_native, source_bytes, write_json


def main():
    pin = json.loads(Path("scripts/qa-wb2/analysis/continuation.json").read_text())
    repo = "repos/OpenAEC-Foundation/open-office-studio"
    def gh(endpoint):
        return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))
    meta = gh(f"{repo}/actions/artifacts/{pin['artifactId']}")
    assert meta["digest"] == "sha256:" + pin["zipSha256"] and not meta["expired"]
    assert meta["name"] == pin["artifactName"] and meta["size_in_bytes"] == pin["zipBytes"]
    assert meta["workflow_run"]["id"] == pin["run"] and meta["workflow_run"]["head_sha"] == pin["harnessCommit"]
    run = gh(f"{repo}/actions/runs/{pin['run']}")
    assert run["head_sha"] == pin["harnessCommit"] and run["conclusion"] == "failure"
    work = Path(".local/wb2-continuation")
    work.mkdir(parents=True)
    archive = work / "prior-runtime.zip"
    with archive.open("wb") as f:
        subprocess.run(["gh", "api", f"{repo}/actions/artifacts/{pin['artifactId']}/zip"], stdout=f, check=True)
    data = archive.read_bytes()
    assert len(data) == pin["zipBytes"] and hashlib.sha256(data).hexdigest() == pin["zipSha256"]
    out = Path(".local/wb2-qa")
    assert not out.exists()
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            p = PurePosixPath(entry.filename)
            assert not p.is_absolute() and ".." not in p.parts
        z.extractall(out)
    original = source_bytes(out / "source.wb2")
    fresh_oracle = parse_native(original)
    recorded = json.loads((out / "source-oracle.json").read_text())
    assert fresh_oracle["sheets"] == recorded["sheets"] and fresh_oracle["expected"] == recorded["expected"]
    converted = (out / "converted.xlsx").read_bytes()
    assert len(converted) == pin["convertedBytes"] and hashlib.sha256(converted).hexdigest() == pin["convertedSha256"]
    opened = json.loads((out / "open-result.json").read_text())
    conversion = json.loads((out / "converter-report.json").read_text())
    binding = json.loads((out / "runtime-binding.json").read_text())
    shared = json.loads(Path("scripts/qa-wb2/runtime-input.json").read_text())
    prior = json.loads((out / "engine-report.json").read_text())
    assert prior["harnessCommit"] == pin["harnessCommit"] and prior["passed"] is False
    assert conversion["exitCode"] == 0 and conversion["sourceUnchanged"] is True
    assert conversion["sourceSha256"] == CONFIG["source"]["sha256"]
    assert conversion["outputSha256"] == opened["bytes"]["sha256"] == pin["convertedSha256"]
    assert opened["bytes"]["length"] == pin["convertedBytes"] and opened["soort"] == "xlsx"
    assert opened["naam"] == "testQuattro.xlsx" and opened["gewijzigd"] is True
    assert binding["application"] == CONFIG["application"] and binding["artifact"] == shared
    assert conversion["binding"] == binding
    receipt = json.loads((out / "runtime-consumer-verification.json").read_text())
    assert receipt["status"] == "verified" and receipt["sourceCommit"] == CONFIG["application"]["commit"]
    assert receipt["tarSha256"] == shared["tarSha256"]
    write_json(out / "continuation-binding.json", {"pin": pin, "officialArtifact": meta, "sourceReparsed": True,
               "convertedBytesVerified": True, "priorStrictRunConclusion": run["conclusion"],
               "method": "Inherited actual private converter/production helper evidence from pinned failing strict run; no new Office execution"})
    print(json.dumps({"artifact": pin["artifactId"], "verifiedZipSha256": pin["zipSha256"], "convertedSha256": pin["convertedSha256"]}))


if __name__ == "__main__":
    main()
