"""Resolve actual slide/layout/master/theme colors independently; preserve the failure."""
import colorsys
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from oracle import CONFIG, PX, A, R, part_for, write_json

OUT=Path(".local/uop-analysis")
source=json.loads((OUT / "input/source-oracle.json").read_text())
assert source["application"] == CONFIG["application"]
assert hashlib.sha256((OUT / "input/source.uop").read_bytes()).hexdigest() == CONFIG["source"]["sha256"]
results=[]


def analyse(path):
    with zipfile.ZipFile(path) as z:
        def rels(part):
            import posixpath
            rp=posixpath.join(posixpath.dirname(part),"_rels",posixpath.basename(part)+".rels")
            return list(ET.fromstring(z.read(rp)))
        def linked(part,kind):
            matches=[r for r in rels(part) if r.get("Type","").endswith("/"+kind)]
            assert len(matches) == 1
            return part_for(part,matches[0].get("Target"))
        pres=ET.fromstring(z.read("ppt/presentation.xml"))
        mapping={r.get("Id"):r.get("Target") for r in rels("ppt/presentation.xml")}
        slidepart=part_for("ppt/presentation.xml",mapping[list(pres.find(PX+"sldIdLst"))[2].get(R+"id")])
        slide=ET.fromstring(z.read(slidepart))
        layoutpart=linked(slidepart,"slideLayout"); layout=ET.fromstring(z.read(layoutpart))
        masterpart=linked(layoutpart,"slideMaster"); master=ET.fromstring(z.read(masterpart))
        themepart=linked(masterpart,"theme"); theme=ET.fromstring(z.read(themepart))
        scheme=theme.find(A+"themeElements/"+A+"clrScheme")
        colors={n.tag.split("}")[-1]:list(n)[0].get("val",list(n)[0].get("lastClr")) for n in scheme}
        color_map=dict(master.find(PX+"clrMap").attrib)
        for owner in (layout,slide):
            override=owner.find(PX+"clrMapOvr/"+A+"overrideClrMapping")
            if override is not None: color_map=dict(override.attrib)

        def resolved(solid):
            assert solid is not None and len(solid) == 1
            n=list(solid)[0]; kind=n.tag.split("}")[-1]; ref=n.get("val")
            assert kind in ("srgbClr","schemeClr","sysClr")
            rgb=colors[color_map.get(ref,ref)] if kind == "schemeClr" else n.get("lastClr") if kind == "sysClr" else ref
            assert rgb is not None and len(rgb) == 6
            channels=[int(rgb[i:i+2],16)/255 for i in (0,2,4)]
            h,l,s=colorsys.rgb_to_hls(*channels)
            transforms=[]
            for t in n:
                tag=t.tag.split("}")[-1];value=Decimal(t.get("val"))/100000
                assert tag in ("lumMod","lumOff"), "Unsupported color transform must not silently pass"
                l=l*float(value) if tag == "lumMod" else l+float(value)
                l=min(1,max(0,l));transforms.append({"kind":tag,"value":str(value)})
            channels=colorsys.hls_to_rgb(h,l,s)
            rgb="#"+"".join(f"{int(v*255+0.5):02x}" for v in channels)
            return {"rgb":rgb,"reference":{"kind":kind,"value":ref},"transforms":transforms}

        shapes=[n for n in slide.find(PX+"cSld/"+PX+"spTree") if n.tag in (PX+"sp",PX+"cxnSp")]
        assert len(shapes) == 4
        checks=[]
        for index in (1,2):
            actual=resolved(shapes[index].find(PX+"spPr/"+A+"solidFill"))
            expected=source["slides"][2]["shapes"][index]["fill"]
            checks.append({"scope":"rectangle fill","sourceObject":source["slides"][2]["shapes"][index]["id"],"expectedRGB":expected,"actual":actual,"passed":actual["rgb"]==expected})
        stroke=resolved(shapes[3].find(PX+"spPr/"+A+"ln/"+A+"solidFill"))
        expected=source["slides"][2]["shapes"][3]["strokeColor"]
        checks.append({"scope":"line stroke observation","sourceObject":"gr6_0","expectedRGB":expected,"actual":stroke,"passed":stroke["rgb"]==expected})
        sz=pres.find(PX+"sldSz"); size={"width":int(sz.get("cx")),"height":int(sz.get("cy"))}
        expected_size=source["slides"][0]["sizeEMU"]
        return {"file":path.name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
                "parts":{"slide":slidepart,"layout":layoutpart,"master":masterpart,"theme":themepart},"themeColors":colors,"colorMap":color_map,"checks":checks,
                "canvas":{"expectedEMU":expected_size,"actualEMU":size,"deltaEMU":{k:size[k]-expected_size[k] for k in size},
                          "exactlyIntegralTwips":all(v%635==0 for v in size.values()),"sourceToleranceEMU":CONFIG["geometryToleranceEMU"],
                          "strictSourceTolerancePassed":all(abs(size[k]-expected_size[k])<=CONFIG["geometryToleranceEMU"] for k in size),
                          "note":"Observed canvas is rounded upward to integral twips (635 EMU each); this arithmetic is recorded, not used to relax the predeclared source tolerance or register a second product bug."}}


for stem in ("converted","saved","reopened-saved"):
    results.append(analyse(OUT / "input" / (stem+".pptx")))
assert all(len(r["checks"]) == 3 for r in results)
assert all(not c["passed"] for r in results for c in r["checks"])
assert all(r["checks"][0]["expectedRGB"] != r["checks"][1]["expectedRGB"] and r["checks"][0]["actual"]["rgb"] == r["checks"][1]["actual"]["rgb"] for r in results)
assert all(r["checks"][0]["actual"]["reference"] == {"kind":"schemeClr","value":"accent1"} for r in results)
report={"application":CONFIG["application"],"analysisCommit":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),"source":CONFIG["source"],
        "status":"CONFIRMED: distinct explicit source rectangle fills collapse to the same theme accent during private conversion and persist through engine save/reopen",
        "sourceAcceptancePassed":False,"engineAndConversionRerun":False,"results":results,
        "limits":["Independent OOXML/engine-model evidence only, no screenshot/native/hosted UI reproduction","Source stroke color also differs; retained as a separate observation, not assumed to share an implementation cause","Canvas quantization remains a separate recorded strict-acceptance gap","Analysis PASS means the discrepancy was verified, never that the UOP route passed"]}
write_json(OUT / "theme-analysis.json",report)
print(json.dumps({"discrepancyVerified":True,"sourceAcceptancePassed":False,"firstResult":results[0]},indent=2))
