"""Authenticate the small existing result; never download/execute Office again."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

from oracle import CONFIG, native, write_json

OUT = Path(".local/wri31-fresh")
REPO = "repos/OpenAEC-Foundation/open-office-studio"
ARTIFACT = 14832170121
SHA = "208d117678dd6dd3b889a8aaa9431a2a926576e35d34726277a40f8043c8c374"


def digest(b):
    return hashlib.sha256(b).hexdigest()


def main():
    assert sys.platform.startswith("linux"), "New Word-process test runs only in Linux CI"
    meta = json.loads(subprocess.check_output(["gh", "api", f"{REPO}/actions/artifacts/{ARTIFACT}"], text=True))
    assert not meta["expired"] and meta["digest"] == "sha256:" + SHA
    assert meta["name"] == "wri31-targeted-result" and meta["workflow_run"]["id"] == 45198852740
    assert meta["workflow_run"]["head_sha"] == "d463a8c30a70e97ebbbf925b56489d6b1bf5cb66"
    run = json.loads(subprocess.check_output(["gh", "api", f"{REPO}/actions/runs/45198852740"], text=True))
    assert run["conclusion"] == "success" and run["run_attempt"] == 1
    b = subprocess.check_output(["gh", "api", f"{REPO}/actions/artifacts/{ARTIFACT}/zip"])
    assert len(b) == 130453 and digest(b) == SHA
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        source = z.read("source.wri")
        assert len(source) == CONFIG["source"]["bytes"] and digest(source) == CONFIG["source"]["sha256"]
        assert hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest() == CONFIG["source"]["blob"]
        oracle = native(source)
        assert oracle == json.loads(z.read("source-oracle.json"))
        engine = json.loads(z.read("engine-report.json"))
        assert engine["application"] == CONFIG["application"]
        assert engine["passed"] and engine["strictSourceAcceptance"] and engine["downstreamEnginePassed"]
        assert not engine["fullFormatAcceptance"]
        verifier = json.loads(z.read("runtime-consumer-verification.json"))
        assert verifier["status"] == "verified" and verifier["sourceCommit"] == CONFIG["application"]["commit"]
        pin = json.loads(Path("scripts/qa-wri31/runtime-input.json").read_text())
        binding = json.loads(z.read("runtime-binding.json"))
        assert binding["application"] == CONFIG["application"] and binding["artifact"] == pin
        converter = json.loads(z.read("converter-report.json"))
        assert converter["profileSha256"] == "847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40"
        assert converter["sourceUnchanged"] and converter["sourceSha256"] == digest(source)
        saved = z.read("saved.docx")
        saved_report = json.loads(z.read("saved-xml-report.json"))
        assert digest(saved) == saved_report["sha256"] == "ed757ba060f5e144056630874c50ad59fc671315db120ec1b22a156bce00a41b"
        assert saved_report["boundedSourceAcceptance"] and not saved_report["mismatches"]
        for notice in CONFIG["source"]["notices"]:
            assert digest(z.read("source-" + notice["path"])) == notice["sha256"]
        # Only fixed known filenames are retained; no arbitrary archive extraction.
        (OUT / "source.wri").write_bytes(source)
        (OUT / "saved.docx").write_bytes(saved)
        write_json(OUT / "source-oracle.json", oracle)
        write_json(OUT / "original-engine-report.json", engine)
        write_json(OUT / "original-runtime-binding.json", binding)
    write_json(OUT / "fresh-input-report.json", {"artifactId": ARTIFACT, "run": 45198852740, "attempt": 1,
        "job": 137776546305, "harness": meta["workflow_run"]["head_sha"], "zipBytes": len(b), "zipSha256": SHA,
        "artifactExpiresAt": meta["expires_at"], "sourceSha256": digest(source), "savedDocxSha256": digest(saved),
        "savedDocxBytes": len(saved), "nativeOracleIndependentlyRederived": True, "newOfficeExecution": False,
        "privateRuntimeRedownloaded": False, "originalRuntimeReceiptsAuthenticatedByResultZip": True})
    print(json.dumps({"artifact": ARTIFACT, "zipVerified": True, "sourceOracleRederived": True, "newOfficeExecution": False}))


if __name__ == "__main__":
    main()
