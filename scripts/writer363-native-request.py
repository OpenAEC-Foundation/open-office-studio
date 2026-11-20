"""Validate one pinned #363 macOS UI-only request before package fetch/launch."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy

SOURCE = "7f126f4b8e5269a54388cf78c48c78d2acc0daa1"
TREE = "8bc608488760e48919d7fb4e72a42569175b52a4"
EXE = "46bf58304108a35d04b1e140a116a7158c38c3e4ddecd9f1e720cd14839cd967"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    args = parser.parse_args()
    raw = args.request.read_bytes()
    expected = os.environ["WRITER363_REQUEST_SHA256"]
    if hashlib.sha256(raw).hexdigest() != expected:
        raise RuntimeError("Pinned request bytes differ")
    request = json.loads(raw)
    if request["issue"] != 363 or request["profile"] != "macos" or request["executionApproved"] is not True:
        raise RuntimeError("Wrong scoped native release")
    if request["languageRoute"] != "native-ui-only" or request["initialLanguage"] != "en" or request["restoreLanguage"] != "en":
        raise RuntimeError("Only ordinary EN/NL/EN native UI is released")
    if request["allowGlobalOsDefaults"] is not False or request["allowLiveLocaleInjection"] is not False:
        raise RuntimeError("OS/global preferences and live locale injection are not released")
    now = datetime.now(timezone.utc)
    cutoff = datetime.fromisoformat(request["launchCutoffUTC"].replace("Z", "+00:00"))
    if now >= cutoff:
        raise RuntimeError("Native start cutoff reached; leave cleanup margin before 15:20 CET")
    root = Path(__file__).resolve().parent.parent
    allowed = {"scripts/proef-writer363-macos.py", "scripts/writer363-macos-ax.swift", "scripts/test_writer363_macos.py"}
    if set(request["files"]) != allowed:
        raise RuntimeError("Unexpected executable/test source list")
    for name, digest in request["files"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError("Released source bytes changed: " + name)
    manifest = request["frozenManifest"]
    if manifest["sourceCommit"] != SOURCE or manifest["sourceTree"] != TREE or manifest["executableSha256"] != EXE:
        raise RuntimeError("Wrong immutable application point")
    validate = runpy.run_path(str(root / "scripts/writer361-native-manifest.py"))["validate"]
    validate(manifest, "macos")
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(canonical).hexdigest()
    if digest != request["frozenManifestSha256"]:
        raise RuntimeError("Native manifest hash differs")
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        output.write("FROZEN_MANIFEST=" + canonical.decode() + "\n")
        output.write("FROZEN_MANIFEST_SHA256=" + digest + "\n")
        output.write("WRITER363_STOP_AT_UTC=" + request["stopAtUTC"] + "\n")
    print(json.dumps({"issue": 363, "source": SOURCE, "tree": TREE, "requestSha256": expected,
                      "manifestSha256": digest, "route": request["languageRoute"], "nativeStarted": False}))


if __name__ == "__main__":
    main()
