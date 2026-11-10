"""Independent stdlib check of the actual workbook downloaded by proef-bladkopie.mjs."""
import hashlib
import json
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile
from urllib.parse import unquote

path = sys.argv[1] if len(sys.argv) > 1 else ".local/proef-bladkopie/copied.xlsx"
with zipfile.ZipFile(path) as z:
    names = set(z.namelist())
    xml = {n: ET.fromstring(z.read(n)) for n in names if n.endswith((".xml", ".rels", ".vml"))}
    local = lambda tag: tag.rsplit("}", 1)[-1]
    nodes = lambda root, tag: [n for n in root.iter() if local(n.tag) == tag]
    relationships = {}
    for name, root in xml.items():
        if not name.endswith(".rels"):
            continue
        owner = "" if name == "_rels/.rels" else posixpath.join(posixpath.dirname(posixpath.dirname(name)), posixpath.basename(name)[:-5])
        rels = list(root)
        assert len({r.attrib["Id"] for r in rels}) == len(rels), name
        relationships[owner] = {}
        for r in rels:
            if r.attrib.get("TargetMode") == "External":
                continue
            target = unquote(r.attrib["Target"].split("#", 1)[0])
            dest = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(posixpath.dirname(owner), target))
            assert dest in names, (name, dest)
            relationships[owner][r.attrib["Id"]] = (dest, r.attrib["Type"])
    types = xml["[Content_Types].xml"]
    defaults = {n.attrib["Extension"] for n in types if local(n.tag) == "Default"}
    overrides = {n.attrib["PartName"].lstrip("/") for n in types if local(n.tag) == "Override"}
    assert overrides <= names, sorted(overrides - names)
    for name in names:
        if name != "[Content_Types].xml" and not name.endswith("/"):
            assert name in overrides or name.rsplit(".", 1)[-1] in defaults, name
    workbook = next(dest for dest, typ in relationships[""].values() if typ.endswith("/officeDocument"))
    sheets = nodes(xml[workbook], "sheet")
    assert [s.attrib["name"] for s in sheets] == ["Copy", "Blad 1"]
    assert len({s.attrib["sheetId"] for s in sheets}) == 2
    sid = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    sheet_paths = [relationships[workbook][s.attrib[sid]][0] for s in sheets]
    cached = []
    for sheet, expected in zip(sheet_paths, ["'Copy'!A1*2", "'Blad 1'!A1*2"]):
        cell = next(c for c in nodes(xml[sheet], "c") if c.attrib.get("r") == "B1")
        assert nodes(cell, "f")[0].text == expected
        cached.append(nodes(cell, "v")[0].text)
    assert cached == ["22", "14"], cached
    charts = [n for n in names if n.endswith(".xml") and "/charts/" in n]
    assert len(charts) == 2
    assert any("'Copy'!$B$3:$B$4" in z.read(c).decode() for c in charts)
    assert any("'Blad 1'!$B$3:$B$4" in z.read(c).decode() for c in charts)
    pictures = [n for n in names if "/media/" in n and n.endswith(".png")]
    assert len(pictures) == 2
    assert len({hashlib.sha256(z.read(p)).hexdigest() for p in pictures}) == 1
    threads = [n for root in xml.values() for n in nodes(root, "threadedComment")]
    assert len(threads) == 2
    assert len({t.attrib["id"] for t in threads}) == 2
    assert len({t.attrib["personId"] for t in threads}) == 1
    assert not any(typ.endswith("/calcChain") for rs in relationships.values() for _, typ in rs.values())
    print(json.dumps({"file": path, "sha256": hashlib.sha256(open(path, "rb").read()).hexdigest(), "xml_parts": len(xml), "sheets": [s.attrib["name"] for s in sheets], "formula_caches": cached, "independent_charts": len(charts), "independent_images": len(pictures), "unique_threads": len(threads), "all_relationship_targets_and_content_types": "valid"}, indent=2))
