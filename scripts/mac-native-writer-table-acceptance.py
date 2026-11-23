"""Bounded native original361 table case, with caller-owned package and lifecycle.

Requires a completed real native focus/save/Undo/reopen control preflight. A visible
original alpha target, not the hidden AX mirror, is the only body mouse target.
"""
import hashlib
from pathlib import Path
import runpy
import time
import xml.etree.ElementTree as ET
import zipfile

HERE = Path(__file__).parent
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
ROWS = [["alpha", "beta", ""], ["", "", "omega"], ["delta", "", ""]]
PREFLIGHT = runpy.run_path(str(HERE / "mac-native-writer-preflight.py"))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def saved_rows(path):
    with zipfile.ZipFile(path) as package:
        root = ET.fromstring(package.read("word/document.xml"))
    tables = root.findall(".//w:tbl", NS)
    if len(tables) != 1:
        raise AssertionError("The private original must contain exactly one table")
    return [["".join(node.text or "" for node in cell.findall(".//w:t", NS))
             for cell in row.findall("w:tc", NS)] for row in tables[0].findall("w:tr", NS)]


def run_original_table(action, launch_document, quit_app, current_pid, viewport, grid,
                       identity, ocr_binary, out, report):
    if report.get("nativeControlPreflight", {}).get("status") != "passed":
        raise PermissionError("Real native focus/save/Undo/reopen preflight must pass before table input")
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    proof = {"status": "running", "issue361FullAcceptance": False,
             "scope": "Visible original body, left/right column insert, immediate Undo/Redo, Command-save, full quit and fresh-process reopen",
             "limits": ["No full issue361 Tab/Find/two-document acceptance"], "checks": []}
    report["nativeOriginalTable"] = proof
    source = HERE / "proeven/mac-body-original-361.docx"
    expected_sha = "f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1"
    if sha(source) != expected_sha or saved_rows(source) != ROWS:
        raise RuntimeError("Original fixture bytes/content differ from their pinned source")
    document = out / "native-original-private-copy.docx"
    document.write_bytes(source.read_bytes())
    first_pid = launch_document(document)
    proof["firstPid"] = first_pid
    grid("original table before body input", 3, readiness=True)
    proof["viewport"] = viewport(action, out / "viewport", identity, first_pid)

    def target(label, pid):
        point, receipt = PREFLIGHT["visible_target"](
            action, out / label, pid, ocr_binary, "alpha", ("alpha", "beta", "omega", "delta"))
        proof["checks"].append({"name": label, "receipt": receipt})
        return point

    def click_alpha(label):
        point = target(label, first_pid)
        PREFLIGHT["click_target"](action, point)
        focus = action("snapshot").get("focusAfter", {})
        if focus.get("role") != "AXTextArea" or focus.get("description") != "Document input":
            raise PermissionError("Original visible alpha click did not focus Document input")
        proof["checks"].append({"name": label + " native focus", "focus": focus})

    click_alpha("original-before-input")
    for side in ["Left", "Right"]:
        action("click-label", "Table Design")
        before = action("snapshot")
        focus = before.get("focusAfter", {})
        if focus.get("role") not in ["AXButton", "AXRadioButton", "AXTab"]:
            raise PermissionError("Native Table Design click did not focus a ribbon control; issue361 trigger remains uncertified")
        proof["checks"].append({"name": side + " selected ribbon focus", "native": before})
        action("click-label", "Insert Column " + side)
        grid(side + " insert", 4)
        action("chord", "cmd-z")
        grid(side + " immediate Undo", 3)
        action("chord", identity.get("macRedoChord", "cmd-shift-z"))
        grid(side + " Redo", 4)
        action("chord", "cmd-z")
        grid(side + " reset", 3)
    click_alpha("original-before-persistent-insert")
    action("click-label", "Table Design")
    action("click-label", "Insert Column Right")
    grid("persistent column", 4)
    action("chord", "cmd-s")
    expected = [[row[0], "", row[1], row[2]] for row in ROWS]
    deadline = time.monotonic() + 20
    while True:
        try:
            persisted = saved_rows(document)
            if persisted == expected:
                break
        except (OSError, zipfile.BadZipFile, ET.ParseError):
            pass
        if time.monotonic() >= deadline:
            raise AssertionError("Native CommandS did not persist the exact original cells plus the inserted right column")
        time.sleep(.2)
    proof["savedCells"] = persisted
    proof["savedSha256"] = sha(document)
    quit_app()
    proof["checks"].append({"name": "native CommandQ full process exit"})
    second_pid = launch_document(document)
    if second_pid == first_pid or second_pid != current_pid():
        raise RuntimeError("Reopen must expose a fresh exact owned process")
    proof["secondPid"] = second_pid
    grid("fresh process reopened persisted table", 4, readiness=True)
    proof["reopenedViewport"] = viewport(action, out / "reopened-viewport", identity, second_pid)
    target("reopened-original-before-input", second_pid)
    if sha(document) != proof["savedSha256"] or saved_rows(document) != expected:
        raise AssertionError("Reopen changed saved bytes or table cells")
    quit_app()
    if sha(source) != expected_sha:
        raise AssertionError("Immutable original fixture changed")
    proof.update(status="core-passed", originalSourceUnchanged=True)
    return proof
