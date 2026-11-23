"""Reuse only the exact verified small initial result, not the private runtime."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

from oracle import CONFIG, OUT, source_bytes, write_json

assert sys.platform.startswith("linux")
REPO = "repos/OpenAEC-Foundation/open-office-studio"
ARTIFACT = 14824513431
DIGEST = "11d5ca07b327e446e987e92b0e04f8af2977fa0048999fea66a4e01f5e96a6be"
meta = json.loads(subprocess.check_output(["gh", "api", f"{REPO}/actions/artifacts/{ARTIFACT}"], text=True))
assert meta["workflow_run"]["id"] == 45188793344
assert meta["workflow_run"]["head_sha"] == "7c9692437797ed2cc213dcc97a1597cd39b30e81"
assert meta["name"] == "sdw31-runtime-result" and meta["digest"] == "sha256:" + DIGEST
b = subprocess.check_output(["gh", "api", f"{REPO}/actions/artifacts/{ARTIFACT}/zip"])
assert len(b) == 45586 and hashlib.sha256(b).hexdigest() == DIGEST
archive = Path(".local/sdw31-replay-input.zip")
archive.parent.mkdir(parents=True, exist_ok=True)
archive.write_bytes(b)
assert not OUT.exists()
with zipfile.ZipFile(archive) as z:
    assert sum(e.file_size for e in z.infolist()) < 1_000_000
    for e in z.infolist():
        p = PurePosixPath(e.filename)
        assert not p.is_absolute() and ".." not in p.parts and not (e.external_attr >> 16 & 0o170000) == 0o120000
    z.extractall(OUT)
source_bytes(OUT / "source.sdw")
conversion = json.loads((OUT / "converter-report.json").read_text())
assert conversion["sourceSha256"] == CONFIG["source"]["sha256"]
assert conversion["binding"]["application"] == CONFIG["application"]
assert conversion["binding"]["artifact"]["artifactId"] == 14805600515
assert conversion["profileSha256"] == "847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40"
assert hashlib.sha256((OUT / "converted.docx").read_bytes()).hexdigest() == conversion["outputSha256"]
verification = json.loads((OUT / "runtime-consumer-verification.json").read_text())
assert verification["status"] == "verified" and verification["sourceCommit"] == CONFIG["application"]["commit"]
write_json(OUT / "replay-input-report.json", {"artifactId": ARTIFACT, "run": 45188793344,
    "harness": meta["workflow_run"]["head_sha"], "zipBytes": len(b), "fullZipSha256": DIGEST,
    "convertedSha256": conversion["outputSha256"], "originalSourceVerified": True,
    "method": "Reused actual converter/complete original runtime-verifier receipts from the same exact unchanged P2 product; no new Office execution"})
