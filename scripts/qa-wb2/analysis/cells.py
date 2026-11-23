"""Downstream cell/formula checks with a separately reported strict name mismatch."""
import argparse
from decimal import Decimal
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from oracle import CONFIG, read_xlsx, sha, verify_xlsx, write_json


def main():
    p = argparse.ArgumentParser()
    p.add_argument("xlsx")
    p.add_argument("--edited", action="store_true")
    args = p.parse_args()
    out = Path(".local/wb2-qa")
    oracle = json.loads((out / "source-oracle.json").read_text())
    actual = read_xlsx(args.xlsx)
    assert len(actual) == 1
    expected_name = oracle["sheets"][0]["name"]
    names = [s["name"] for s in actual]
    name_match = names == [expected_name]
    strict_failure = None
    try:
        verify_xlsx(oracle, args.xlsx, args.edited)
    except AssertionError as e:
        assert not name_match, "Unexpected strict failure beyond known naming mismatch"
        strict_failure = {"type": type(e).__name__, "expectedNames": [expected_name], "actualNames": names}
    expected = {a: dict(c) for a, c in oracle["sheets"][0]["cells"].items()}
    edit = CONFIG["edit"]
    if args.edited:
        expected[edit["cell"]]["value"] = edit["value"]
        expected[edit["formulaCell"]]["value"] = oracle["expected"]["after"]
        expected[edit["textCell"]]["value"] = edit["textValue"]
    result = actual[0]["cells"]
    assert set(result) == set(expected), "Populated addresses changed"
    for a, c in expected.items():
        got = result[a]
        assert got["formula"] == c.get("formula"), (a, "formula", c.get("formula"), got)
        if c["kind"] == "number":
            assert got["kind"] == "n" and Decimal(got["value"]) == Decimal(c["value"]), (a, c, got)
        else:
            assert got["kind"] in ("s", "inlineStr", "str") and got["value"] == c["value"], (a, c, got)
    report = {"file": args.xlsx, "sha256": sha(Path(args.xlsx).read_bytes()), "sheetNames": names,
              "sourceNativeDefaultName": expected_name, "sourceHasExplicitNameRecord": False,
              "strictDefaultNameMatch": name_match, "strictFailure": strict_failure,
              "strictSourceImportAcceptance": name_match, "fullFormatAcceptance": False,
              "checkedPopulatedCells": len(expected), "checkedOriginalFormulas": 10,
              "downstreamCellFormulaPassed": True, "edited": args.edited,
              "limit": "Native default A inferred from independent implementation, not a literal serialized source name; mismatch retained, no naming bug asserted without normative/original naming evidence"}
    write_json(out / (Path(args.xlsx).stem + "-cells-diagnostic.json"), report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
