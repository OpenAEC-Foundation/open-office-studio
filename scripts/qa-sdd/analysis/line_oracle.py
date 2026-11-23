"""Replay the unchanged outputs against source line points, preserving cached bounds.

Actual SDD line endpoints are decoded from the original CFB native path record.
No output supplies an expectation or changes the original tolerance.
"""
import copy
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from oracle import CONFIG,parse_source,verify_pptx,source_bytes,write_json
from cfb_source import cfb_streams,u16,u32,i32

out=Path(".local/sdd-analysis")
source=out / "input/source.sdd"
pin=json.loads((Path(__file__).parent / "input.json").read_text())
original=parse_source(source,out / "input/upstream-reference.raw")
corrected=copy.deepcopy(original)
_,streams=cfb_streams(source_bytes(source));main=streams["StarDrawDocument3"]
lines=[]
for slide in corrected["slides"]:
    for leaf in slide["leafObjects"]:
        if leaf["type"] != 2:continue
        record=main[leaf["offset"]:leaf["offset"]+leaf["bytes"]]
        assert record[:4]==b"DrOb" and u16(record,4)==17 and u16(record,14)==2
        # This pinned native version has one polygon with two points and two
        # unflagged vertices in the final nested path record (primary reference).
        path=record[-30:]
        assert (u32(path,0),u32(path,4),u16(path,8),u16(path,10))==(30,26,1,2)
        assert path[28:]==b"\0\0"
        points=[[i32(path,p),i32(path,p+4)] for p in (12,20)]
        x=min(p[0] for p in points);y=min(p[1] for p in points)
        right=max(p[0] for p in points);bottom=max(p[1] for p in points)
        previous=leaf["rectEMU"]
        actual={"x":x*360,"y":y*360,"width":(right-x)*360,"height":(bottom-y)*360}
        leaf["cachedPaintRectEMU"]=previous
        leaf["rectEMU"]=actual
        leaf["linePointsNative"]=points
        leaf["geometryMeaning"]="Actual path endpoint bounds; cached painted/selection bounds are retained separately"
        lines.append({"nativeObjectOffset":leaf["offset"],"recordBytes":leaf["bytes"],"pointsNative":points,"cachedPaintRectEMU":previous,"endpointRectEMU":actual})
assert len(lines)==2
# No non-line expectation or error budget changes.
for before,after in zip(original["slides"],corrected["slides"]):
    for a,b in zip(before["leafObjects"],after["leafObjects"]):
        if a["type"]!=2:assert a==b
    assert before["textObjects"]==after["textObjects"]
assert corrected["geometryToleranceEMU"]==original["geometryToleranceEMU"]==995
corrected["lineRecordReference"]=pin["primaryLineRecordReference"]
write_json(out / "corrected-native-oracle.json",corrected)
reports=[]
for stem in ("converted","saved","reopened-saved"):
    r=verify_pptx(corrected,out / "input" / (stem+".pptx"),stem!="converted")
    write_json(out / (stem+"-corrected-independent.json"),r)
    reports.append({"file":stem+".pptx","sha256":r["sha256"],"passed":r["passed"],"checks":len(r["checks"]),"failures":r["failures"]})
report={"application":CONFIG["application"],"analysisCommit":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),
        "source":CONFIG["source"],"sourceCorrection":"Use true native line-path endpoints rather than cached paint/selection rectangles; source points read independently before inspecting candidates",
        "primaryReference":pin["primaryLineRecordReference"],"lineSourceObservations":lines,"toleranceEMU":995,
        "results":reports,"boundedNativePageTextGeometryPassed":all(r["passed"] for r in reports),"fullFormatAcceptance":False,
        "newConverterOrEngineExecution":False,"limits":original["limits"]+["Positive conformance is bounded to native visible pages, checked paragraphs and geometry, including actual line endpoints; no native/hosted UI proof"]}
write_json(out / "native-oracle-replay.json",report)
print(json.dumps({"boundedPassed":report["boundedNativePageTextGeometryPassed"],"results":reports,"fullFormatAcceptance":False},indent=2))
assert report["boundedNativePageTextGeometryPassed"],"Retain any remaining strict failure; do not relax expectations"
