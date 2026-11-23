"""Apply the explicit #373 decision to unchanged existing Linux CI evidence."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import runpy
import zipfile

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def rounded(value):
    return (2 * value.numerator + value.denominator) // (2 * value.denominator)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    qa = Path(__file__).resolve().parent
    policy_raw = (qa / "precision-policy-373.json").read_bytes()
    policy = json.loads(policy_raw)
    assert policy["issue"] == 373 and policy["productCorrectionRequiredInP2"] is False
    assert policy["runtimeArtifactId"] == 14805600515
    assert sha(args.archive.read_bytes()) == "1aee8094531713c01d3621fb5b1bce44eb00e0a0f54faa165a61ffe4bdeb9d76"
    files = ["prs-strategy.sti", "source-oracle.json", "tests.json", "engine-report.json",
        "runtime-binding-evidence.json", "converted/prs-strategy.pptx", "edited.pptx", "reopened.pptx",
        "converted-oracle-check.json", "edited-oracle-check.json", "reopened-oracle-check.json"]
    with zipfile.ZipFile(args.archive) as z:
        for file in files:
            assert (args.evidence / file).read_bytes() == z.read(file)
    source = (args.evidence / "prs-strategy.sti").read_bytes()
    assert sha(source) == policy["fixtureSha256"]
    oracle_raw = (args.evidence / "source-oracle.json").read_bytes()
    oracle = runpy.run_path(str(qa / "fixture.py"))["build_oracle"](source)
    canonical = (json.dumps(oracle, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode()
    assert oracle_raw == canonical
    assert sha(oracle_raw) == "d71dd3db4ffa28cdd9b94e3705ed9357226caf61119d6f8697b3426784d1522a"
    expected = {}
    for axis, key in [("widthEmu", "width"), ("heightEmu", "height")]:
        mm100 = Fraction(oracle["pageSize"][key].removesuffix("cm")) * 1000
        master = rounded(mm100 * Fraction(576, 2540))
        expected[axis] = rounded(master * Fraction(914400, 576))
    binding = json.loads((args.evidence / "runtime-binding-evidence.json").read_bytes())
    assert binding["artifact"]["id"] == policy["runtimeArtifactId"]
    assert binding["verification"]["sourceCommit"] == policy["applicationCommit"]
    assert binding["verification"]["tarSha256"] == policy["runtimeTarSha256"]
    checker = runpy.run_path(str(qa / "check_pptx.py"))["verify"]
    checks = []
    for file, edited in [("converted/prs-strategy.pptx", False), ("edited.pptx", True), ("reopened.pptx", True)]:
        check = checker(args.evidence / file, oracle, edited)
        assert check["pass"] is False and check["pageSizeExact"] is False
        assert check["allSourceParagraphsPreserved"] and check["sourceParagraphsVerified"] == 24
        assert len(check["slides"]) == 7 and check["actualPageSize"] == expected
        checks.append({"file": file, "sha256": check["sha256"], "sourceSlides": 7,
            "sourceParagraphs": 24, "intentionalTitleEdit": edited, "actualDimensions": check["actualPageSize"],
            "sourcePredictedDimensionsMatchExactly": True, "strictExactSourceDimensionsPreserved": False})
    historical = json.loads((args.evidence / "tests.json").read_bytes())
    assert historical["success"] is False and historical["numPassedTests"] == 3
    assert historical["numFailedTests"] == 1 and historical["numPendingTests"] == 0
    engine = json.loads((args.evidence / "engine-report.json").read_bytes())
    assert engine["engine"]["editSavedAndReopened"] and engine["engine"]["convertedSizePreservedAfterEditAndReopen"]
    assert engine["engine"]["exactSourcePageSizePreserved"] is False
    result = {"issue": 373, "status": "conformant to separately approved case-specific export precision",
        "policySha256": sha(policy_raw), "decisionAuthority": policy["decisionAuthority"],
        "applicationCommit": policy["applicationCommit"], "runtimeArtifactId": policy["runtimeArtifactId"],
        "sourceFixtureSha256": sha(source), "sourceOracleSha256": sha(oracle_raw),
        "originalQaRun": 45149020419, "originalHarnessCommit": engine["harnessCommit"],
        "originalResultArtifactId": 14805567220,
        "originalResultZipSha256": sha(args.archive.read_bytes()),
        "sourceExactDimensions": oracle["pageSize"], "sourcePredictedExportDimensions": expected,
        "sourceBitExactSizePreserved": False, "engineAddsDimensionDrift": False,
        "files": checks, "historicalStrictRunStillFailed": True,
        "historicalTests": {"passed": 3, "failed": 1, "skipped": 0},
        "newRuntimeEngineOrGuiRun": False, "visualImpact": policy["visualImpact"],
        "scope": policy["scope"], "qualification": policy["qualification"]}
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "sourceBitExactSizePreserved": False,
        "historicalStrictRunStillFailed": True, "sourcePrediction": expected,
        "slidesAndParagraphsPreserved": "7/24", "newRuntimeRun": False}))

if __name__ == "__main__":
    main()
