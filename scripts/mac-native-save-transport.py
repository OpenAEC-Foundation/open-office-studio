"""Bounded three-condition native save observation; never retries an edited copy."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import time
import zipfile

HERE = Path(__file__).parent
P = runpy.run_path(str(HERE / "mac-native-writer-preflight.py"))
R = runpy.run_path(str(HERE / "mac-native-361-remaining.py"))
CONDITIONS = ("legacy-pid", "released-pid", "released-hid")
SOURCE_SHA = "c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d"
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def validate_scope(identity):
    if (identity.get("saveTransportDifferentialApproved") is not True
            or type(identity.get("saveTransportMaximumSets")) is not int or identity["saveTransportMaximumSets"] != 2
            or identity.get("saveTransportConditions") != list(CONDITIONS)
            or identity.get("requireSignedNotarized") is not True):
        raise PermissionError("Exact approved three-condition, maximum-six-copy signed Suite diagnostic required")


def another_set(records, completed_sets):
    if completed_sets not in [1,2] or len(records) != completed_sets*3:
        raise RuntimeError("Only a complete three-condition set may determine whether another set is needed")
    return completed_sets < 2 and len({r["savedExactly"] for r in records[-3:]}) == 1


def run_observation(action, launch, finish_copy, viewport, snapshot, identity, ocr, out, report):
    validate_scope(identity)
    out = Path(out); out.mkdir(parents=True, exist_ok=False)
    source = HERE / "proeven/mac-body-positive-356.docx"
    if sha(source) != SOURCE_SHA:
        raise RuntimeError("Immutable common356 control differs")
    before = P["body_text"](source)
    with zipfile.ZipFile(source) as bundle:
        source_images = {n:hashlib.sha256(bundle.read(n)).hexdigest() for n in bundle.namelist() if n.startswith("word/media/")}
    proof = {"status":"running", "nativePass":False, "diagnosticOnly":True,
             "priorCore":R["verify_previous"](identity), "sourceSha256":SOURCE_SHA,
             "conditions":list(CONDITIONS), "maximumCopies":6, "copies":[],
             "limits":["One real Q and one real CommandS per fresh private copy/process; no retry",
                       "A=legacy PID/Command-up, B=PID/empty-up, C=frontmost-guarded HID/empty-up",
                       "Posting receipts do not prove recipient delivery; old failures remain unresolved unless independently explained"]}
    report["nativeSaveTransport"] = proof

    def capture(folder, pid, name):
        raw = action("raw-snapshot")
        (folder/(name+"-ax.json")).write_text(json.dumps(raw,indent=2),encoding="utf-8")
        image = P["OBS"]["capture_original"](raw,pid,folder/(name+"-window.png"))
        display = folder/(name+"-display.png")
        subprocess.run(["screencapture","-x",str(display)],check=True,capture_output=True,timeout=15)
        return {"window":image,"displaySha256":sha(display),"extraEditorInputSent":False}

    for set_number in [1,2]:
        for condition in CONDITIONS:
            folder = out/(str(set_number)+"-"+condition); folder.mkdir()
            document = folder/(str(set_number)+"-"+condition+"-private.docx")
            document.write_bytes(source.read_bytes())
            record = {"set":set_number,"condition":condition,"fileBeforeSha256":sha(document),
                      "saveKeysSent":0,"testCharactersSent":0,"savedExactly":False}
            proof["copies"].append(record)
            pid = launch(document);record["pid"]=pid;record["launchedAt"]=time.time()
            deadline=time.monotonic()+45
            while True:
                native=snapshot();tables=native.get("tables",[])
                if (len(tables)==1 and tables[0].get("rowEvidenceAvailable") and tables[0].get("columnEvidenceAvailable")
                        and tables[0].get("cellTexts")==[["Materiaal","Aantal"],["Hout","42"]]):break
                if time.monotonic()>=deadline:raise PermissionError("Common control did not become ready before input")
                time.sleep(.2)
            if native.get("eventPostingAuthorized") is not True or native.get("trusted") is not True:
                raise PermissionError("Read-only native posting/AX capability gate failed before Q")
            record["viewport"]=viewport(action,folder/"viewport",identity,pid)
            point,record["beforeInput"] = P["visible_target"](action,folder/"before-input",pid,ocr,"EERSTE",("EERSTE","TWEEDE"))
            P["click_target"](action,point)
            P["wait_native_save_state"](snapshot,pid,document.name,False)
            record["Q"]=action("type-test-character","Q");record["testCharactersSent"]=1
            record["dirtyBeforeSave"]=P["wait_native_save_state"](snapshot,pid,document.name,True)
            record["dirtyObservedAt"]=time.time()
            record["afterQOriginal"]=capture(folder,pid,"after-Q-before-save")
            record["saveRequestedAt"]=time.time()
            record["save"]=action("save-key-differential",condition);record["saveKeysSent"]=1
            deadline=time.monotonic()+20
            while True:
                try:
                    text=P["body_text"](document)
                    with zipfile.ZipFile(document) as bundle:
                        images={n:hashlib.sha256(bundle.read(n)).hexdigest() for n in bundle.namelist() if n.startswith("word/media/")}
                    record.update(savedText=text,fileAfterSha256=sha(document),savedExactly=(text.count("Q")==1 and text.replace("Q","",1)==before and images==source_images))
                    if record["savedExactly"]:break
                except (OSError,zipfile.BadZipFile,P["ET"].ParseError):pass
                if time.monotonic()>=deadline:break
                time.sleep(.2)
            record["xmlObservationFinishedAt"]=time.time()
            if record["savedExactly"]:
                try:
                    record["cleanAfterSave"]=P["wait_native_save_state"](snapshot,pid,document.name,False)
                except (AssertionError,PermissionError) as error:record["cleanStateError"]=str(error)
            record["afterSaveOriginal"]=capture(folder,pid,"after-single-save")
            record["cleanup"]=finish_copy()
            record["sourceUnchanged"]=sha(source)==SOURCE_SHA
            (folder/"copy-receipt.json").write_text(json.dumps(record,indent=2),encoding="utf-8")
        if not another_set(proof["copies"],set_number):break
    proof.update(status="observed",sourceUnchanged=sha(source)==SOURCE_SHA,
                 allCopiesSingleInputSingleSave=all(x["saveKeysSent"]==x["testCharactersSent"]==1 for x in proof["copies"]),
                 legacyFailureReproduced=any(not x["savedExactly"] for x in proof["copies"] if x["condition"]=="legacy-pid"),
                 ordinaryHidSaveObserved=any(x["savedExactly"] for x in proof["copies"] if x["condition"]=="released-hid"))
    return proof
