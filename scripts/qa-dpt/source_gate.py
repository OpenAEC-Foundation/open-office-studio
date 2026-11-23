"""Independent static DPT candidate diagnostics, not a qualified import pass.

Public input downloads stay outside the report/artifact directory. No Office,
SDK, binary parser library or product engine is used to derive diagnostics.
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
OUT = Path(".local/dpt-qa")
INPUTS = Path(".local/dpt-source-inputs")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def api(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "oos-dpt-source-qa"}
    if os.environ.get("GH_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    with urllib.request.urlopen(urllib.request.Request("https://api.github.com/" + path, headers=headers), timeout=45) as response:
        return json.load(response)


def fetch(item, name):
    candidate = CONFIG["candidate"]
    url = "https://raw.githubusercontent.com/{}/{}/{}".format(
        candidate["repository"], candidate["commit"], urllib.parse.quote(item["path"], safe="/"))
    path = INPUTS / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(2_000_001)
        assert len(data) <= 2_000_000
        INPUTS.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    data = path.read_bytes()
    assert len(data) == item["bytes"] and sha(data) == item["sha256"], name
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == item["blob"], name
    return data


def selected_properties(data):
    """Only app-property18/build strings; no unrelated author/user identifiers."""
    assert struct.unpack_from("<H", data)[0] == 0xfffe
    values = []
    for section_index in range(struct.unpack_from("<I", data, 24)[0]):
        section = struct.unpack_from("<I", data, 44 + 20 * section_index)[0]
        for i in range(struct.unpack_from("<I", data, section + 4)[0]):
            pid, offset = struct.unpack_from("<II", data, section + 8 + 8 * i)
            p = section + offset
            kind = struct.unpack_from("<I", data, p)[0]
            if kind not in (30, 31) or not (pid == 18 or section_index > 0):
                continue
            chars = struct.unpack_from("<I", data, p + 4)[0]
            value = data[p + 8:p + 8 + chars * (2 if kind == 31 else 1)].decode("utf-16le" if kind == 31 else "latin1").rstrip("\0")
            if section_index == 0 and pid == 18 or re.fullmatch(r"\d{4}-\d+(?:\.\d+){3}", value):
                values.append({"section": section_index, "property": pid, "type": kind, "value": value})
    return values


def main():
    c = CONFIG["candidate"]
    data = fetch(c, "unqualified-source.dpt")
    _, streams = cfb_streams(data)
    assert set(streams) == {"PowerPoint Document", "Current User", "\x05SummaryInformation", "\x05DocumentSummaryInformation"}
    assert sha(streams["PowerPoint Document"]) == c["expectedPresentationStreamSha256"]
    props = {k: selected_properties(v) for k, v in streams.items() if "SummaryInformation" in k}
    assert any(p["property"] == 18 and p["value"] == c["expectedApplication"] for p in props["\x05SummaryInformation"])
    assert any(p["value"] == c["expectedBuild"] for p in props["\x05DocumentSummaryInformation"])
    loader = fetch(c["loader"], "publisher-loader.java")
    assert b'loadFromFile("data/Sample_dpt.dpt", FileFormat.DPT)' in loader
    readme = fetch(c["readme"], "publisher-README.md")
    assert b"Temporary License" in readme
    inventories = []
    for item in CONFIG["inventories"]:
        tree = api("repos/{}/git/trees/{}?recursive=1".format(item["repository"], item.get("tree", item["commit"])))
        assert tree["truncated"] is False
        files = [{k: x[k] for k in ("path", "sha", "size") if k in x} for x in tree["tree"] if x["path"].lower().endswith(".dpt")]
        assert sorted(x["path"] for x in files) == item["expectedDptPaths"]
        licenses = [x["path"] for x in tree["tree"] if re.search(r"(^|/)(LICENSE|LICENCE|NOTICE)", x["path"], re.I)]
        if item["repository"] in (c["repository"], "eiceblue/Spire.Office-for-Java"):
            assert len(files) == 1 and files[0]["sha"] == c["blob"]
            assert not licenses
        inventories.append({**item, "treeSha": tree["sha"], "truncated": False, "entries": len(tree["tree"]),
                            "dptFiles": files, "licenseNoticePaths": licenses})
    status = None
    try:
        api("repos/{}/license?ref={}".format(c["repository"], c["commit"]))
    except urllib.error.HTTPError as error:
        status = error.code
    assert status == 404
    report = {"application": CONFIG["application"], "scope": CONFIG["scope"], "candidate": c,
              "diagnosticsPassed": True, "sourceGatePassed": False, "sourceImportAcceptance": False, "fullFormatAcceptance": False,
              "qualifiedFixture": None, "sourceOracle": None, "inventories": inventories, "inventoryCount": len(inventories),
              "independentByteDiagnostics": {"container": "CFB version3", "streams": [
                  {"name": name, "bytes": len(value), "sha256": sha(value)} for name, value in streams.items()],
                  "selectedProperties": props, "nativeTemplateFieldsDecoded": False, "orderedLiveSlideOracleDerived": False},
              "publisherEvidence": {"explicitDptLoaderVerified": True, "loaderExecuted": False, "licenseEndpointStatus": status,
                  "readmeHasTemporarySdkLicenseLink": True, "applicableSampleLicenseGrantEstablished": False,
                  "boundary": "Pinned complete tree/README/license endpoint reviewed; no claim of worldwide absence or automatic SDK-license coverage of sample bytes"},
              "sharedRuntime": {"pin": "scripts/qa-dpt/unused-runtime-pin.json", "downloaded": False, "consumed": False, "reverified": False},
              "retention": "JSON reports only. Candidate, README and loader bytes stay outside artifact/Git delivery.", "limits": CONFIG["limits"]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "source-gate-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"diagnosticsPassed": True, "inventories": len(inventories), "sourceGatePassed": False}))


if __name__ == "__main__":
    main()
