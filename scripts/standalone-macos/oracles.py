"""Independent exported-file oracles. Never edit the file under test."""
from pathlib import Path
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
from contextlib import closing
import json
import sqlite3
import xml.etree.ElementTree as ET
import zipfile
from fixtures import SEEDS, MARKERS, CONTROL, WRITER_ANCHOR, WRITER_OPENING, WRITER_VISIBLE_EDIT, WRITER_PAYLOAD

W = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
X = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
A = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def contains_once(text, expected):
    if text.count(expected) != 1:
        raise AssertionError("Expected exactly one preserved marker: " + expected)


def verify(app, path, edited=True):
    path = Path(path)
    result = {"app": app, "path": str(path), "method": "Independent stdlib file parsing; no editor/model API"}
    if app == "writer":
        with zipfile.ZipFile(path) as bundle:
            root = ET.fromstring(bundle.read("word/document.xml"))
        text = "\n".join("".join(p.itertext()) for p in root.findall(".//w:p", W))
        contains_once(text, SEEDS[app]); contains_once(text, CONTROL)
        if edited:
            contains_once(text, MARKERS[app]); contains_once(text, WRITER_VISIBLE_EDIT)
            contains_once(text, WRITER_PAYLOAD)
            restored=text.replace(WRITER_PAYLOAD,"",1).strip()
            assert restored==WRITER_OPENING+WRITER_ANCHOR+" "+SEEDS[app]+" "+CONTROL, "Native insertion lost or changed original document text"
            result["allOriginalTextPreservedAfterRemovingOneInsertedPayload"]=True
        else:contains_once(text, WRITER_ANCHOR)
        result["text"] = text
    elif app == "spreadsheet":
        with zipfile.ZipFile(path) as bundle:
            root = ET.fromstring(bundle.read("xl/worksheets/sheet1.xml"))
            strings = []
            if "xl/sharedStrings.xml" in bundle.namelist():
                strings = ["".join(n.itertext()) for n in ET.fromstring(bundle.read("xl/sharedStrings.xml")).findall("x:si", X)]
        cells = {}
        for c in root.findall(".//x:c", X):
            value = c.findtext("x:v", default="", namespaces=X)
            if c.get("t") == "s": value = strings[int(value)]
            elif c.get("t") == "inlineStr": value = "".join(c.find("x:is", X).itertext())
            cells[c.get("r")] = {"value": value, "formula": c.findtext("x:f", namespaces=X)}
        assert cells["A1"]["value"] == SEEDS[app] and cells["A3"]["value"] == CONTROL
        assert float(cells["B2"]["value"]) == (42 if edited else 2)
        assert cells["C2"]["formula"] == "SUM(B2,1)"
        assert float(cells["C2"]["value"]) == (43 if edited else 3)
        result["cells"] = cells
    elif app == "presentation":
        with zipfile.ZipFile(path) as bundle:
            slides = [n for n in bundle.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
            assert slides == ["ppt/slides/slide1.xml"]
            root = ET.fromstring(bundle.read(slides[0]))
        text = "\n".join(n.text or "" for n in root.findall(".//a:t", A))
        contains_once(text, SEEDS[app]); contains_once(text, CONTROL)
        if edited: contains_once(text, MARKERS[app])
        result["text"] = text
    elif app == "email":
        message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
        addresses = getaddresses([str(message["From"]), str(message["To"])])
        assert len(addresses) == 2 and all(address.endswith("@example.invalid") for _, address in addresses)
        body = message.get_body(preferencelist=("plain",)) if message.is_multipart() else message
        text = body.get_content()
        contains_once(text, SEEDS[app]); contains_once(text, CONTROL)
        if edited: contains_once(text, MARKERS[app])
        assert SEEDS[app] in str(message["Subject"])
        result.update(subject=str(message["Subject"]), body=text)
    elif app == "notition":
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["formaat"] == "openaec-notities" and data["versie"] == 3
        books = [b for b in data["boeken"] if b["naam"] == "Standalone QA"]
        assert len(books) == 1
        pages = [p for s in books[0]["secties"] for p in s["paginas"]]
        assert len(pages) == 1
        text = pages[0]["markdown"]
        contains_once(text, SEEDS[app]); contains_once(text, CONTROL)
        if edited: contains_once(text, MARKERS[app])
        result["page"] = pages[0]
    elif app == "database":
        with closing(sqlite3.connect(path.resolve().as_uri()+"?mode=ro", uri=True)) as database:
            rows = database.execute("SELECT id,label,amount FROM standalone_data ORDER BY id").fetchall()
        assert rows == [(1, SEEDS[app], 10), (2, "beta", 20), (3, CONTROL, 30)]
        result["rows"] = rows
    else:
        raise ValueError("Unknown standalone app")
    result["passed"] = True
    result["nativeAcceptance"] = False
    return result
