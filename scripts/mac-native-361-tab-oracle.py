"""Diagnostic only: identical three Tabs, then planned newrow + CmdS/XML oracle."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import time
import zipfile

HERE = Path(__file__).parent
P = runpy.run_path(str(HERE / "mac-native-writer-preflight.py"))
T = runpy.run_path(str(HERE / "mac-native-writer-table-acceptance.py"))
R = runpy.run_path(str(HERE / "mac-native-361-remaining.py"))
ROWS = T["ROWS"]
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def run_oracle(action, launch_document, quit_app, current_pid, viewport, ready_snapshot,
               identity, ocr, out, report):
    out = Path(out); out.mkdir(parents=True, exist_ok=False)
    proof = {"status": "running", "diagnosticOnly": True, "nativePass": False,
             "priorCore": R["verify_previous"](identity), "checks": []}
    if identity.get("finalSuite361Approved") is True and identity.get("tabHistoryOracleApproved") is True:
        proof["scope"] = "Final current signed-package Tab history with saved XML; no old-source acceptance transfer"
        proof["historicalFailures"] = "Earlier P2 raw failures and follow-ups remain preserved separately"
    else:
        proof["retainedTabFailure"] = R["verify_retained_tab_failure"](identity)
    report["native361TabSaveOracle"] = proof
    source = HERE / "proeven/mac-body-original-361.docx"
    original_sha = "f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1"
    if sha(source) != original_sha: raise RuntimeError("Original fixture changed")
    document = out / "361-remaining-A.docx"; document.write_bytes(source.read_bytes())
    pid = launch_document(document); proof["pid"] = pid

    def wait(check, label):
        end = time.monotonic()+25
        while True:
            value = check()
            if value: return value
            if time.monotonic() >= end: raise AssertionError(label)
            time.sleep(.2)

    def cells():
        n = ready_snapshot(); tables = n.get("tables", [])
        return tables[0].get("cellTexts") if len(tables) == 1 else None

    def save_expected(expected, label):
        action("chord", "cmd-s")
        def check():
            try: return T["saved_rows"](document) == expected
            except (OSError, zipfile.BadZipFile): return False
        wait(check, label)
        proof["checks"].append({"name": label, "savedSha256": sha(document), "cells": T["saved_rows"](document)})

    def body(word, label, all_words=False):
        target, receipt = P["visible_target"](action, out/label, pid, ocr, word,
                            ("alpha", "beta", "omega", "delta") if all_words else ())
        proof["checks"].append({"name": label, "receipt": receipt})
        P["click_target"](action, target)
        if action("snapshot").get("focusAfter", {}).get("description") != "Document input":
            raise PermissionError("Actual visible body click must focus Document input")

    wait(lambda: cells() == ROWS, "Correct original document not loaded")
    proof["viewport"] = viewport(action, out/"viewport", identity, pid)
    body("alpha", "before-host-preflight", True)
    action("type-test-character", "X")
    def typed_state():
        c = cells()
        return c if (c and len(c)==3 and all(len(row)==3 for row in c)
                     and c[0][0].count("X")==1 and c[0][0].replace("X","",1)=="alpha"
                     and [c[0][1:],*c[1:]] == [ROWS[0][1:],*ROWS[1:]]) else None
    typed = wait(typed_state, "Native X did not reach its own cell")
    save_expected(typed, "same host-preflight X saved")
    action("chord", "cmd-z"); wait(lambda: cells()==ROWS, "Preflight Undo")
    action("chord", "cmd-shift-z"); wait(lambda: cells()==typed, "Preflight Redo")
    action("chord", "cmd-z"); wait(lambda: cells()==ROWS, "Preflight reset")
    save_expected(ROWS, "same host-preflight restored")
    proof["hostPreflightPassed"] = True
    body("delta", "before-identical-three-Tabs")
    proof["tabActions"] = [action("chord", "tab"), action("chord", "tab")]
    proof["afterTwoTabsAX"] = action("snapshot")
    proof["tabActions"].append(action("chord", "tab"))
    proof["afterThreeTabsAX"] = action("raw-snapshot")
    # The earlier AX failure is an observation, not a gate that can suppress
    # the originally planned native text/save oracle. No fourth Tab/refocus.
    before_save = sha(document)
    proof["newrowInput"] = action("type-test-text", "newrow")
    proof["saveInput"] = action("chord", "cmd-s")
    deadline = time.monotonic()+20
    while True:
        try:
            rows = T["saved_rows"](document)
            if sha(document) != before_save or time.monotonic() >= deadline: break
        except (OSError, zipfile.BadZipFile):
            if time.monotonic() >= deadline: raise
        time.sleep(.25)
    saved = out/"after-three-Tabs-newrow-CmdS.docx"; saved.write_bytes(document.read_bytes())
    proof["savedRows"] = T["saved_rows"](saved)
    proof["savedSha256"] = sha(saved)
    proof["savedBytesChanged"] = sha(saved) != before_save
    proof["exactExpectedFourRowsAndMarker"] = proof["savedRows"] == ROWS+[["newrow","",""]]
    if identity.get("tabHistoryOracleApproved") is True:
        if not proof["exactExpectedFourRowsAndMarker"]:
            raise AssertionError("History requires the independently saved exact Tab/newrow state")
        history = []
        for label, chord in [("Undo-1", "cmd-z"), ("Undo-2", "cmd-z"),
                             ("Redo-1", "cmd-shift-z"), ("Redo-2", "cmd-shift-z")]:
            focus = action("snapshot")
            if (focus.get("focusAfter", {}).get("description") != "Document input"
                    or focus.get("applicationActive") is not True or focus.get("frontmostPid") != pid):
                raise PermissionError("History oracle requires actual owned frontmost Document input")
            before = sha(document)
            record = {"name": label, "input": action("chord", chord)}
            record["saveInput"] = action("chord", "cmd-s")
            end = time.monotonic()+20
            while True:
                try:
                    value = T["saved_rows"](document)
                    if sha(document) != before or time.monotonic() >= end: break
                except (OSError, zipfile.BadZipFile):
                    if time.monotonic() >= end: raise
                time.sleep(.25)
            snapshot = out/(label+"-saved.docx"); snapshot.write_bytes(document.read_bytes())
            record.update(savedRows=T["saved_rows"](snapshot), savedSha256=sha(snapshot),
                          savedBytesChanged=sha(snapshot)!=before, native=action("raw-snapshot"))
            history.append(record)
            proof["historySteps"] = history
            if (record["savedRows"][:3] != ROWS or len(record["savedRows"]) not in [3,4]
                    or (len(record["savedRows"])==4 and record["savedRows"][3] not in [["","",""],["newrow","",""]])):
                raise AssertionError("Bounded history changed an original source cell or unexpected content")
        proof["historyRoundTripProven"] = (any(s["savedRows"] == ROWS for s in history[:2])
                                               and history[-1]["savedRows"] == ROWS+[["newrow","",""]])
        proof["historyGrouping"] = [s["savedRows"] for s in history]
        proof["historyLimits"] = "Exactly two Undo and two Redo commands, each normally saved; actual grouping retained, no additional input/retry"
    proof["afterSaveAX"] = action("raw-snapshot")
    (out/"after-save-raw-ax.json").write_text(json.dumps(proof["afterSaveAX"],indent=2),encoding="utf-8")
    display=out/"after-save-original-display.png"
    subprocess.run(["screencapture","-x",str(display)],check=True,capture_output=True,timeout=15)
    proof["originalDisplaySha256"] = sha(display)
    proof["originalWindowCapture"] = P["OBS"]["capture_original"](proof["afterSaveAX"],pid,out/"after-save-original-window.png")
    proof["sourceUnchanged"] = sha(source)==original_sha
    if not proof["sourceUnchanged"] or current_pid()!=pid: raise AssertionError("Source/PID changed")
    quit_app()  # Lifecycle cleanup only, after all diagnostic editor actions.
    proof["status"]="observed"
    return proof
