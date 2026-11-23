"""Independent legacy STW source oracle and OOXML content audit; never runs an office app."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

SOURCE_SHA256 = "5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2"
SOURCE_BLOB = "5b8efafa159bac197fdab0b48a6dfaf8a11a6478"
SOURCE_COMMIT = "ded596096a767fa470eea8dfccd51c1af5c3dd54"
SOURCE_PATH = "qadevOOo/testdocs/report.stw"
NS = {"o": "http://openoffice.org/2000/office", "t": "http://openoffice.org/2000/text",
      "s": "http://openoffice.org/2000/style", "f": "http://www.w3.org/1999/XSL/Format",
      "table": "http://openoffice.org/2000/table",
      "m": "http://openoffice.org/2001/manifest", "meta": "http://openoffice.org/2000/meta",
      "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def q(prefix, local):
    return "{" + NS[prefix] + "}" + local


def normalize(text):
    return " ".join(text.split())


def legacy_text(element, semantic_placeholders=False):
    out = element.text or ""
    for child in element:
        if child.tag == q("t", "s"):
            out += " " * int(child.get(q("t", "c"), "1"))
        elif child.tag == q("t", "tab-stop"):
            out += "\t"
        elif child.tag == q("t", "line-break"):
            out += "\n"
        elif child.tag == q("t", "placeholder") and semantic_placeholders:
            display = legacy_text(child)
            assert display.startswith("<") and display.endswith(">"), "Expected old jump-edit field display markers"
            out += display[1:-1]
        else:
            out += legacy_text(child, semantic_placeholders)
        out += child.tail or ""
    return out


def source_oracle(path):
    data = Path(path).read_bytes()
    assert hashlib.sha256(data).hexdigest() == SOURCE_SHA256, "Wrong immutable source bytes"
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == SOURCE_BLOB
    assert data.startswith(b"PK\x03\x04"), "A renamed HTML/ODT is not the legacy fixture"
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert "mimetype" not in archive.namelist(), "Keep the original early StarOffice container"
        content = ET.fromstring(archive.read("content.xml"))
        styles_root = ET.fromstring(archive.read("styles.xml"))
        meta = ET.fromstring(archive.read("meta.xml"))
        manifest = ET.fromstring(archive.read("META-INF/manifest.xml"))
        assert content.tag == q("o", "document-content")
        assert content.get(q("o", "version")) == "1.0"
        media = next(e.get(q("m", "media-type")) for e in manifest if e.get(q("m", "full-path")) == "/")
        assert media == "application/vnd.sun.xml.writer"
        generator = meta.find(".//meta:generator", NS).text
        assert generator == "StarOffice 6.0 (Win32)"
        styles, defaults = {}, {}
        for root in (styles_root, content):
            for element in root.iter(q("s", "default-style")):
                if element.get(q("s", "family")) == "paragraph":
                    for prop in element.findall("s:properties", NS):
                        defaults.update(prop.attrib)
            for element in root.iter(q("s", "style")):
                styles[element.get(q("s", "name"))] = element

        def effective(name, seen=()):
            assert name not in seen, "Cyclic source style"
            element = styles.get(name)
            if element is None:
                return dict(defaults)
            parent = element.get(q("s", "parent-style-name"))
            result = effective(parent, (*seen, name)) if parent else dict(defaults)
            for prop in element.findall("s:properties", NS):
                result.update(prop.attrib)
            return result

        body = content.find("o:body", NS)
        paragraphs = []
        parents = {child: parent for parent in body.iter() for child in parent}
        for element in body.iter():
            if element.tag not in (q("t", "p"), q("t", "h")):
                continue
            display_text = normalize(legacy_text(element))
            text = normalize(legacy_text(element, semantic_placeholders=True))
            if not text:
                continue
            name = element.get(q("t", "style-name"))
            props = effective(name)
            size = props.get(q("f", "font-size"))
            assert size and size.endswith("pt"), "This oracle expects the source's absolute point sizes"
            parent = parents.get(element)
            in_index = False
            while parent is not None:
                in_index |= parent.tag == q("t", "table-of-content")
                parent = parents.get(parent)
            index_row = bool(in_index and re.search(r"\s\d+$", text))
            placeholders = [{"type": e.get(q("t", "placeholder-type")),
                             "prompt": normalize(legacy_text(e))[1:-1],
                             "description": e.get(q("t", "description"))}
                            for e in element.iter(q("t", "placeholder"))]
            paragraphs.append({"text": text, "sourceDisplayText": display_text, "placeholders": placeholders, "sourceStyle": name,
                               "headingLevel": int(element.get(q("t", "level"))) if element.tag == q("t", "h") else None,
                               "dynamicIndexCache": index_row,
                               "stableText": re.sub(r"\s\d+$", "", text) if index_row else text,
                               "properties": {"sizePt": float(size[:-2]),
                                              "bold": props.get(q("f", "font-weight"), "normal") == "bold",
                                              "alignment": props.get(q("f", "text-align"), "left"),
                                              "caps": props.get(q("f", "text-transform")) == "uppercase",
                                              "smallCaps": props.get(q("f", "font-variant")) == "small-caps"}})
        tables = list(body.iter(q("table", "table")))
        assert len(paragraphs) == 8 and len(tables) == 0
        return {"source": {"repo": "LibreOffice/core", "commit": SOURCE_COMMIT, "path": SOURCE_PATH,
                           "gitBlob": SOURCE_BLOB, "bytes": len(data), "sha256": SOURCE_SHA256},
                "container": {"kind": "OpenOffice.org XML 1.0 ZIP", "generator": generator,
                              "manifestMediaType": media, "mimetypeEntryPresent": False,
                              "templateProvenance": "Original .stw since 2003; upstream _XDocumentTemplates.addTemplate uses report.stw"},
                "paragraphs": paragraphs, "tableCount": 0,
                "limits": ["No non-empty table in source; no table-fidelity proof", "No font substitution, page layout or complete TOC/index-field fidelity claim",
                           "Numeric TOC cache is diagnostic; stable source-derived index text is required"]}


def docx_text(element):
    return "".join(e.text or "" if e.tag == q("w", "t") else "\t" if e.tag == q("w", "tab") else "\n" if e.tag in (q("w", "br"), q("w", "cr")) else "" for e in element.iter())


def docx_audit(path, oracle, marker=""):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
        styles_root = ET.fromstring(archive.read("word/styles.xml"))
        styles = {e.get(q("w", "styleId")): e for e in styles_root.findall("w:style", NS)}

        def props_from(element):
            out = {}
            if element is None:
                return out
            for local in ("sz", "b", "caps", "smallCaps", "jc", "outlineLvl"):
                e = element.find("w:" + local, NS)
                if e is None:
                    continue
                value = e.get(q("w", "val"), "true")
                out[local] = value
            return out

        default = styles_root.find("w:docDefaults", NS)
        default_props = {}
        if default is not None:
            default_props.update(props_from(default.find("w:pPrDefault/w:pPr", NS)))
            default_props.update(props_from(default.find("w:rPrDefault/w:rPr", NS)))

        def style_props(name, seen=(), include_defaults=True):
            assert name not in seen, "Cyclic DOCX style"
            element = styles.get(name)
            if element is None:
                return dict(default_props) if include_defaults else {}
            parent = element.find("w:basedOn", NS)
            result = style_props(parent.get(q("w", "val")), (*seen, name), include_defaults) if parent is not None else (dict(default_props) if include_defaults else {})
            result.update(props_from(element.find("w:pPr", NS)))
            result.update(props_from(element.find("w:rPr", NS)))
            return result

        paragraphs = []
        body = root.find("w:body", NS)
        parents = {child: parent for parent in body.iter() for child in parent}
        for p in body.iter(q("w", "p")):
            text = normalize(docx_text(p))
            if not text:
                continue
            ppr = p.find("w:pPr", NS)
            ps = p.find("w:pPr/w:pStyle", NS)
            name = ps.get(q("w", "val")) if ps is not None else "Normal"
            props = style_props(name)
            props.update(props_from(ppr))
            first = next((r for r in p.iter(q("w", "r")) if normalize(docx_text(r))), None)
            if first is not None:
                rs = first.find("w:rPr/w:rStyle", NS)
                if rs is not None:
                    props.update(style_props(rs.get(q("w", "val")), include_defaults=False))
                props.update(props_from(first.find("w:rPr", NS)))
            controls = list(p.iter(q("w", "sdt")))
            parent = parents.get(p)
            while parent is not None:
                if parent.tag == q("w", "sdt"):
                    controls.append(parent)
                parent = parents.get(parent)
            placeholders = []
            for control in controls:
                pr = control.find("w:sdtPr", NS)
                if pr is None or pr.find("w:showingPlcHdr", NS) is None:
                    continue
                alias = pr.find("w:alias", NS)
                placeholders.append({"type": "text" if pr.find("w:text", NS) is not None else "other",
                                     "prompt": normalize(docx_text(control.find("w:sdtContent", NS))),
                                     "description": alias.get(q("w", "val")) if alias is not None else None})
            paragraphs.append({"text": text, "style": name,
                               "placeholders": placeholders,
                               "properties": {"sizePt": float(props["sz"]) / 2 if "sz" in props else None,
                                              "bold": props.get("b", "false") not in ("0", "false", "off"),
                                              "alignment": {"both": "justify", "start": "left"}.get(props.get("jc", "left"), props.get("jc", "left")),
                                              "caps": props.get("caps", "false") not in ("0", "false", "off"),
                                              "smallCaps": props.get("smallCaps", "false") not in ("0", "false", "off")},
                               "outlineLevel": int(props["outlineLvl"]) if "outlineLvl" in props else None})
        matched, after = [], 0
        for i, expected in enumerate(oracle["paragraphs"]):
            wanted = expected["text"] + (marker if i == 0 else "")
            candidates = [(j, p) for j, p in enumerate(paragraphs) if j >= after and
                          (p["text"] == wanted or expected["dynamicIndexCache"] and re.fullmatch(re.escape(expected["stableText"]) + r"\s\d+", p["text"]))]
            assert candidates, f"Missing/reordered source paragraph {i}: {wanted!r}; actual={[p['text'] for p in paragraphs]}"
            index, actual = candidates[0]
            after = index + 1
            assert actual["properties"] == expected["properties"], f"Source-derived style mismatch at {i}: {expected['sourceStyle']}: expected={expected['properties']}, actual={actual['properties']}"
            if expected["placeholders"]:
                assert actual["placeholders"] == expected["placeholders"], f"Source placeholder contract lost at {i}: expected={expected['placeholders']}, actual={actual['placeholders']}"
            if expected["headingLevel"]:
                assert actual["outlineLevel"] == expected["headingLevel"] - 1, f"Heading level lost at {i}"
            matched.append({"sourceIndex": i, "docxIndex": index, "text": actual["text"],
                            "properties": actual["properties"], "placeholders": actual["placeholders"], "cachedTextExact": actual["text"] == wanted})
        assert len(list(body.iter(q("w", "tbl")))) == oracle["tableCount"]
        assert len(paragraphs) == len(oracle["paragraphs"]), "Unexpected extra nonempty body paragraphs"
        return {"passed": True, "fileSha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                "sourceSha256": oracle["source"]["sha256"], "matched": matched, "marker": marker,
                "tableCount": 0, "actualNonemptyParagraphs": len(paragraphs), "scope": oracle["limits"]}


def title_field_contract(path, marker):
    """Reject a flattened title even when all cached plain text/styles survive."""
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    p = next(p for p in root.find("w:body", NS).iter(q("w", "p")) if normalize(docx_text(p)))
    simple = list(p.iter(q("w", "fldSimple")))
    if simple:
        assert len(simple) == 1 and not list(p.iter(q("w", "fldChar")))
        field = simple[0]
        instruction = field.get(q("w", "instr"), "")
        cached = docx_text(field)
        field_nodes = set(field.iter())
        appended = "".join(n.text or "" for n in p.iter(q("w", "t")) if n not in field_nodes)
        kind = "simple"
    else:
        phase, instruction, cached, appended, marks = "before", "", "", "", []
        for node in p.iter():
            if node.tag == q("w", "fldChar"):
                mark = node.get(q("w", "fldCharType"))
                assert (phase, mark) in (("before", "begin"), ("instruction", "separate"), ("result", "end")), "Invalid title field boundaries"
                phase = {"begin": "instruction", "separate": "result", "end": "after"}[mark]
                marks.append(mark)
            elif node.tag == q("w", "instrText"):
                assert phase == "instruction"
                instruction += node.text or ""
            elif node.tag == q("w", "t"):
                if phase == "result":
                    cached += node.text or ""
                elif phase == "after":
                    appended += node.text or ""
                else:
                    assert not node.text, "Title text moved outside its real field"
        assert marks == ["begin", "separate", "end"], "DOCVARIABLE title was flattened or lost"
        kind = "complex"
    assert normalize(instruction) == "DOCVARIABLE Report", "Original title field definition changed"
    assert cached == "Report Title", "Original cached title changed"
    assert appended == marker, "Appended ordinary text must remain outside the field"
    return {"kind": kind, "instruction": normalize(instruction), "cachedText": cached, "appendedOrdinaryText": appended}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["source", "audit"])
    parser.add_argument("input", type=Path)
    parser.add_argument("--oracle", type=Path)
    parser.add_argument("--marker", default="")
    parser.add_argument("--preserve-title-docvariable", action="store_true")
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        report = source_oracle(args.input) if args.mode == "source" else docx_audit(args.input, json.loads(args.oracle.read_text(encoding="utf8")), args.marker)
        if args.preserve_title_docvariable:
            assert args.mode == "audit"
            report["titleField"] = title_field_contract(args.input, args.marker)
    except Exception as error:
        args.report.write_text(json.dumps({"passed": False, "mode": args.mode, "input": args.input.name, "error": str(error)}, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        raise
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"mode": args.mode, "report": str(args.report), "paragraphs": len(report.get("paragraphs", report.get("matched", []))), "tableCount": report["tableCount"]}))


if __name__ == "__main__":
    main()
