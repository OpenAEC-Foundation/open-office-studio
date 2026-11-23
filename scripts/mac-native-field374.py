"""Separate Suite DOCX regression; standalone legacy STW import is another owner."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import time
import zipfile

HERE = Path(__file__).parent
P = runpy.run_path(str(HERE/"mac-native-writer-preflight.py"))
SHARED = "3169b09020184e3a98a4d5364ad77b15f38ac063"
MARKER = " -- STW30 EDIT 2026-11-23"
PINS = {"source.stw":"5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2",
        "converted.docx":"b29d6adc44aec4ee64d25555f0aa5560afb0ad24973f2b491789b6bb08e7c992",
        "windows-resaved.docx":"4dcb51f93bd88f3d4bd3a9956f53cff23613235fe222632734b8090f9ea18310",
        "audit-docx.mjs":"3077f3c86c63109c69b67300abd2b796c5131a2aaa63b955a5da4393e7d2b768",
        "contract.mjs":"c1dcf1696188b851b794e6120533c58f2774fb092e84c70072a84db456fcf35e",
        "oracle.py":"172b3ab9bf92cdb804fc68958c894e8468a31671af83a0ddee936f68221fe0ec"}
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def verify_shared_checkout(checkout):
    checkout = Path(checkout).resolve(strict=True)
    git = lambda *args: subprocess.check_output(["git","-C",str(checkout),*args],text=True).strip()
    if git("rev-parse","HEAD") != SHARED or git("status","--porcelain","--untracked-files=no"):
        raise RuntimeError("Exact clean shared field374 QA checkout required")
    data = checkout/"qa/field374"
    for name, expected in PINS.items():
        if sha(data/name) != expected:
            raise RuntimeError("Immutable shared field374 fixture/oracle differs: "+name)
    return data


def run_field374(action, launch_document, quit_app, current_pid, viewport, identity, ocr, out, report):
    if (identity.get("field374NativeApproved") is not True or identity.get("requireSignedNotarized") is not True
            or identity.get("field374SharedQaCommit") != SHARED
            or report.get("nativeControlPreflight",{}).get("status") != "passed"):
        raise PermissionError("Signed Suite field374 needs its explicit scope and real current-host preflight")
    shared = verify_shared_checkout(identity["field374SharedCheckout"])
    out = Path(out); out.mkdir(parents=True,exist_ok=False)
    proof = {"status":"running","nativePass":False,"visualApprovalRequired":True,"sharedQaCommit":SHARED,
             "sharedPins":PINS,"marker":MARKER,"checks":[],
             "scope":"Native Suite DOCX title/adjacent-text regression; no standalone Writer or STW import acceptance"}
    report["nativeField374"] = proof

    def audit(path, label, marker):
        digest = sha(path)
        with (out/(label+"-audit-command.log")).open("wb") as log:
            subprocess.run(["node",str(shared/"audit-docx.mjs"),str(path),str(out/(label+"-audit")),marker],
                           env=dict(os.environ,OOS_FIELD_PYTHON=sys.executable),stdout=log,stderr=subprocess.STDOUT,check=True,timeout=90)
        evidence = json.loads((out/(label+"-audit")/"report.json").read_text(encoding="utf-8"))
        if (sha(path) != digest or evidence.get("inputSha256") != digest or evidence.get("status") != "passed"
                or evidence.get("marker") != marker or evidence.get("exactFieldCacheAndAdjacentTextBoundary") is not True):
            raise AssertionError("Shared field374 content/boundary audit failed")
        proof["checks"].append({"name":label+" shared original-source/field-boundary audit","inputSha256":digest,
                                 "reportSha256":sha(out/(label+"-audit")/"report.json")})

    def capture(label, pid):
        state = action("raw-snapshot")
        (out/(label+"-raw-ax.json")).write_text(json.dumps(state,indent=2),encoding="utf-8")
        display=out/(label+"-original-display.png")
        subprocess.run(["screencapture","-x",str(display)],check=True,capture_output=True,timeout=15)
        image=P["OBS"]["capture_original"](state,pid,out/(label+"-original-window.png"))
        proof["checks"].append({"name":label+" original native pixels","capture":image,"displaySha256":sha(display),
                                 "visualApprovalRequired":True})

    a=out/"field374-Windows-unmodified.docx";a.write_bytes((shared/"windows-resaved.docx").read_bytes())
    first=launch_document(a);time.sleep(5)
    capture("Windows-before-any-input-or-Maximize",first)
    proof["windowsViewport"]=viewport(action,out/"Windows-viewport",identity,first)
    capture("Windows-on-screen-unchanged",first)
    audit(a,"Windows-unchanged",MARKER)
    if sha(a)!=PINS["windows-resaved.docx"]:raise AssertionError("Unmodified Windows input changed")
    quit_app()

    b=out/"field374-converted-private.docx";b.write_bytes((shared/"converted.docx").read_bytes())
    second=launch_document(b);time.sleep(5)
    capture("converted-before-any-input-or-Maximize",second)
    proof["convertedViewport"]=viewport(action,out/"converted-viewport",identity,second)
    audit(b,"converted-unmodified","")
    target, receipt=P["visible_target"](action,out/"converted-visible-title",second,ocr,"REPORT")
    proof["visibleTitleTarget"]=receipt
    P["click_target"](action,target)
    if action("snapshot").get("focusAfter",{}).get("description")!="Document input":
        raise PermissionError("Actual visible title click must focus Document input")
    # Same platform-native navigation as the shared browser regression. Exact
    # field-cache/boundary audit, not event-sent status, judges its result.
    action("chord","cmd-up");action("chord","cmd-right")
    action("type-field374-marker",MARKER)
    capture("after-real-native-marker",second)
    before=sha(b);action("chord","cmd-s")
    deadline=time.monotonic()+25
    while True:
        try:
            with zipfile.ZipFile(b) as archive:archive.read("word/document.xml")
            if sha(b)!=before:break
        except (OSError,zipfile.BadZipFile):pass
        if time.monotonic()>=deadline:raise AssertionError("Native Command-save did not persist a changed private DOCX")
        time.sleep(0.25)
    audit(b,"native-edited-saved",MARKER);capture("native-edited-saved",second)
    saved=sha(b);quit_app()
    reopened=launch_document(b)
    if reopened==second:raise AssertionError("Full Command-Q/reopen must use a new PID")
    time.sleep(5)
    capture("newPID-reopen-before-any-input-or-Maximize",reopened)
    proof["reopenedViewport"]=viewport(action,out/"reopened-viewport",identity,reopened)
    capture("newPID-reopen-on-screen",reopened);audit(b,"newPID-reopened",MARKER)
    if sha(b)!=saved or current_pid()!=reopened:raise AssertionError("Reopen changed saved bytes/PID")
    quit_app()
    for name, expected in PINS.items():
        if sha(shared/name)!=expected:raise AssertionError("Shared immutable fixture/oracle changed")
    proof.update(status="content-passed-visual-pending",sourceInputsUnchanged=True,savedSha256=saved,
                 editedPid=second,reopenedPid=reopened,normalQuitNewPidReopen=True,
                 limits=["Original native PNGs must independently show the complete title and marker without clipping/overlap",
                         "No Canvas/model injection or field flattening; source-derived8-block/style/cache/boundary oracle reused unchanged",
                         "No standalone STW converter/format claim; those native cases remain with6f92"])
    return proof
