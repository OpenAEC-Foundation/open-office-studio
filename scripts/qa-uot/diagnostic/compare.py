"""Independent downstream DOCX check, explicitly NOT a UOT import acceptance oracle."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from oracle import CONFIG, read_docx, write_json

p = argparse.ArgumentParser()
p.add_argument("candidate",type=Path)
args = p.parse_args()
out = Path(".local/uot-engine")
baseline = read_docx(out / "input/converted.docx")
source = json.loads((out / "input/source-oracle.json").read_text())
actual = read_docx(args.candidate)
expected = [p["text"] for p in baseline["paragraphs"]]
assert len(expected) == 1
expected[0] = CONFIG["edit"]["text"] + expected[0]
assert [p["text"] for p in actual["paragraphs"]] == expected
assert actual["tables"] == source["tables"] == 0
for src,para in zip(source["paragraphs"],actual["paragraphs"]):
    assert para["outlineLevel"] in (None,"9")
    assert para["lineRule"] == "auto" and para["line"] == src["lineSpacingOOXML"]
write_json(out / (args.candidate.stem + "-independent.json"),{
    "file":str(args.candidate),"sha256":hashlib.sha256(args.candidate.read_bytes()).hexdigest(),
    "baseline":"unchanged converted DOCX, independently parsed; not the UOT source-text oracle",
    "scope":"Downstream edit/save/reopen only","sourceImportAcceptance":False,
    "observed":actual,"downstreamPassed":True})
print(json.dumps({"candidate":str(args.candidate),"downstreamPassed":True,"sourceImportAcceptance":False}))
