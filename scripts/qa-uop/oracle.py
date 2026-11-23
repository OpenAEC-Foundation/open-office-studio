"""Independent UOF1 XML -> OOXML oracle. Never derive source expectations from output."""
import argparse
from decimal import Decimal, ROUND_HALF_UP
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import posixpath
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
U = "{http://schemas.uof.org/cn/2003/uof}"
G = "{http://schemas.uof.org/cn/2003/graph}"
T = "{http://schemas.uof.org/cn/2003/uof-wordproc}"
P = "{http://schemas.uof.org/cn/2003/uof-slideshow}"
PX = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    data = Path(path).read_bytes()
    assert len(data) == CONFIG["source"]["bytes"]
    assert sha(data) == CONFIG["source"]["sha256"]
    return data


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent":"OpenOfficeStudio-QA/2026.48.1", "Accept-Encoding":"identity"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(2_000_000)
        return data, {"url":response.url,"status":response.status,"headers":dict(response.headers),"bytes":len(data),"sha256":sha(data)}


def fetch_source(path, out):
    path = Path(path)
    if not path.exists():
        data, receipt = download(CONFIG["source"]["url"])
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(data)
        write_json(out / "source-response.json",receipt)
    source_bytes(path)
    page, receipt = download(CONFIG["source"]["publication"])
    class Text(HTMLParser):
        def __init__(self):
            super().__init__(); self.parts = []
        def handle_data(self, data):
            self.parts.append(data)
    parser = Text(); parser.feed(page.decode("utf-8"))
    plain = " ".join(" ".join(parser.parts).split())
    assert CONFIG["source"]["permission"] in plain, "Publisher test-use permission is missing"
    assert "/samples/uop/sample-presentation.uop" in page.decode("utf-8")
    write_json(out / "publisher-permission.json",{"url":CONFIG["source"]["publication"],"permission":CONFIG["source"]["permission"],"pageSha256":sha(page),"note":"Only the relevant permission excerpt is retained; the full publisher article is not redistributed."})
    write_json(out / "publisher-response.json",receipt)


def emu(cm):
    return int((Decimal(cm) * 360000).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def uof_paragraph(p):
    chunks = []
    for n in p.iter():
        if n.tag == T + "文本串":
            chunks.append(n.text or "")
        elif n.tag == T + "换行符":
            chunks.append("\n")
        elif n.tag == T + "制表符":
            chunks.append("\t")
    text = "".join(chunks)
    numbering = p.find(T + "段落属性/" + T + "自动编号信息")
    return {"text":text,"level":int(numbering.get(T + "编号级别")) - 1 if numbering is not None else 0,
            "numberingRef":numbering.get(T + "编号引用") if numbering is not None else None,
            "paragraphStyle":p.find(T + "段落属性").get(T + "式样引用", ""),
            "runStyles":[n.get(T + "式样引用", "") for n in p.iter(T + "句属性")]}


def parse_source(path):
    data = source_bytes(path)
    assert data.startswith(b"<?xml") and not zipfile.is_zipfile(path)
    assert b"<!DOCTYPE" not in data and b"<!ENTITY" not in data
    root = ET.fromstring(data)
    assert root.tag == U + "UOF" and root.get(U + "version") == "1.0"
    assert root.get(U + "mimetype") == "vnd.uof.presentation"
    for tag,key in [("创建应用程序","generator"),("创建日期","created"),("作者","author"),("标题","title")]:
        assert root.findtext(U + "元数据/" + U + tag) == CONFIG["source"][key]
    presentation = root.find(U + "演示文稿")
    assert presentation.findtext(P + "公用处理规则/" + P + "度量单位") == "cm"
    masters = {m.get(P + "标识符"):m for m in presentation.findall(P + "主体/" + P + "母版集/" + P + "母版") if m.get(P + "标识符")}
    pages = {p.get(P + "标识符"):p for p in presentation.findall(P + "公用处理规则/" + P + "页面设置集/" + P + "页面设置")}
    object_set = root.find(U + "对象集")
    assert all(n.tag == G + "图形" for n in object_set)
    objects = {n.get(G + "标识符"):n for n in object_set}
    assert len(objects) == len(object_set) == 40

    def anchor_shape(anchor):
        oid = anchor.get(U + "图形引用")
        obj = objects[oid]
        kind = obj.findtext(G + "预定义图形/" + G + "名称")
        assert kind in ("文本框","Rectangle","Line"), kind
        prop = obj.find(G + "预定义图形/" + G + "属性")
        paragraphs = [uof_paragraph(p) for p in obj.findall(G + "文本内容/" + T + "段落")]
        return {"id":oid,"kind":kind,"placeholder":anchor.get(U + "占位符"),
                "rectEMU":{k:emu(anchor.get(U + tag)) for k,tag in [("x","x坐标"),("y","y坐标"),("width","宽度"),("height","高度")]},
                "paragraphs":paragraphs,"texts":[p["text"] for p in paragraphs] if any(p["text"] for p in paragraphs) else [],
                "fill":prop.findtext(G + "填充/" + G + "颜色"),"strokeColor":prop.findtext(G + "线颜色"),
                "strokeWidthEMU":emu(prop.findtext(G + "线粗细")) if prop.find(G + "线粗细") is not None else None,
                "arrow":prop.findtext(G + "后端箭头/" + G + "式样")}

    slides = []
    for slide in presentation.findall(P + "主体/" + P + "幻灯片集/" + P + "幻灯片"):
        master = masters[slide.get(P + "母版引用")]
        page = pages[master.get(P + "页面设置引用")].find(P + "纸张")
        notes = []
        for a in slide.findall(P + "幻灯片备注/" + U + "锚点"):
            if a.get(U + "占位符") == "notes":
                obj = objects[a.get(U + "图形引用")]
                notes.extend(uof_paragraph(p)["text"] for p in obj.findall(G + "文本内容/" + T + "段落"))
        shapes = [anchor_shape(a) for a in slide.findall(U + "锚点")]
        slides.append({"name":slide.get(P + "名称"),"master":slide.get(P + "母版引用"),
                       "sizeEMU":{"width":emu(page.get(U + "宽度")),"height":emu(page.get(U + "高度"))},
                       "shapes":shapes,"notes":notes,"transition":slide.find(P + "切换").get(P + "效果")})
    assert len(slides) == 3 and [len(s["shapes"]) for s in slides] == [2,2,4]
    assert all(s["sizeEMU"] == {"width":10080000,"height":5670000} for s in slides)
    assert slides[0]["shapes"][1]["texts"][0] == "示例演示文稿"
    assert [p["level"] for p in slides[1]["shapes"][1]["paragraphs"]] == [0,0,0,0,1]
    assert [s["shapes"][1]["fill"] for s in slides[2:]] == ["#14213d"]
    formula_nodes = [n.tag for n in root.iter() if "公式" in n.tag.split("}")[-1] or "math" in n.tag.split("}")[0].lower()]
    assert not formula_nodes
    assert all(n.tag not in (G + "图片",G + "二进制数据",U + "二进制数据") for n in root.iter())
    return {"application":CONFIG["application"],"source":CONFIG["source"],"slides":slides,"formulaCount":0,"embeddedMediaCount":0,
            "objectDefinitions":len(objects),"cachedMetadataObjectCount":root.findtext(U + "元数据/" + U + "对象数"),
            "edit":CONFIG["edit"],"geometryToleranceEMU":CONFIG["geometryToleranceEMU"],
            "note":"Source-only slide/master/object/paragraph/list/shape-style/notes oracle. Generated-software PNG labels are not embedded raster images. No font/rounded-corner/visual claim is inferred from absent applied style data."}


def part_for(origin,target):
    return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(origin),target))


def read_pptx(path):
    with zipfile.ZipFile(path) as z:
        types = ET.fromstring(z.read("[Content_Types].xml"))
        assert any(e.get("PartName") == "/ppt/presentation.xml" and e.get("ContentType") == "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" for e in types)
        pres = ET.fromstring(z.read("ppt/presentation.xml"))
        rels = {r.get("Id"):r.get("Target") for r in ET.fromstring(z.read("ppt/_rels/presentation.xml.rels"))}
        size = pres.find(PX + "sldSz")
        slides = []
        formula_count = 0
        for sid in pres.find(PX + "sldIdLst"):
            part = part_for("ppt/presentation.xml",rels[sid.get(R + "id")])
            root = ET.fromstring(z.read(part))
            shapes = []
            for shape in root.find(PX + "cSld/" + PX + "spTree"):
                kind = shape.tag.split("}")[-1]
                if kind not in ("sp","cxnSp","pic","graphicFrame","grpSp"):
                    continue
                transform = shape.find(PX + "spPr/" + A + "xfrm")
                rect = None
                if transform is not None:
                    off,ext = transform.find(A + "off"),transform.find(A + "ext")
                    if off is not None and ext is not None:
                        rect = {"x":int(off.get("x")),"y":int(off.get("y")),"width":int(ext.get("cx")),"height":int(ext.get("cy"))}
                paragraphs = []
                for p in shape.findall(PX + "txBody/" + A + "p"):
                    chunks = []
                    for n in p.iter():
                        if n.tag == A + "t":chunks.append(n.text or "")
                        elif n.tag == A + "br":chunks.append("\n")
                        elif n.tag == A + "tab":chunks.append("\t")
                    prop = p.find(A + "pPr")
                    paragraphs.append({"text":"".join(chunks),"level":int(prop.get("lvl","0")) if prop is not None else 0})
                fill = shape.find(PX + "spPr/" + A + "solidFill/" + A + "srgbClr")
                line = shape.find(PX + "spPr/" + A + "ln")
                line_color = line.find(A + "solidFill/" + A + "srgbClr") if line is not None else None
                ends = [n.get("type","none") for n in line if n.tag in (A + "headEnd",A + "tailEnd")] if line is not None else []
                shape_name = shape.find(".//" + PX + "cNvPr")
                shapes.append({"kind":kind,"name":shape_name.get("name") if shape_name is not None else None,"rectEMU":rect,
                               "texts":[p["text"] for p in paragraphs] if any(p["text"] for p in paragraphs) else [],"paragraphs":paragraphs,
                               "fill":"#" + fill.get("val").lower() if fill is not None else None,
                               "strokeColor":"#" + line_color.get("val").lower() if line_color is not None else None,
                               "strokeWidthEMU":int(line.get("w")) if line is not None and line.get("w") is not None else None,"arrowEnds":ends})
            notes = []
            relpath = posixpath.join(posixpath.dirname(part),"_rels",posixpath.basename(part)+".rels")
            if relpath in z.namelist():
                for rel in ET.fromstring(z.read(relpath)):
                    if rel.get("Type","").endswith("/notesSlide"):
                        nr = ET.fromstring(z.read(part_for(part,rel.get("Target"))))
                        for sp in nr.findall(PX + "cSld/" + PX + "spTree/" + PX + "sp"):
                            ph = sp.find(PX + "nvSpPr/" + PX + "nvPr/" + PX + "ph")
                            if ph is not None and ph.get("type") == "body":
                                for p in sp.findall(PX + "txBody/" + A + "p"):
                                    notes.append("".join(n.text or "" for n in p.iter(A + "t")))
            formula_count += sum("math" in n.tag.split("}")[0].lower() for n in root.iter())
            slides.append({"shapes":shapes,"notes":notes})
        return {"sizeEMU":{"width":int(size.get("cx")),"height":int(size.get("cy"))},"slides":slides,
                "mediaParts":[n for n in z.namelist() if n.startswith("ppt/media/") and not n.endswith("/")],"formulaCount":formula_count}


def verify_pptx(oracle,path,edited):
    observed = read_pptx(path)
    checks = []
    def check(label,ok,expected=None,actual=None):
        checks.append({"check":label,"passed":bool(ok),**({"expected":expected,"actual":actual} if not ok else {})})
    tol = oracle["geometryToleranceEMU"]
    check("slide count",len(observed["slides"]) == len(oracle["slides"]),len(oracle["slides"]),len(observed["slides"]))
    check("canvas size",all(abs(observed["sizeEMU"][k]-oracle["slides"][0]["sizeEMU"][k]) <= tol for k in ("width","height")),oracle["slides"][0]["sizeEMU"],observed["sizeEMU"])
    for i,(source,got) in enumerate(zip(oracle["slides"],observed["slides"])):
        check(f"slide {i+1} object count",len(got["shapes"]) == len(source["shapes"]),len(source["shapes"]),len(got["shapes"]))
        check(f"slide {i+1} notes",got["notes"] == source["notes"],source["notes"],got["notes"])
        for j,(s,a) in enumerate(zip(source["shapes"],got["shapes"])):
            label = f"slide {i+1} object {j+1} ({s['id']})"
            expected_texts = list(s["texts"])
            if edited and i == CONFIG["edit"]["slide"] and j == CONFIG["edit"]["shape"]:
                expected_texts[0] = CONFIG["edit"]["text"] + expected_texts[0]
            check(label+" text/paragraphs",a["texts"] == expected_texts,expected_texts,a["texts"])
            if s["texts"]:
                levels = [p["level"] for p in s["paragraphs"]]
                check(label+" list levels",[p["level"] for p in a["paragraphs"]] == levels,levels,[p["level"] for p in a["paragraphs"]])
            check(label+" geometry",a["rectEMU"] is not None and all(abs(a["rectEMU"][k]-s["rectEMU"][k]) <= tol for k in s["rectEMU"]),s["rectEMU"],a["rectEMU"])
            if s["kind"] == "Rectangle":
                check(label+" fill",a["fill"] == s["fill"],s["fill"],a["fill"])
            if s["kind"] == "Line":
                check(label+" stroke color",a["strokeColor"] == s["strokeColor"],s["strokeColor"],a["strokeColor"])
                check(label+" stroke width",a["strokeWidthEMU"] is not None and abs(a["strokeWidthEMU"]-s["strokeWidthEMU"]) <= tol,s["strokeWidthEMU"],a["strokeWidthEMU"])
                check(label+" arrow retained",any(t != "none" for t in a["arrowEnds"]),"nonempty arrow endpoint",a["arrowEnds"])
    check("embedded media count",len(observed["mediaParts"]) == oracle["embeddedMediaCount"],oracle["embeddedMediaCount"],len(observed["mediaParts"]))
    check("formula count",observed["formulaCount"] == oracle["formulaCount"],oracle["formulaCount"],observed["formulaCount"])
    return {"file":str(path),"sha256":sha(Path(path).read_bytes()),"edited":edited,"passed":all(c["passed"] for c in checks),"checks":checks,"failures":[c for c in checks if not c["passed"]],"observed":observed}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command",choices=["source","pptx"])
    p.add_argument("--source",default=".local/uop-qa/source.uop")
    p.add_argument("--out",default=".local/uop-qa")
    p.add_argument("--pptx")
    p.add_argument("--edited",action="store_true")
    p.add_argument("--record-only",action="store_true")
    args = p.parse_args(); out = Path(args.out)
    if args.command == "source":
        out.mkdir(parents=True,exist_ok=True)
        fetch_source(args.source,out)
        oracle = parse_source(args.source)
        write_json(out / "source-oracle.json",oracle)
        print(json.dumps({"slides":len(oracle["slides"]),"objects":[len(s["shapes"]) for s in oracle["slides"]],"sizeEMU":oracle["slides"][0]["sizeEMU"],"sourceSha256":CONFIG["source"]["sha256"]},indent=2))
    else:
        oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
        report = verify_pptx(oracle,args.pptx,args.edited)
        write_json(out / (Path(args.pptx).stem + "-independent.json"),report)
        print(json.dumps({"passed":report["passed"],"checks":len(report["checks"]),"failures":report["failures"]},indent=2))
        if not args.record_only:
            assert report["passed"], "Independent source-derived acceptance failed"


if __name__ == "__main__":
    main()
