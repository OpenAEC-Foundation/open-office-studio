"""Native focus/Command-save/Undo/full-quit/reopen preflight, caller-owned lifecycle.

Only a private copy of the already readable synthetic356 control is edited.
This does not accept the original359/361 fixture or repair a failed paint.
"""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import time
import xml.etree.ElementTree as ET
import zipfile

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
HERE = Path(__file__).parent
OBS = runpy.run_path(str(HERE / "writer361-macos-ribbon-observation.py"))
TARGET = runpy.run_path(str(HERE / "mac-native-body-target.py"))["visible_body_target"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def body_text(path):
    with zipfile.ZipFile(path) as package:
        doc = ET.fromstring(package.read("word/document.xml"))
    return "".join(node.text or "" for node in doc.findall(".//w:t", NS))


def visible_target(action, out, pid, ocr_binary, text, required_words=()):
    """Capture original native pixels before OCR; never touch the editor model."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    state = action("raw-snapshot")
    window = OBS["capture_window"](state, pid)
    (out / "raw-ax.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    original = OBS["capture_original"](state, pid, out / "original-window.png")
    display_image = out / "original-display.png"
    subprocess.run(["screencapture", "-x", str(display_image)], check=True, capture_output=True, timeout=15)
    image = out / "original-no-shadow.png"
    subprocess.run(["screencapture", "-x", "-o", "-l", str(window["id"]), str(image)], check=True, capture_output=True, timeout=15)
    ocr_path = out / "ocr.json"
    subprocess.run([str(ocr_binary), str(image), str(ocr_path)], check=True, capture_output=True, timeout=30)
    ocr = json.loads(ocr_path.read_text())
    target = TARGET(ocr, state, pid, sha(image), text)
    word_witnesses = {word: TARGET(ocr, state, pid, sha(image), word) for word in required_words}
    receipt = {"nativeWindowCapture": original, "originalDisplaySha256": sha(display_image), "noShadowSha256": sha(image),
               "rawAxSha256": sha(out / "raw-ax.json"), "ocrSha256": sha(ocr_path),
               "target": target, "visibleWordWitnesses": word_witnesses, "editorInputSent": False}
    (out / "target-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return target, receipt


def click_target(action, target):
    return action("click-body-point", json.dumps(dict(target["point"], windowId=target["nativeWindow"]["id"], bounds=target["nativeWindow"]["bounds"])))


def wait_native_save_state(snapshot, pid, filename, dirty, seconds=20, clock=time.monotonic, pause=time.sleep):
    """Observe completion of input/save in native UI; never send another input."""
    start = clock()
    attempts = 0
    while True:
        state = snapshot()
        attempts += 1
        focus = state.get("focusAfter", {})
        title = state.get("window", {}).get("title", "")
        if (state.get("pid") != pid or state.get("frontmostPid") != pid
                or state.get("applicationActive") is not True
                or focus.get("role") != "AXTextArea" or focus.get("description") != "Document input"
                or not title.startswith(filename + " ")):
            raise PermissionError("Native save readiness lost the exact document/input/PID focus")
        if (" \u2022 " in title) == dirty:
            return {"native": state, "dirtyExpected": dirty, "attempts": attempts,
                    "elapsedSeconds": round(clock() - start, 3), "editorInputSent": False}
        if clock() - start >= seconds:
            raise AssertionError("Native document did not reach the expected dirty/saved UI state")
        pause(.2)


def run_preflight(action, launch_document, quit_app, current_pid, viewport, identity, ocr_binary, out, report, readiness_snapshot):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    proof = {"status": "running", "nativeOriginal359361Acceptance": False, "checks": []}
    report["nativeControlPreflight"] = proof
    source = HERE / "proeven/mac-body-positive-356.docx"
    expected_source_sha = "c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d"
    if sha(source) != expected_source_sha:
        raise RuntimeError("Synthetic356 control differs from its pinned original")
    document = out / "native-preflight-private-copy.docx"
    document.write_bytes(source.read_bytes())
    before = body_text(document)
    if "Q" in before:
        raise RuntimeError("Known preflight text must not contain its synthetic Q marker")
    # The native caret can overlap the heading's first E (Vision then reads
    # FPUB). Use exact unique words from those same unchanged headings, with
    # the existing confidence/geometry/PID checks; never fuzzy-match a line or
    # select a later screenshot to hide the caret.
    label = "EERSTE"
    control_words = ("EERSTE", "TWEEDE")

    def persisted(check, message):
        deadline = time.monotonic() + 20
        while True:
            try:
                value = body_text(document)
                if check(value):
                    return value
            except (OSError, zipfile.BadZipFile, ET.ParseError):
                pass  # Saving may atomically replace the owned file; no model action is retried.
            if time.monotonic() >= deadline:
                raise AssertionError(message)
            time.sleep(.2)

    def ready_control(label):
        # Title readiness alone can precede SDK document loading. This is the
        # existing native table mirror's read-only 2x2 fixture evidence, never a
        # body click target or evidence that any edit/save succeeded.
        started = time.monotonic()
        while True:
            state = readiness_snapshot()
            tables = state.get("tables", [])
            if (len(tables) == 1 and tables[0].get("rowEvidenceAvailable")
                    and tables[0].get("columnEvidenceAvailable")
                    and tables[0].get("rows") == 2 and tables[0].get("columns") == 2):
                proof["checks"].append({"name": label, "native": state,
                                        "readinessSeconds": round(time.monotonic() - started, 3)})
                return
            if time.monotonic() - started >= 45:
                raise PermissionError("The correct native 2x2 control document did not become ready before input")
            time.sleep(.25)

    first_pid = launch_document(document)
    proof["firstPid"] = first_pid
    ready_control("native control loaded before viewport and body input")
    proof["initialViewport"] = viewport(action, out / "initial-viewport", identity, first_pid)
    target, receipt = visible_target(action, out / "before-input", first_pid, ocr_binary, label, control_words)
    proof["checks"].append({"name": "readable original control before body input", "receipt": receipt})
    click_target(action, target)
    focused = action("snapshot").get("focusAfter", {})
    if focused.get("role") != "AXTextArea" or focused.get("description") != "Document input":
        raise PermissionError("Genuine visible body click did not focus the native document input")
    proof["checks"].append({"name": "native body input focused", "focus": focused})
    def ui_ready(dirty, label):
        if identity.get("nativePreflightUiReadinessRequired") is True:
            evidence = wait_native_save_state(readiness_snapshot, first_pid, document.name, dirty)
            proof["checks"].append({"name": label, "readiness": evidence})

    action("type-test-character", "Q")
    ui_ready(True, "native Q completed before the single CommandS")
    action("chord", "cmd-s")
    edited = persisted(lambda value: value.count("Q") == 1 and value.replace("Q", "", 1) == before,
                       "Native Q input + CommandS did not persist exactly the expected text insertion")
    proof["checks"].append({"name": "native Q and CommandS independently persisted", "savedSha256": sha(document), "persistedText": edited})
    ui_ready(False, "native saved UI completed before Undo")
    action("chord", "cmd-z")
    ui_ready(True, "native Undo completed before the single CommandS")
    action("chord", "cmd-s")
    persisted(lambda value: value == before, "Native CommandZ + CommandS did not restore the control text")
    restored_sha = sha(document)
    proof["checks"].append({"name": "native CommandZ and CommandS restored exact source text", "savedSha256": restored_sha})
    ui_ready(False, "native restored save completed before full quit")
    quit_app()
    second_pid = launch_document(document)
    if second_pid == first_pid or second_pid != current_pid():
        raise RuntimeError("Preflight reopen must be a new exact owned process")
    proof["secondPid"] = second_pid
    ready_control("saved native control loaded in the fresh process")
    proof["reopenedViewport"] = viewport(action, out / "reopened-viewport", identity, second_pid)
    _, receipt = visible_target(action, out / "reopened-before-input", second_pid, ocr_binary, label, control_words)
    if sha(document) != restored_sha or body_text(document) != before:
        raise AssertionError("Fresh-process reopen changed saved bytes or restored source text")
    proof["checks"].append({"name": "fresh PID reopened saved original control without input", "receipt": receipt, "savedSha256": restored_sha})
    quit_app()
    proof["sourceControlUnchanged"] = sha(source) == expected_source_sha
    if not proof["sourceControlUnchanged"]:
        raise AssertionError("Immutable control was changed")
    proof["status"] = "passed"
    proof["savedPrivateCopy"] = str(document)
    return proof
