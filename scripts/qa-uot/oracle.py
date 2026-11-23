"""Independent Python stdlib source UOF1 -> DOCX semantic oracle."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
U = "{http://schemas.uof.org/cn/2003/uof}"
T = "{http://schemas.uof.org/cn/2003/uof-wordproc}"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    data = Path(path).read_bytes()
    assert len(data) == CONFIG["source"]["bytes"]
    assert sha(data) == CONFIG["source"]["sha256"]
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == CONFIG["source"]["blob"]
    return data


def fetch(url, path, digest):
    path = Path(path)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(1_000_000)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    assert sha(path.read_bytes()) == digest


def source_text(p):
    # XML 1.0 parser normalizes source literal CR line endings to LF.
    return "".join(n.text or "" for n in p.iter(T + "文本串"))


def parse_source(path):
    data = source_bytes(path)
    assert data.startswith(b"<?xml") and not zipfile.is_zipfile(path)
    root = ET.fromstring(data)
    assert root.tag == U + "UOF" and root.get(U + "version") == "1.0"
    assert root.get(U + "mimetype") == "vnd.uof.text"
    assert root.findtext(".//" + U + "创建应用程序") == CONFIG["source"]["generator"]
    assert root.findtext(".//" + U + "创建日期") == CONFIG["source"]["created"]
    assert root.findtext(".//" + U + "创建者") == CONFIG["source"]["author"]
    body = root.find(U + "文字处理/" + T + "主体")
    assert body is not None
    assert [n.tag for n in body] == [T + "分节", T + "段落", T + "逻辑章节"], "Body contains unexpected structures"
    paragraphs = []
    styles = {s.get(T + "标识符"):s for s in root.findall(U + "式样集/" + U + "段落式样")}
    for p in body.findall(T + "段落"):
        prop = p.find(T + "段落属性")
        style_id = prop.get(T + "式样引用")
        assert style_id in styles
        style = styles[style_id]
        spacing = prop.find(T + "行距")
        if spacing is None:
            spacing = style.find(T + "行距")
        assert spacing is not None and spacing.get(T + "类型") == "multi-lines"
        ratio = Decimal(spacing.get(T + "值"))
        paragraphs.append({"text":source_text(p), "styleId":style_id, "styleName":style.get(T + "名称"),
                           "lineSpacingMultiple":str(ratio), "lineSpacingOOXML":str(int(ratio * 240))})
    assert len(paragraphs) == 1
    assert paragraphs[0]["styleId"] == "Standard"
    assert paragraphs[0]["text"].startswith("file format commons uot Uniform Office Format 1 ")
    assert paragraphs[0]["text"].count("\n") == 2
    # Heading style definition exists but is not applied to a body paragraph.
    assert "Heading" in styles
    headings = sum(p["styleId"].startswith("Heading") for p in paragraphs)
    tables = 0  # Exact body structure above contains only section, paragraph and logical-chapter nodes.
    assert headings == tables == 0
    expected = [p["text"] for p in paragraphs]
    edit = CONFIG["edit"]
    assert edit["paragraph"] == edit["offset"] == 0
    edited = expected.copy()
    edited[0] = edit["text"] + expected[0]
    return {"application":CONFIG["application"], "source":CONFIG["source"], "paragraphs":paragraphs,
            "headings":headings, "tables":tables, "unusedHeadingStyle":True,
            "expected":{"texts":expected,"editedTexts":edited,"edit":edit},
            "note":"Text, paragraph count, applied style and line spacing derive only from source XML. No observed converter/engine output is used as an expectation."}


def word_text(p):
    chunks = []
    for n in p.iter():
        if n.tag == W + "t":
            chunks.append(n.text or "")
        elif n.tag in (W + "br", W + "cr"):
            chunks.append("\n")
        elif n.tag == W + "tab":
            chunks.append("\t")
    return "".join(chunks)


def read_docx(path):
    with zipfile.ZipFile(path) as z:
        types = ET.fromstring(z.read("[Content_Types].xml"))
        assert any(e.get("PartName") == "/word/document.xml" and e.get("ContentType") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" for e in types)
        body = ET.fromstring(z.read("word/document.xml")).find(W + "body")
        styles_root = ET.fromstring(z.read("word/styles.xml"))
        styles = {s.get(W + "styleId"):s for s in styles_root.findall(W + "style")}
        default_style = next((s for s in styles.values() if s.get(W + "type") == "paragraph" and s.get(W + "default") == "1"), None)
        default_props = styles_root.find(W + "docDefaults/" + W + "pPrDefault/" + W + "pPr")

        def effective(p, tag, attr):
            prop = p.find(W + "pPr")
            style_ref = prop.find(W + "pStyle") if prop is not None else None
            style_id = style_ref.get(W + "val") if style_ref is not None else default_style.get(W + "styleId") if default_style is not None else None
            candidates = [prop]
            seen = set()
            while style_id and style_id not in seen:
                seen.add(style_id)
                s = styles.get(style_id)
                if s is None:
                    break
                candidates.append(s.find(W + "pPr"))
                base = s.find(W + "basedOn")
                style_id = base.get(W + "val") if base is not None else None
            candidates.append(default_props)
            for candidate in candidates:
                n = candidate.find(W + tag) if candidate is not None else None
                if n is not None and n.get(W + attr) is not None:
                    return n.get(W + attr)
            return None

        paragraphs = []
        for p in body.findall(W + "p"):
            prop = p.find(W + "pPr")
            style_ref = prop.find(W + "pStyle") if prop is not None else None
            style_id = style_ref.get(W + "val") if style_ref is not None else default_style.get(W + "styleId") if default_style is not None else None
            style = styles.get(style_id)
            name = style.find(W + "name") if style is not None else None
            paragraphs.append({"text":word_text(p),"styleId":style_id,"styleName":name.get(W + "val") if name is not None else None,
                               "line":effective(p,"spacing","line") or "240", "lineRule":effective(p,"spacing","lineRule") or "auto",
                               "outlineLevel":effective(p,"outlineLvl","val")})
        return {"paragraphs":paragraphs, "tables":len(list(body.iter(W + "tbl")))}


def verify_docx(oracle, path, edited):
    observed = read_docx(path)
    expected = oracle["expected"]["editedTexts" if edited else "texts"]
    assert [p["text"] for p in observed["paragraphs"]] == expected, ("Paragraph texts/line endings differ", observed, expected)
    assert observed["tables"] == oracle["tables"]
    for source, p in zip(oracle["paragraphs"], observed["paragraphs"]):
        # Style identifiers may legitimately be remapped. Compare applied semantics.
        assert p["outlineLevel"] in (None, "9"), ("Unexpected heading", p)
        assert p["lineRule"] == "auto" and Decimal(p["line"]) == Decimal(source["lineSpacingOOXML"]), ("Line spacing changed", p)
    return {"file":str(path),"sha256":sha(Path(path).read_bytes()),"observed":observed,"edited":edited,"passed":True}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["source","docx"])
    p.add_argument("--source", default=".local/uot-qa/source.uot")
    p.add_argument("--out", default=".local/uot-qa")
    p.add_argument("--docx")
    p.add_argument("--edited", action="store_true")
    args = p.parse_args()
    out = Path(args.out)
    if args.command == "source":
        cfg = CONFIG["source"]
        fetch(cfg["url"],args.source,cfg["sha256"])
        fetch(cfg["licenseUrl"],out / "source-LICENSE.txt",cfg["licenseSha256"])
        fetch(cfg["readmeUrl"],out / "source-README.md",cfg["readmeSha256"])
        oracle = parse_source(args.source)
        write_json(out / "source-oracle.json",oracle)
        print(json.dumps(oracle,indent=2))
    else:
        oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
        # Always retain observations, including on a failing acceptance assertion.
        write_json(out / (Path(args.docx).stem + "-observation.json"),read_docx(args.docx))
        report = verify_docx(oracle,args.docx,args.edited)
        write_json(out / (Path(args.docx).stem + "-independent.json"),report)
        print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
