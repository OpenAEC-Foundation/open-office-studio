"""Pinned upstream reference + direct native CFB records -> independent PPTX observations."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import posixpath
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from cfb_source import cfb_streams,native_pages,u16

CONFIG=json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
PX="{http://schemas.openxmlformats.org/presentationml/2006/main}"
A="{http://schemas.openxmlformats.org/drawingml/2006/main}"
R="{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

def write_json(path,value):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def sha(data):return hashlib.sha256(data).hexdigest()

def source_bytes(path):
    b=Path(path).read_bytes();cfg=CONFIG["source"]
    assert len(b)==cfg["bytes"] and sha(b)==cfg["sha256"]
    assert hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()==cfg["blob"]
    return b

def fetch(cfg,path):
    path=Path(path)
    if not path.exists():
        with urllib.request.urlopen(cfg["url"],timeout=45) as response:b=response.read(1_000_000)
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b)
    assert sha(path.read_bytes())==cfg["sha256"]

def parse_reference(text):
    slides=[];obj=None;para=None
    for line in text.splitlines():
        if line.startswith("  startSlide("):
            slides.append({"textObjects":[],"referenceHeader":line.strip()})
        elif line.lstrip().startswith("startTextObject(") and slides:
            obj={"paragraphs":[],"referenceHeader":line.strip()};slides[-1]["textObjects"].append(obj)
        elif line.lstrip().startswith("openParagraph(") and obj is not None:para=""
        elif line.lstrip().startswith("insertText(") and para is not None:
            para+=line.strip()[11:-1]
        elif line.lstrip().startswith("insertLineBreak(") and para is not None:para+="\n"
        elif line.lstrip().startswith("closeParagraph(") and para is not None:
            obj["paragraphs"].append(para);para=None
        elif line.lstrip().startswith("endTextObject("):obj=None
    assert len(slides)==2 and [len(s["textObjects"]) for s in slides]==[4,4]
    return slides

def parse_source(path,reference):
    b=source_bytes(path);entries,streams=cfb_streams(b)
    assert b"Presentation\0" in streams["\x01CompObj"] and b"StarImpress 5.0\0" in streams["\x01CompObj"]
    main=streams["StarDrawDocument3"]
    pages,visible=native_pages(main)
    ref=parse_reference(Path(reference).read_text(encoding="utf-8"))
    slides=[]
    for page,r in zip(visible,ref):
        text_objects=[]
        for ro in r["textObjects"]:
            matches=[]
            for leaf in page["leafObjects"]:
                positions=[]
                for text in ro["paragraphs"]:
                    raw=text.encode("cp1252");at=main.find(raw,leaf["offset"],leaf["offset"]+leaf["bytes"])
                    if at<0 or u16(main,at-2)!=len(raw):break
                    positions.append(at)
                else:matches.append((leaf,positions))
            assert len(matches)==1,"Upstream text must bind uniquely to actual length-prefixed native strings in the correct visible page"
            leaf,positions=matches[0]
            text_objects.append({**leaf,"paragraphs":ro["paragraphs"],"nativeStringOffsets":positions,"referenceHeader":ro["referenceHeader"]})
        assert [t["offset"] for t in text_objects]==sorted(t["offset"] for t in text_objects)
        slides.append({**page,"sizeEMU":{"width":page["nativeSize"][0]*360,"height":page["nativeSize"][1]*360},"textObjects":text_objects})
    assert sum(len(t["paragraphs"]) for s in slides for t in s["textObjects"])==12
    return {"application":CONFIG["application"],"source":CONFIG["source"],"streams":entries,"nativePages":pages,"slides":slides,
            "visibleNativePageCount":2,"notesAndHandoutPageRecords":3,"opaqueOLEType23Objects":sum(o["type"]==23 for s in slides for o in s["leafObjects"]),
            "basicStoragePresent":any(e["name"] in ("StarBASIC","BasicManager2") for e in entries),"edit":CONFIG["edit"],"geometryToleranceEMU":CONFIG["geometryToleranceEMU"],
            "limits":[CONFIG["coverageLimit"],"Upstream .raw reference can share the libstaroffice algorithm; only direct original CFB checks establish independent native page/text/bounds identity","Text/style data beyond the checked native strings/boxes, opaque OLE content, bitmap fill resources and notes are not fully decoded"]}

def read_pptx(path):
    with zipfile.ZipFile(path) as z:
        types=ET.fromstring(z.read("[Content_Types].xml"))
        assert any(e.get("PartName")=="/ppt/presentation.xml" and e.get("ContentType")=="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" for e in types)
        pres=ET.fromstring(z.read("ppt/presentation.xml"));sz=pres.find(PX+"sldSz")
        rels={r.get("Id"):r.get("Target") for r in ET.fromstring(z.read("ppt/_rels/presentation.xml.rels"))}
        slides=[]
        for sid in pres.find(PX+"sldIdLst"):
            target=rels[sid.get(R+"id")];part=target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("ppt",target))
            root=ET.fromstring(z.read(part));leaves=[]
            def flatten(tree,sx=Fraction(1),sy=Fraction(1),tx=Fraction(0),ty=Fraction(0)):
                for shape in tree:
                    kind=shape.tag.split("}")[-1]
                    if kind=="grpSp":
                        x=shape.find(PX+"grpSpPr/"+A+"xfrm");assert x is not None
                        off,ext,ch_off,ch_ext=[x.find(A+n) for n in ("off","ext","chOff","chExt")]
                        fx=Fraction(int(ext.get("cx")),int(ch_ext.get("cx"))) if int(ch_ext.get("cx")) else Fraction(1)
                        fy=Fraction(int(ext.get("cy")),int(ch_ext.get("cy"))) if int(ch_ext.get("cy")) else Fraction(1)
                        flatten(shape,sx*fx,sy*fy,tx+sx*(int(off.get("x"))-fx*int(ch_off.get("x"))),ty+sy*(int(off.get("y"))-fy*int(ch_off.get("y"))))
                        continue
                    if kind not in ("sp","cxnSp","pic","graphicFrame"):continue
                    x=shape.find(PX+"spPr/"+A+"xfrm")
                    rect=None
                    if x is not None:
                        off,ext=x.find(A+"off"),x.find(A+"ext")
                        if off is not None and ext is not None:rect={"x":float(tx+sx*int(off.get("x"))),"y":float(ty+sy*int(off.get("y"))),"width":float(sx*int(ext.get("cx"))),"height":float(sy*int(ext.get("cy")))}
                    texts=[]
                    for p in shape.findall(PX+"txBody/"+A+"p"):
                        value="".join((n.text or "") if n.tag==A+"t" else "\n" if n.tag==A+"br" else "" for n in p.iter())
                        texts.append(value)
                    if not any(texts):texts=[]
                    leaves.append({"kind":kind,"rectEMU":rect,"paragraphs":texts})
            flatten(root.find(PX+"cSld/"+PX+"spTree"))
            slides.append({"part":part,"leafObjects":leaves,"textObjects":[o for o in leaves if o["paragraphs"]]})
        return {"sizeEMU":{"width":int(sz.get("cx")),"height":int(sz.get("cy"))},"slides":slides,"mediaParts":[n for n in z.namelist() if n.startswith("ppt/media/") and not n.endswith("/")],"embeddingParts":[n for n in z.namelist() if n.startswith("ppt/embeddings/")]}

def verify_pptx(oracle,path,edited):
    got=read_pptx(path);checks=[];tol=oracle["geometryToleranceEMU"]
    def check(label,ok,expected=None,actual=None):checks.append({"check":label,"passed":bool(ok),**({"expected":expected,"actual":actual} if not ok else {})})
    def close(a,b):return a is not None and all(abs(a[k]-b[k])<=tol for k in b)
    check("visible slide count",len(got["slides"])==len(oracle["slides"]),len(oracle["slides"]),len(got["slides"]))
    check("native page size",close(got["sizeEMU"],oracle["slides"][0]["sizeEMU"]),oracle["slides"][0]["sizeEMU"],got["sizeEMU"])
    for i,(source,actual) in enumerate(zip(oracle["slides"],got["slides"])):
        check(f"slide{i+1} leaf count",len(actual["leafObjects"])==len(source["leafObjects"]),len(source["leafObjects"]),len(actual["leafObjects"]))
        remaining=list(actual["leafObjects"])
        for j,s in enumerate(source["leafObjects"]):
            matching=next((o for o in remaining if close(o["rectEMU"],s["rectEMU"])),None)
            check(f"slide{i+1} native leaf{j+1} bounds",matching is not None,s["rectEMU"],None if matching is None else matching["rectEMU"])
            if matching is not None:remaining.remove(matching)
        expected=[list(t["paragraphs"]) for t in source["textObjects"]]
        if edited and i==CONFIG["edit"]["slide"]:expected[0][0]=CONFIG["edit"]["text"]+expected[0][0]
        check(f"slide{i+1} original paragraph texts",[o["paragraphs"] for o in actual["textObjects"]]==expected,expected,[o["paragraphs"] for o in actual["textObjects"]])
        for j,(s,a) in enumerate(zip(source["textObjects"],actual["textObjects"])):check(f"slide{i+1} text{j+1} native bounds",close(a["rectEMU"],s["rectEMU"]),s["rectEMU"],a["rectEMU"])
    return {"file":str(path),"sha256":sha(Path(path).read_bytes()),"edited":edited,"passed":all(c["passed"] for c in checks),"checks":checks,"failures":[c for c in checks if not c["passed"]],"observed":got,"acceptanceScope":"Bounded native page/text/object geometry only; no opaque OLE/bitmap/notes/macro/style/render acceptance"}

def main():
    p=argparse.ArgumentParser();p.add_argument("command",choices=["source","pptx"]);p.add_argument("--source",default=".local/sdd-qa/source.sdd");p.add_argument("--out",default=".local/sdd-qa");p.add_argument("--pptx");p.add_argument("--edited",action="store_true");p.add_argument("--record-only",action="store_true");args=p.parse_args();out=Path(args.out)
    if args.command=="source":
        out.mkdir(parents=True,exist_ok=True);fetch(CONFIG["source"],args.source)
        ref=out / "upstream-reference.raw";fetch(CONFIG["source"]["reference"],ref)
        for notice in CONFIG["source"]["notices"]:fetch(notice,out / ("upstream-"+notice["path"]))
        oracle=parse_source(args.source,ref);write_json(out / "source-oracle.json",oracle)
        print(json.dumps({"visiblePages":2,"nativePageRecords":len(oracle["nativePages"]),"leafCounts":[len(s["leafObjects"]) for s in oracle["slides"]],"textObjects":[len(s["textObjects"]) for s in oracle["slides"]],"sizeEMU":oracle["slides"][0]["sizeEMU"],"opaqueOLE":oracle["opaqueOLEType23Objects"],"basicStorage":oracle["basicStoragePresent"]},indent=2))
    else:
        oracle=json.loads((out / "source-oracle.json").read_text(encoding="utf-8"));report=verify_pptx(oracle,args.pptx,args.edited)
        write_json(out / (Path(args.pptx).stem+"-independent.json"),report)
        print(json.dumps({"passed":report["passed"],"checks":len(report["checks"]),"failures":report["failures"]},indent=2))
        if not args.record_only:assert report["passed"]

if __name__=="__main__":main()
