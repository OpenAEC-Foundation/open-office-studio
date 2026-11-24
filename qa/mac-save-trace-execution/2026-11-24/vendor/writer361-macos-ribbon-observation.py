"""Bounded #362/#363 AX and original-window evidence, never full acceptance.

Called after #361 core in the same caller-owned verified app. No app lifecycle,
JavaScript, privacy changes, document edits, image transforms or window resizing.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys

RIBBON_TABS = {"Home", "Insert", "Format", "Header & Footer", "Preferences", "Styles",
               "Layout", "Review", "View", "Tools", "Table Design"}


def value(node, attribute):
    item = node.get("attributes", {}).get(attribute, {})
    return item.get("value") if item.get("status") == "available" else None


def original_tab(snapshot):
    candidates = []
    for node in snapshot.get("rawNodes", []):
        name = value(node, "AXTitle") or value(node, "AXDescription")
        if name in RIBBON_TABS and value(node, "AXRole") in {"AXRadioButton", "AXTab", "AXButton"} and (value(node, "AXSelected") is True or value(node, "AXValue") == 1):
            candidates.append(name)
    return candidates[0] if len(candidates) == 1 else None


def capture_window(snapshot, pid):
    if snapshot.get("screenCaptureAuthorized") is not True:
        raise PermissionError("Screen Recording preflight is unavailable/false; no prompt or permission change attempted")
    windows = [w for w in snapshot.get("ownedScreenWindows", [])
               if w.get("pid") == pid and type(w.get("id")) is int and w["id"] > 0]
    if len(windows) > 1:
        # Native Find can expose small untitled auxiliary CG windows. Bind the
        # main capture to the actual unique AXWindow, never to the largest or
        # first arbitrary window. Preserve all candidates in the original raw.
        roots = [n for n in snapshot.get("rawNodes", []) if n.get("depth") == 0 and value(n, "AXRole") == "AXWindow"]
        if len(roots) != 1 or snapshot.get("pid") != pid or snapshot.get("trusted") is not True:
            raise PermissionError("Multiple CG windows require one verified owned AXWindow")
        title, position, size = value(roots[0], "AXTitle"), value(roots[0], "AXPosition"), value(roots[0], "AXSize")
        if not isinstance(title, str) or not title or not isinstance(position, dict) or not isinstance(size, dict):
            raise PermissionError("Main AX title/geometry unavailable")
        expected = {"X": position.get("x"), "Y": position.get("y"), "Width": size.get("width"), "Height": size.get("height")}
        if not all(type(v) in [int, float] and math.isfinite(v) for v in expected.values()):
            raise PermissionError("Finite main AX geometry required")
        windows = [w for w in windows if w.get("title") == title and isinstance(w.get("bounds"), dict)
                   and all(type(w["bounds"].get(k)) in [int, float] and math.isfinite(w["bounds"][k])
                           and abs(w["bounds"][k]-v) < .5 for k, v in expected.items())]
    if len(windows) != 1:
        raise PermissionError("Expected one on-screen window belonging to the exact verified PID")
    bounds = windows[0].get("bounds")
    if not isinstance(bounds, dict) or not all(type(bounds.get(key)) in [int, float] and math.isfinite(bounds[key]) for key in ["X", "Y", "Width", "Height"]) or bounds["Width"] <= 1 or bounds["Height"] <= 1:
        raise PermissionError("Actual native window bounds are unavailable")
    return windows[0]


def capture_original(snapshot, pid, path):
    window = capture_window(snapshot, pid)
    if path.exists():
        raise RuntimeError("Refusing to overwrite original native evidence")
    result = subprocess.run(["screencapture", "-x", "-l", str(window["id"]), str(path)],
                            capture_output=True, timeout=15)
    if result.returncode or not path.exists():
        raise PermissionError("Original owned-window capture unavailable: " + result.stderr.decode("utf-8", errors="replace")[-500:])
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise RuntimeError("Capture did not produce an original PNG")
    width, height = struct.unpack(">II", raw[16:24])
    return {"status": "captured", "path": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
            "pixelWidth": width, "pixelHeight": height, "nativeWindow": window,
            "unaltered": True, "captureProcessExited": True,
            "originalOwnedWindowCount": len(snapshot.get("ownedScreenWindows", [])),
            "selectionPolicy": "unique PID window, or exact unique AX main-window title and geometry among auxiliary CG windows"}


def collect_mac_ribbon_observations(action, out, identity, pid):
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("OOS_361_EXECUTE") != "1" or identity.get("executionApproved") is not True:
        raise RuntimeError("This observation needs the caller's released disposable native macOS session")
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    report = {"nativePass": False, "scope": "Bounded raw AX and original-window observations only",
              "identity": identity, "pid": pid, "sections": {}, "restoration": {},
              "limits": ["No full focus or disabled matrix", "Only actual current viewport; verified resize setter is absent, narrow is unavailable", "AX metadata cannot prove pixel clipping or text glyph legibility; inspect original captures", "Unavailable title/help/Normal fields remain unavailable; no browser/Linux substitution"]}
    previous = None
    try:
        before = action("raw-snapshot")
        previous = original_tab(before)
        (out / "before-raw-ax.json").write_text(json.dumps(before, indent=2), encoding="utf-8")
        report["initialWindow"] = before.get("window")
        report["initialScreenWindows"] = before.get("ownedScreenWindows")
        report["resizeCapability"] = before.get("resizeCapability", {"status": "unavailable"})
        report["narrowViewport"] = "unavailable; no verified setter implemented or invoked"
        for issue, tab in [(362, "Table Design"), (363, "Styles")]:
            section = {"status": "unavailable", "tab": tab}
            report["sections"][str(issue)] = section
            try:
                action("ax-press-label", tab)
                snapshot = action("raw-snapshot")
                raw_path = out / f"{issue}-raw-ax.json"
                raw_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
                selected = original_tab(snapshot)
                section.update(status="observed" if selected == tab and snapshot.get("rawNodes") else "unconfirmed",
                               selectedTabObserved=selected, rawNodeCount=len(snapshot.get("rawNodes", [])), rawAx=str(raw_path), rawAxSha256=hashlib.sha256(raw_path.read_bytes()).hexdigest(),
                               bounded=snapshot.get("bounded"), childListsTruncated=snapshot.get("childListsTruncated", False), depthBoundReached=snapshot.get("depthBoundReached", False),
                               actualScreenWindows=snapshot.get("ownedScreenWindows"))
                try:
                    section["originalWindowCapture"] = capture_original(snapshot, pid, out / f"{issue}-actual-window.png")
                except (PermissionError, RuntimeError, subprocess.TimeoutExpired) as error:
                    section["originalWindowCapture"] = {"status": "unavailable", "reason": str(error)}
                if issue == 363:
                    strings = json.loads(Path("src/i18n/locales/en/writer.json").read_text(encoding="utf-8"))["styles"]
                    expected = [strings["shortcutPane"], strings["pane"]["newStyle"], strings["update"]["title"].replace("{{name}}", "Normal"), strings["editor"]["modifyTitle"].replace("{{name}}", "Normal"), strings["pane"]["styleSet"]]
                    observations = []
                    for label in expected:
                        matches = [node for node in snapshot.get("rawNodes", []) if value(node, "AXRole") == "AXButton" and label in [value(node, "AXTitle"), value(node, "AXDescription")]]
                        observations.append({"expectedAccessibleName": label, "status": "observed" if len(matches) == 1 else "unavailable", "matches": matches})
                    section["fiveManagementControls"] = observations
                    section["normalInterpolation"] = "observed in native labels" if all(any("Normal" in str(value(node, key) or "") for node in item["matches"] for key in ["AXTitle", "AXDescription", "AXHelp"]) for item in observations[2:4]) else "unavailable; inspect raw AX and original screenshot"
                else:
                    section["requestedRegions"] = ["Delete", "Alignment", "Data"]
                    section["regionEvidence"] = "Raw native bounds/labels and unmodified full-window capture; no pixel-fit pass inferred"
            except Exception as error:
                section["reason"] = str(error)
    except Exception as error:
        report["reason"] = str(error)
    finally:
        if previous:
            try:
                action("ax-press-label", previous)
                restored = action("raw-snapshot")
                report["restoration"]["tab"] = "confirmed" if original_tab(restored) == previous else "unconfirmed"
            except Exception as error:
                report["restoration"]["tab"] = "unavailable: " + str(error)
        else:
            report["restoration"]["tab"] = "unavailable; initial selected native ribbon tab was not uniquely exposed"
        report["restoration"]["windowSize"] = "No setter called; actual final native bounds recorded separately"
        try:
            final = action("raw-snapshot")
            report["restoration"]["finalScreenWindows"] = final.get("ownedScreenWindows")
            (out / "after-raw-ax.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
        except Exception as error:
            report["restoration"]["finalScreenWindows"] = "unavailable: " + str(error)
        report["captureCleanup"] = "One-shot screencapture processes only; no persistent recording session created"
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
