"""Lees werkelijk bewaarde lijsten onafhankelijk terug, zonder de Rust-engine."""
from pathlib import Path
from zipfile import ZipFile
import re
import sys
import xml.etree.ElementTree as ET
from docx import Document

map = Path(sys.argv[1])
w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
with ZipFile(Path(__file__).with_name("writer-structuur.docx")) as z:
    oorspronkelijke_nummering = z.read("word/numbering.xml")

for naam, teksten in [
    ("writer-lijsten-direct.docx", ["Links 🏠 café rechts", "Tweede 🏠"]),
    ("writer-lijsten-lint.docx", ["Links 🏠 9café rechts"]),
]:
    d = Document(map / naam)
    assert len(d.sections) == 2 and len(d.tables) == 1
    assert d.sections[0].header.paragraphs[0].text == "Vaste koptekst"
    assert d.sections[0].footer.paragraphs[0].text == "Vaste voettekst"
    assert d.tables[0].cell(0, 0).text == "Cel één\nTweede celalinea"
    assert d.tables[0].cell(0, 1).text == "Cel twee"
    gekozen = [next(p for p in d.paragraphs if p.text == t) for t in teksten]
    assert any(r.bold for r in gekozen[0].runs if "Links" in r.text)
    assert all(r.italic for r in gekozen[0].runs if "café rechts" in r.text)
    nummers = [p._p.find(w + "pPr/" + w + "numPr/" + w + "numId").get(w + "val") for p in gekozen]
    assert len(set(nummers)) == 1 and int(nummers[0]) > 0
    with ZipFile(map / naam) as z:
        nummering = z.read("word/numbering.xml")
        root = ET.fromstring(nummering)
        instantie = next(n for n in root.findall(w + "num") if n.get(w + "numId") == nummers[0])
        abstract_id = instantie.find(w + "abstractNumId").get(w + "val")
        abstract = next(n for n in root.findall(w + "abstractNum") if n.get(w + "abstractNumId") == abstract_id)
        assert abstract.find(w + "multiLevelType").get(w + "val") == "singleLevel"
        assert abstract.find(w + "name").get(w + "val") == "OpenAEC-Nummering"
        niveaus = abstract.findall(w + "lvl")
        assert len(niveaus) == 1
        niveau = niveaus[0]
        assert niveau.get(w + "ilvl") == "0"
        for veld, waarde in [("start", "1"), ("numFmt", "decimal"), ("lvlText", "%1."), ("suff", "tab")]:
            assert niveau.find(w + veld).get(w + "val") == waarde
        inspringing = niveau.find(w + "pPr/" + w + "ind")
        assert inspringing.get(w + "left") == "720" and inspringing.get(w + "hanging") == "360"
        over = nummering
        for tag, attribuut, id in [("abstractNum", "abstractNumId", abstract_id), ("num", "numId", nummers[0])]:
            patroon = rb'(?s)<w:' + tag.encode() + rb'\b[^>]*\bw:' + attribuut.encode() + rb'="' + id.encode() + rb'"[^>]*(?:/>|>.*?</w:' + tag.encode() + rb'>)'
            assert len(re.findall(patroon, over)) == 1
            over = re.sub(patroon, b"", over)
        assert over == oorspronkelijke_nummering
    print(f"{naam}: nummering, bronbehoud, Unicode, directe runopmaak, secties, kop/voet en tabel onafhankelijk goedgekeurd.")
