"""Only missing native361 Tab, cell typing, Find and two-document controls."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import time
import zipfile
from pathlib import PurePosixPath

HERE = Path(__file__).parent
PREFLIGHT = runpy.run_path(str(HERE / "mac-native-writer-preflight.py"))
TABLE = runpy.run_path(str(HERE / "mac-native-writer-table-acceptance.py"))
ROWS = TABLE["ROWS"]
RIGHT = [[row[0], "", row[1], row[2]] for row in ROWS]
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()


def preserved_report_path(relative):
    value = PurePosixPath(relative)
    if (value.is_absolute() or ".." in value.parts or "\\" in relative
            or value.parts[:2] != ("docs", "tests") or value.name != "report.json"):
        raise RuntimeError("Prior core must be a preserved docs/tests report")
    path = HERE.parent / value
    if not path.resolve().is_relative_to((HERE.parent/"docs/tests").resolve()):
        raise RuntimeError("Prior core report escapes preserved evidence")
    return path


def validate_previous_core(identity, old):
    if (old["status"] != "native-core-passed" or old["nativePass"] is not True
            or old["nativeControlPreflight"]["status"] != "passed"
            or old["nativeOriginalTable"]["status"] != "core-passed"):
        raise RuntimeError("No valid previous native core/preflight")
    for key in ["sourceCommit", "sourceTree", "declaredVersion", "packageSha256", "executableSha256"]:
        if old["identity"][key] != identity[key]:
            raise RuntimeError("Remaining controls require the exact same source/package/executable: " + key)
    if identity.get("requireSignedNotarized") is True and (old["identity"].get("requireSignedNotarized") is not True
            or old.get("signedPackagePreflight", {}).get("status") != "passed"):
        raise RuntimeError("Final signed controls require the same signed core preflight")


def verify_previous(identity):
    ref = identity["previous361Core"]
    path = preserved_report_path(ref.get("reportPath", "docs/tests/2026-11-23-mac-native-body/P2-native-pass/report.json"))
    if sha(path) != ref["reportSha256"]:
        raise RuntimeError("Reused original native report bytes differ")
    old = json.loads(path.read_text(encoding="utf-8"))
    validate_previous_core(identity, old)
    api = lambda route: json.loads(subprocess.check_output(["gh", "api", "repos/OpenAEC-Foundation/open-office-studio/" + route]))
    run = api(f"actions/runs/{ref['run']}")
    artifact = api(f"actions/artifacts/{ref['artifactId']}")
    if (run["conclusion"] != "success" or run["head_sha"] != old["harnessCommit"]
            or artifact["workflow_run"]["id"] != ref["run"] or artifact["expired"]
            or artifact["workflow_run"]["head_sha"] != old["harnessCommit"]
            or artifact["digest"] != "sha256:" + ref["archiveSha256"]):
        raise RuntimeError("Previous immutable native execution identity differs")
    return dict(ref, status="reused-valid", priorHarnessCommit=old["harnessCommit"],
                scope="Only earlier body/column core and full quit/reopen; not a new execution of those cases")


def verify_retained_tab_failure(identity):
    ref = identity["retained361TabFailure"]
    relative = Path(ref["reportPath"])
    if relative.is_absolute() or ".." in relative.parts or not relative.as_posix().startswith("docs/tests/"):
        raise RuntimeError("Retained failure must be preserved test evidence")
    path = HERE.parent / relative
    if sha(path) != ref["reportSha256"]:
        raise RuntimeError("Retained Tab failure report bytes differ")
    old = json.loads(path.read_text(encoding="utf-8"))
    if (old["status"] != "failed" or "last-cell Tab creates one empty fourth row" not in old.get("error", "")
            or old["native361Remaining"].get("newHostFocusSaveUndoRedoPreflightPassed") is not True):
        raise RuntimeError("No valid scoped Tab failure to retain")
    for key in ["sourceCommit", "sourceTree", "declaredVersion", "packageSha256", "executableSha256"]:
        if old["identity"][key] != identity[key]:
            raise RuntimeError("Retained failure is for a different source/package/executable")
    api = lambda route: json.loads(subprocess.check_output(["gh", "api", "repos/OpenAEC-Foundation/open-office-studio/" + route]))
    run, artifact = api(f"actions/runs/{ref['run']}"), api(f"actions/artifacts/{ref['artifactId']}")
    if (run["conclusion"] != "failure" or run["head_sha"] != ref["harnessCommit"]
            or artifact["workflow_run"]["id"] != ref["run"] or artifact["expired"]
            or artifact["digest"] != "sha256:" + ref["archiveSha256"]):
        raise RuntimeError("Retained failure immutable execution differs")
    return dict(ref, status="retained-failed", retested=False)


def run_remaining(action, launch_document, open_additional, quit_app, current_pid,
                  viewport, ready_snapshot, identity, ocr, out, report):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    proof = {"status": "running", "issue361FullAcceptance": False,
             "scope": "Remaining cell typing, last-cell Tab, native Find history and two-document history isolation",
             "checks": [], "reusedCore": verify_previous(identity),
             "limits": ["Native modal-dialog Undo not executed here", "Signed package combination requires its own binding"]}
    report["native361Remaining"] = proof
    independent = identity.get("remaining361Scope") == "find-isolation-only"
    if independent:
        if identity.get("finalSuite361Approved") is True:
            proof["scope"] = "Final signed-package native Find and two-document controls; current-package core prerequisite, Tab history separate"
            proof["historicalFailures"] = "Earlier P2 failures remain preserved; no earlier-source acceptance is reused"
        else:
            proof["retainedTabFailure"] = verify_retained_tab_failure(identity)
            proof["scope"] = "Clean independent native Find and two-document controls; failed Tab outcome retained"
    source = HERE / "proeven/mac-body-original-361.docx"
    if sha(source) != "f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1":
        raise RuntimeError("Original fixture changed")
    a, b = out / "361-remaining-A.docx", out / "361-remaining-B.docx"
    for path in [a, b]:
        path.write_bytes(source.read_bytes())
    pid = launch_document(a)
    proof["pid"] = pid

    def wait(check, label, seconds=20):
        deadline = time.monotonic() + seconds
        while True:
            value = check()
            if value:
                return value
            if time.monotonic() >= deadline:
                raise AssertionError(label)
            time.sleep(.2)

    def grid(label, expected, ready=False):
        def observe():
            state = ready_snapshot() if ready else action("snapshot")
            tables = state.get("tables", [])
            if len(tables) != 1:
                return None
            table = tables[0]
            cells = table.get("cellTexts")
            good = expected(cells) if callable(expected) else cells == expected
            return state if (good and table.get("rowEvidenceAvailable") and table.get("columnEvidenceAvailable")
                             and table.get("rows") == len(cells) and all(len(row) == table.get("columns") for row in cells)) else None
        state = wait(observe, "Native cell contents/shape did not match: " + label, 60 if ready else 20)
        proof["checks"].append({"name": label, "native": state})
        return state["tables"][0]["cellTexts"]

    def save(path, expected, label):
        before_sha, before_mtime = sha(path), path.stat().st_mtime_ns
        action("chord", "cmd-s")
        def observed():
            try:
                return (TABLE["saved_rows"](path) == expected
                        and (sha(path) != before_sha or path.stat().st_mtime_ns != before_mtime))
            except (OSError, zipfile.BadZipFile):
                return False
        wait(observed, "CommandS did not persist exact active-document cells: " + label)
        snapshot = out / (label + "-saved.docx")
        snapshot.write_bytes(path.read_bytes())
        proof["checks"].append({"name": label + " saved XML oracle", "path": str(snapshot),
                                "sha256": sha(snapshot), "cells": TABLE["saved_rows"](snapshot),
                                "beforeSha256":before_sha,"beforeMtimeNs":before_mtime,
                                "afterMtimeNs":path.stat().st_mtime_ns,"actualFileWriteObserved":True})

    def capture(label):
        folder = out / label; folder.mkdir()
        state = action("raw-snapshot")
        (folder / "raw-ax.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
        display = folder / "original-display.png"
        subprocess.run(["screencapture", "-x", str(display)], check=True, capture_output=True, timeout=15)
        image = PREFLIGHT["OBS"]["capture_original"](state, pid, folder / "original-window.png")
        proof["checks"].append({"name": label + " original pixels", "capture": image, "displaySha256": sha(display)})

    def body(word, label, all_words=False):
        point, receipt = PREFLIGHT["visible_target"](action, out / label, pid, ocr, word,
                                                     ("alpha", "beta", "omega", "delta") if all_words else ())
        proof["checks"].append({"name": label + " original pixels", "receipt": receipt})
        PREFLIGHT["click_target"](action, point)
        focus = action("snapshot").get("focusAfter", {})
        if focus.get("role") != "AXTextArea" or focus.get("description") != "Document input":
            raise PermissionError("Visible native body target did not focus Document input")

    def tab_document(path, expected):
        action("click-document-tab", path.name)
        wait(lambda: path.name in ready_snapshot().get("window", {}).get("title", ""), "Document tab did not select its own title")
        if current_pid() != pid:
            raise RuntimeError("Two documents must remain in the same owned process")
        grid(path.stem + " selected", expected, ready=True)

    def insert_right(label):
        action("click-label", "Table Design")
        focus = action("snapshot").get("focusAfter", {})
        if focus.get("role") not in ["AXButton", "AXRadioButton", "AXTab"]:
            raise PermissionError("Sentinel insertion needs genuine native ribbon focus")
        action("click-label", "Insert Column Right")
        grid(label, RIGHT)

    grid("A correct baseline", ROWS, ready=True)
    proof["viewport"] = viewport(action, out / "viewport", identity, pid)
    body("alpha", "A-before-any-input", True)
    action("type-test-character", "X")
    def inserted_x(cells):
        return (isinstance(cells, list) and len(cells) == 3 and all(len(row) == 3 for row in cells)
                and cells[0][0].count("X") == 1 and cells[0][0].replace("X", "", 1) == "alpha"
                and [cells[0][1:], *cells[1:]] == [ROWS[0][1:], *ROWS[1:]])
    typed = grid("ordinary native cell typing", inserted_x)
    save(a, typed, "A-cell-typed")
    action("chord", "cmd-z"); grid("cell typing Undo", ROWS)
    action("chord", "cmd-shift-z"); grid("cell typing Redo", typed)
    action("chord", "cmd-z"); grid("cell typing reset", ROWS)
    save(a, ROWS, "A-host-preflight-restored")
    proof["newHostFocusSaveUndoRedoPreflightPassed"] = True

    if not independent:
        body("delta", "A-before-last-cell-navigation")
        action("chord", "tab"); action("chord", "tab")
        grid("two native Tabs reach original last cell", ROWS)
        action("chord", "tab")
        empty = ROWS + [["", "", ""]]
        filled = ROWS + [["newrow", "", ""]]
        grid("last-cell Tab creates one empty fourth row", empty)
        action("type-test-text", "newrow"); grid("new row native typing", filled)
        capture("last-cell-Tab-native-typing")
        save(a, filled, "A-Tab-and-typing")
        action("chord", "cmd-z"); grid("typing Undo retains Tab-created row", empty)
        action("chord", "cmd-z"); grid("separate Tab row Undo", ROWS)
        action("chord", "cmd-shift-z"); grid("separate Tab row Redo", empty)
        action("chord", "cmd-shift-z"); grid("new-row typing Redo", filled)
        action("chord", "cmd-z"); grid("new-row typing reset", empty)
        action("chord", "cmd-z"); grid("Tab row reset", ROWS)

    if independent:
        # The initial genuine visible alpha click and the native X/XML oracle
        # already prove this first cell. Undo/Redo/reset retain actual input
        # focus; a second OCR click can be obscured by that same real caret.
        state = action("snapshot")
        focus = state.get("focusAfter", {})
        if (state.get("pid") != pid or state.get("trusted") is not True
                or state.get("applicationActive") is not True or state.get("frontmostPid") != pid
                or focus.get("role") != "AXTextArea" or focus.get("description") != "Document input"
                or len(state.get("tables", [])) != 1 or state["tables"][0].get("cellTexts") != ROWS):
            raise PermissionError("Independent Find must retain the genuine first-cell preflight focus and original cells")
        proof["checks"].append({"name": "Find reuses actual first-cell native preflight focus", "native": state})
    else:
        body("alpha", "A-before-Find-sentinel")
    insert_right("A Find sentinel column")
    action("chord", "cmd-f")
    wait(lambda: len(action("snapshot").get("findInputs", [])) == 1, "Native Find input did not appear")
    action("click-input", "Find what")
    def find_value(expected, label):
        def observe():
            state = action("snapshot"); f = state.get("focusAfter", {})
            return state if f.get("role") in ["AXTextField", "AXSearchField"] and "Find what" in [f.get("title"), f.get("description")] and f.get("value") == expected else None
        state = wait(observe, "Native Find focus/value mismatch: " + label)
        proof["checks"].append({"name": label, "native": state})
        grid(label + " document sentinel intact", RIGHT)
    find_value("", "Find empty focused input")
    action("type-test-text", "abc"); find_value("abc", "Find native typed value")
    capture("Find-native-typed")
    action("chord", "cmd-z"); find_value("", "Find owns native Undo")
    capture("Find-native-Undo")
    action("chord", "cmd-shift-z"); find_value("abc", "Find owns native Redo")
    action("chord", "cmd-z"); find_value("", "Find input reset")
    action("chord", "escape")
    wait(lambda: action("snapshot").get("focusAfter", {}).get("description") == "Document input", "Find close did not restore native document focus")
    action("chord", "cmd-z"); grid("Find close document Undo", ROWS)

    open_additional(b)
    grid("B correct baseline in same process", ROWS, ready=True)
    body("alpha", "B-before-input", True)
    insert_right("B inserted column")
    action("chord", "cmd-z"); grid("B own Undo", ROWS)
    tab_document(a, ROWS)
    action("chord", "cmd-shift-z"); grid("A own Redo while B inactive", RIGHT)
    tab_document(b, ROWS)
    action("chord", "cmd-shift-z"); grid("B own Redo while A inactive", RIGHT)
    action("chord", "cmd-z"); grid("B own reset", ROWS)
    tab_document(a, RIGHT)
    save(a, RIGHT, "A-isolated-final")
    capture("A-isolated-final")
    tab_document(b, ROWS)
    save(b, ROWS, "B-isolated-final")
    capture("B-isolated-final")
    if TABLE["saved_rows"](a) != RIGHT or TABLE["saved_rows"](b) != ROWS:
        raise AssertionError("Inactive document history/save leaked across documents")
    proof["finalDocuments"] = {"A": {"sha256": sha(a), "cells": TABLE["saved_rows"](a)},
                               "B": {"sha256": sha(b), "cells": TABLE["saved_rows"](b)}}
    quit_app()
    if sha(source) != "f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1":
        raise AssertionError("Immutable original changed")
    proof.update(status=("final-find-isolation-passed-tab-separate" if identity.get("finalSuite361Approved") is True else "find-isolation-passed-tab-retained-failed") if independent else "passed",
                 findIsolationPassed=True, sourceFixtureUnchanged=True)
    return proof
