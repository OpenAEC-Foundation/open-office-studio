"""Reproduce a bounded DPS source qualification gap; reports only, never a DPS pass.

Downloaded public candidate bytes stay outside the report/artifact directory.
No Office/SDK/converter output or parser library is an oracle here.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import urllib.error
import urllib.parse
import urllib.request

from cfb import cfb_streams

CONFIG = json.loads((Path(__file__).parent / "sources.json").read_text(encoding="utf-8"))
OUT = Path(".local/dps-qa")
INPUTS = Path(".local/dps-source-inputs")  # Deliberately never uploaded/committed.


def sha(b):
    return hashlib.sha256(b).hexdigest()


def api(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "oos-dps-source-qa"}
    token = os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request("https://api.github.com/" + path, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def fetch(candidate, item, name):
    url = "https://raw.githubusercontent.com/{}/{}/{}".format(
        candidate["repository"], candidate["commit"], urllib.parse.quote(item["path"], safe="/"))
    p = INPUTS / name
    if not p.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(2_000_001)
        assert len(data) <= 2_000_000
        INPUTS.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    data = p.read_bytes()
    assert len(data) == item["bytes"] and sha(data) == item["sha256"], name
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == item["blob"], name
    return data


def selected_properties(data):
    """Read only app-property18 and build strings; omit unrelated user metadata."""
    assert struct.unpack_from("<H", data)[0] == 0xfffe
    values = []
    for n in range(struct.unpack_from("<I", data, 24)[0]):
        section = struct.unpack_from("<I", data, 44 + 20 * n)[0]
        for i in range(struct.unpack_from("<I", data, section + 4)[0]):
            pid, offset = struct.unpack_from("<II", data, section + 8 + 8 * i)
            p = section + offset
            kind = struct.unpack_from("<I", data, p)[0]
            if kind not in (30, 31) or not (pid == 18 or n > 0):
                continue
            chars = struct.unpack_from("<I", data, p + 4)[0]
            raw = data[p + 8:p + 8 + chars * (2 if kind == 31 else 1)]
            value = raw.decode("utf-16le" if kind == 31 else "latin1").rstrip("\0")
            if n == 0 and pid == 18 or re.fullmatch(r"\d{4}-\d+(?:\.\d+){3}", value):
                values.append({"section": n, "property": pid, "type": kind, "value": value})
    return values


def describe(data):
    entries, streams = cfb_streams(data)
    assert set(streams) == {"PowerPoint Document", "Current User", "\x05SummaryInformation", "\x05DocumentSummaryInformation"}
    return streams, {"container": "CFB version3", "bytes": len(data), "sha256": sha(data),
                     "streams": [{"name": k, "bytes": len(v), "sha256": sha(v)} for k, v in streams.items()],
                     "selectedProperties": {k: selected_properties(v) for k, v in streams.items() if "SummaryInformation" in k}}


def inventory(item):
    tree = api("repos/{}/git/trees/{}?recursive=1".format(item["repository"], item["commit"]))
    assert tree["truncated"] is False, item["repository"]
    dps = [{k: x[k] for k in ("path", "sha", "size") if k in x}
           for x in tree["tree"] if x["path"].lower().endswith(".dps")]
    license_paths = [x["path"] for x in tree["tree"] if re.search(r"(^|/)(LICENSE|LICENCE|NOTICE)", x["path"], re.I)]
    return {"repository": item["repository"], "commit": item["commit"], "treeSha": tree["sha"],
            "truncated": False, "entryCount": len(tree["tree"]), "dpsFiles": dps, "licenseNoticePaths": license_paths}


def main():
    reports, inventories = [], []
    for candidate in CONFIG["candidates"]:
        c = candidate
        inv = inventory(c)
        assert c["path"] in [x["path"] for x in inv["dpsFiles"]]
        inventories.append(inv)
        data = fetch(c, c, c["id"] + ".dps")
        streams, info = describe(data)
        assert sha(streams["PowerPoint Document"]) == c["expectedPresentationStreamSha256"]
        app = next(x["value"] for x in info["selectedProperties"]["\x05SummaryInformation"] if x["property"] == 18)
        if "expectedApplication" in c:
            assert app == c["expectedApplication"]
        result = {"source": c, "diagnostics": info, "qualifiedFixture": False,
                  "sourceOracle": None, "qualificationGap": c["qualificationGap"]}
        if "license" in c:
            license_bytes = fetch(c, c["license"], c["id"] + "-LICENSE")
            assert (b"Apache License" if c["id"] == "sayi" else b"free and unencumbered") in license_bytes
            result["repositoryLicenseBytesVerified"] = True
        if "control" in c:
            control = fetch(c, c["control"], c["id"] + "-ppt-provenance-control.bin")
            control_streams, control_info = describe(control)
            same = {k: v == control_streams[k] for k, v in streams.items()}
            changed = sum(x != y for x, y in zip(data, control))
            assert len(data) == len(control)
            if c["id"] == "sayi":
                assert same["PowerPoint Document"] and same["Current User"]
                assert not same["\x05SummaryInformation"] and not same["\x05DocumentSummaryInformation"]
                assert changed == 362
            else:
                assert all(not v for v in same.values())
            result["provenanceComparison"] = {"control": control_info, "sameStreams": same, "changedFileBytes": changed,
                "meaning": "Ambiguous producer/native-save provenance; differences/equalities alone do not prove a renamed file or genuine DPS fidelity"}
        if c["id"] == "spire":
            loader = fetch(c, c["loader"], "spire-loader.java")
            readme = fetch(c, c["readme"], "spire-README.md")
            assert b'loadFromFile("data/Sample_dps.dps", FileFormat.DPS)' in loader
            assert b"Temporary License" in readme
            assert not inv["licenseNoticePaths"]
            status = None
            try:
                api("repos/{}/license?ref={}".format(c["repository"], c["commit"]))
            except urllib.error.HTTPError as error:
                status = error.code
            assert status == 404
            result["publisherEvidence"] = {"explicitDpsLoaderVerified": True, "loaderExecuted": False,
                "licenseEndpointStatus": status, "completePinnedTreeLicenseNoticePaths": [],
                "readmeHasTemporarySdkLicenseLink": True, "sampleFileLicenseGrantEstablished": False,
                "interpretation": "SDK temporary-license link is not treated as permission for redistribution of the source example; no license-absence claim beyond reviewed sources"}
        reports.append(result)
    for extra in CONFIG["additionalInventories"]:
        inv = inventory(extra)
        assert sorted(x["path"] for x in inv["dpsFiles"]) == extra.get("expectedDpsPaths", [])
        if extra["repository"] == "eiceblue/Spire.Office-for-Java":
            assert inv["dpsFiles"][0]["sha"] == CONFIG["candidates"][0]["blob"]
            assert not inv["licenseNoticePaths"]
        inventories.append(inv)
    report = {"application": CONFIG["application"], "scope": CONFIG["scope"], "diagnosticsPassed": True,
              "sourceGatePassed": False, "sourceImportAcceptance": False, "fullFormatAcceptance": False,
              "qualifiedFixture": None, "sourceOracle": None, "candidateReports": reports,
              "inventories": inventories, "inventoryCount": len(inventories), "limits": CONFIG["limits"],
              "sharedRuntime": {"pinFile": "scripts/qa-dps/unused-runtime-pin.json", "downloaded": False, "consumed": False, "reverifiedInThisProbe": False},
              "retention": "Reports only; all source/control/license/loader/README bytes stay outside the uploaded artifact directory"}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "source-gate-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"diagnosticsPassed": True, "inventories": len(inventories), "candidates": len(reports), "sourceGatePassed": False}))


if __name__ == "__main__":
    main()
