"""Offline replay of new source proof and exact historical-report reuse.

No network, converter, native app, browser, engine/WASM or CI is started.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from native import inspect_source, negative_controls

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name("fixture.json")
PROOF = ROOT / "docs/tests/wps6-2026-11-24"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def git_blob(b):
    return hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()


def analyse():
    f = json.loads(FIXTURE.read_text(encoding="utf-8"))
    s = f["source"]
    source = (PROOF / "source.wps").read_bytes()
    assert len(source) == s["bytes"] and sha(source) == s["sha256"]
    assert git_blob(source) == s["gitSha"]
    for notice in f["notices"]:
        b = (PROOF / "source-notices" / notice["path"]).read_bytes()
        assert len(b) == notice["bytes"] and sha(b) == notice["sha256"]
        assert git_blob(b) == notice["blob"]
    helper = Path(__file__).with_name("cfb.py").read_bytes()
    # Git may materialize .py as CRLF on Windows; only normalize line endings.
    helper = helper.replace(b"\r\n", b"\n")
    assert sha(helper) == f["readerReuse"]["sha256"]
    assert git_blob(helper) == f["readerReuse"]["blob"]
    for p, binding in f["p2Bindings"].items():
        b = subprocess.check_output(["git", "cat-file", "blob", binding["blob"]], cwd=ROOT)
        assert sha(b) == binding["sha256"] and len(b) == binding["bytes"]
        observed = subprocess.check_output(["git", "rev-parse", f["application"]["commit"] + ":" + p], cwd=ROOT, text=True).strip()
        assert observed == binding["blob"]
    assert subprocess.check_output(["git", "rev-parse", f["application"]["commit"] + "^{tree}"], cwd=ROOT, text=True).strip() == f["application"]["tree"]
    old = (PROOF / "retained/historical-windows-report.json").read_bytes()
    old_binding = f["p2Bindings"]["docs/tests/formatendekking/resultaat-windows.json"]
    assert sha(old) == old_binding["sha256"] and git_blob(old) == old_binding["blob"]
    historical = json.loads(old)
    row = next(x for x in historical["results"] if x["id"] == s["id"])
    assert row["passed"] and row["emptyConversionWarning"] and row["outcome"] == "opened-saved-reopened"
    profile = f["p2Bindings"]["src-tauri/src/conversieprofiel.xcu"]["sha256"]
    assert historical["profileSha256"] != profile
    native, content = inspect_source(source)
    return {
        "scope": "#30 / Microsoft Works6 / lo-wps-1 only",
        "application": f["application"], "source": s,
        "sourceInventory": native, "oracleControls": negative_controls(content),
        "historicalTechnicalRoute": {
            "reuseOnly": True, "reportBinding": old_binding,
            "reportIntroducedBy": f["historicalReportIntroducedBy"],
            "date": historical["date"], "platform": historical["platform"],
            "converter": historical["converter"], "profileSha256": historical["profileSha256"],
            "editSha256": historical["editSha256"], "layoutSha256": historical["layoutSha256"],
            "result": row, "rawSavedPackageRetainedHere": False,
            "limitation": "Recorded Windows technical open/save/new-session reopen and warning only; no edit/Undo/Redo or fresh-process/content/visual proof. Original saved package not independently rechecked here."
        },
        "profileEquivalence": False,
        "p2SafeProfileSha256": profile,
        "staticPolicyReview": {
            "level": "Read-only source review; no TS execution, browser UI, native app or converter invoked",
            "wpsInputModule": "docx (src/formaten.json)",
            "openRoute": "No WPS text-import branch; fallback viaRuntime calls hulp.converteer(bytes, ext, soort, soort)",
            "browserBoundary": "src/formaten.ts converteer throws needsDesktop without window.__TAURI_INTERNALS__",
            "emptyWarning": "openen.ts adds empty-conversion when conversieZonderInhoud sees no text/media/objects/tables/etc.; conservative warning, not a source-loss diagnosis",
            "recommendedSave": "WPS has no same-format output entry; normal document result uses docx with no exportFormaat override"
        },
        "newPrivateLinuxRuntimeTested": False,
        "newProductionHelperOrEngineExecuted": False,
        "newBrowserUiTested": False, "nativePlatformTests": [],
        "newJobs": [], "newLargeDownloads": [],
        "disposition": "SOURCE-GAP; reuse historical limited technical PASS; no full acceptance",
        "fullFormatAccepted": False,
        "remaining": [
            "No independent nonempty text oracle from the assigned fixture; no new or synthetic fixture authorized.",
            "Unique Works6 producer/version not established by shared CHNKWKS marker.",
            "Undecoded STRS/style/font/frame/printer/control/rendering/macros remain outside acceptance.",
            "P2 private-runtime edit/UndoRedo/save/fresh-process checks are unrun; cannot fill missing nonempty source witness.",
            "Windows/Linux/macOS/browser functional equivalence and native/visual operation unproven."
        ]
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--write", action="store_true")
    args = p.parse_args()
    result = analyse()
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    target = PROOF / "result.json"
    if args.write:
        target.write_text(output, encoding="utf-8", newline="\n")
    else:
        assert json.loads(target.read_text(encoding="utf-8")) == result
    print(json.dumps({"nativeTextHex": result["sourceInventory"]["text"]["hex"],
                      "oracleControls": len(result["oracleControls"]),
                      "historicalTechnicalPassReused": True,
                      "newRuntimeJobs": 0, "fullFormatAccepted": False}))
