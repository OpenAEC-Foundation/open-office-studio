"""Read-only comparison of completed STW runtime inventory and pinned P2 DEB manifest."""
import argparse
import hashlib
import json
from pathlib import Path

DESCRIPTOR_SHA = "1c0e508276b37fbd5b92e55bf113446d7e8522fc1d9e1817bb7722d5b5dd53c6"
INVENTORY_SHA = "075114295018725715fc26e05fc06f88ce4513bb2e328e677e8fed70741fbbd8"
SOURCE = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
DEB_SHA = "23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def compare(source_entries, entries, prefix):
    """Compare every regular-file byte/hash and symbolic-link target; do not infer modes."""
    source = {e["path"]: e for e in source_entries if not e["path"].startswith("meta/")}
    assert len(source) == sum(not e["path"].startswith("meta/") for e in source_entries), "Duplicate original path"
    actual = {}
    metadata = []
    for entry in entries:
        if not entry["path"].startswith(prefix + "/") or entry["type"] == "directory":
            continue
        path = entry["path"][len(prefix) + 1:]
        if path.startswith("meta/"):
            metadata.append(entry)
            continue
        assert path not in actual, "Duplicate package path"
        assert entry["type"] in ("file", "symlink"), entry
        actual[path] = ({"path": path, "link": entry["linkTarget"]} if entry["type"] == "symlink" else
                        {"path": path, "bytes": entry["bytes"], "sha256": entry["sha256"]})
    missing, extra = sorted(source.keys() - actual.keys()), sorted(actual.keys() - source.keys())
    changed = [{"path": p, "tested": source[p], "packaged": actual[p]} for p in sorted(source.keys() & actual.keys()) if source[p] != actual[p]]
    return {"passed": not (missing or extra or changed), "testedEntries": len(source), "packagedEntries": len(actual),
            "missing": missing, "extra": extra, "changed": changed,
            "matchedFiles": sum("sha256" in source[p] for p in source.keys() & actual.keys() if source[p] == actual[p]),
            "matchedSymlinks": sum("link" in source[p] for p in source.keys() & actual.keys() if source[p] == actual[p]),
            "packagedMetadata": metadata,
            "testedMetadata": [e for e in source_entries if e["path"].startswith("meta/")]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("descriptor", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("tested_inventory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--executed-report", required=True, type=Path)
    args = parser.parse_args()
    assert sha(args.descriptor) == DESCRIPTOR_SHA, "Descriptor must match coordinator's immutable Git bytes"
    descriptor = json.loads(args.descriptor.read_bytes())
    assert sha(args.manifest) == descriptor["entryManifest"]["sha256"], "Full manifest pin"
    assert sha(args.tested_inventory) == INVENTORY_SHA, "Actual executed STW runtime inventory pin"
    parent = descriptor["parent"]
    assert (parent["sourceCommit"], parent["sourceTree"], parent["appVersion"]) == (SOURCE, TREE, "2026.48.1")
    assert parent["deb"]["sha256"] == DEB_SHA
    assert parent["jobConclusion"] == "success" and descriptor["qaRun"] == 45147346793
    entries = json.loads(args.manifest.read_bytes())
    assert len(entries) == descriptor["entryManifest"]["entries"] == 15082
    assert len({e["path"] for e in entries}) == len(entries)
    original = json.loads(args.tested_inventory.read_bytes())
    assert len(original) == 13949
    assert sha(args.executed_report) == "9a865867b33f2292a01e63ba5f0954dc21917d26870abd95c90f399161601ed8"
    executed = json.loads(args.executed_report.read_bytes())
    assert (executed["applicationCommit"], executed["applicationTree"]) == (SOURCE, TREE)
    tested_receipt = executed["runtime"]["receipt"]
    packaged_receipt = descriptor["runtimeReceipt"]
    assert {k: v for k, v in tested_receipt.items() if k != "preparedMs"} == {k: v for k, v in packaged_receipt.items() if k != "preparedMs"}
    result = compare(original, entries, descriptor["privateRuntimePath"])
    by_path = {e["path"]: e for e in entries}
    assert by_path[descriptor["canonicalConverterPath"]]["sha256"] == descriptor["converterLauncherSha256"]
    assert by_path[descriptor["converterElfPath"]]["sha256"] == descriptor["converterElfMetadata"]["sha256"]
    assert by_path[descriptor["canonicalConverterPath"]]["mode"] in ("0755", "0775")
    assert by_path[descriptor["converterElfPath"]]["mode"] in ("0755", "0775")
    receipt_entries = [e for e in entries if e["path"].endswith("/meta/receipt.json")]
    assert receipt_entries and all(e["sha256"] == descriptor["runtimeReceiptSha256"] for e in receipt_entries)
    metadata_by_name = {e["path"].split("/meta/")[-1]: e for e in result["packagedMetadata"]}
    for entry in result["testedMetadata"]:
        name = entry["path"].removeprefix("meta/")
        if name != "receipt.json":
            assert (entry["bytes"], entry["sha256"]) == (metadata_by_name[name]["bytes"], metadata_by_name[name]["sha256"])
    result.update(applicationCommit=SOURCE, applicationTree=TREE, version="2026.48.1", parent=parent,
                  descriptorSha256=DESCRIPTOR_SHA, manifestSha256=sha(args.manifest), testedInventorySha256=INVENTORY_SHA,
                  runtimeReceipt=descriptor["runtimeReceipt"], launcherSha256=descriptor["converterLauncherSha256"],
                  receiptDifference={"onlyChangedField": "preparedMs", "testedPreparedMs": tested_receipt["preparedMs"], "packagedPreparedMs": packaged_receipt["preparedMs"], "otherReceiptFieldsEqual": True, "sourceNoticeAndKeepEqual": True},
                  converterElf=descriptor["converterElfMetadata"],
                  limits=["Comparison reuses immutable manifest from shared verified producer; no runtime ZIP downloaded or extracted here",
                          "All recorded runtime payload file bytes/hashes and link targets compared; original execution inventory did not record permission modes",
                          "Packaged permissions/links and tar roundtrip verified by shared producer; not a new execution proof",
                          "Generated meta/receipt and notices are explicit metadata, not silently equalized",
                          "No converter/engine rerun or native UI/IPC/installer/browser acceptance"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("passed", "testedEntries", "packagedEntries", "matchedFiles", "matchedSymlinks", "missing", "extra")}, ensure_ascii=False))
    assert result["passed"], f"Runtime binding differs; inspect {args.output}"


if __name__ == "__main__":
    main()
