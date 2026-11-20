"""#363-only disposable macOS AX capability and ordinary UI EN→NL→EN probe.

Run from the clean APP checkout; this external harness and its Swift sibling do
not rebuild or mutate the application source. No privacy/defaults/model setters.
"""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import plistlib
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time

APP = "7f126f4b8e5269a54388cf78c48c78d2acc0daa1"
TREE = "8bc608488760e48919d7fb4e72a42569175b52a4"
PINNED = {"sourceCommit": APP, "sourceTree": TREE, "artifactRun": 44715026752,
          "artifactId": 14621620223,
          "packageSha256": "80f10634da0af9199a8a7c561a59a231b76d9787a40d110d981e0d1b3db82df0",
          "executableSha256": "46bf58304108a35d04b1e140a116a7158c38c3e4ddecd9f1e720cd14839cd967"}
NAMES = {"en": ["Styles pane", "New Style…", "Update Normal", "Modify Style: Normal", "Style Set…"],
         "nl": ["Stijlenvenster", "Nieuwe stijl…", "Standaard bijwerken", "Stijl wijzigen: Standaard", "Stijlset…"]}
TABS = {"Home", "Start", "Insert", "Invoegen", "Format", "Opmaak", "Header & Footer", "Kop- en voettekst", "References", "Verwijzingen", "Styles", "Stijlen", "Layout", "Indeling", "Review", "Controleren", "View", "Beeld", "Tools", "Extra"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def value(node, key):
    item = node.get("attributes", {}).get(key, {})
    return item.get("value") if item.get("status") == "available" and not item.get("truncated") else None


def actual_window(snapshot):
    windows = snapshot.get("ownedScreenWindows", [])
    if len(windows) != 1 or type(windows[0].get("id")) is not int or windows[0]["id"] <= 0:
        raise PermissionError("One actual owned native window required")
    bounds = windows[0].get("bounds", {})
    if not all(type(bounds.get(k)) in (int, float) and math.isfinite(bounds[k]) for k in ("X", "Y", "Width", "Height")) or min(bounds["Width"], bounds["Height"]) <= 1:
        raise PermissionError("Actual native bounds unavailable")
    return windows[0]


def geometry(node, snapshot, zone=None):
    p, s = value(node, "AXPosition"), value(node, "AXSize")
    if not isinstance(p, dict) or not isinstance(s, dict):
        return None
    numbers = [p.get("x"), p.get("y"), s.get("width"), s.get("height")]
    if not all(type(n) in (int, float) and math.isfinite(n) for n in numbers):
        return None
    x, y, width, height = numbers
    w = actual_window(snapshot)["bounds"]
    if width <= 8 or height < 12 or x < w["X"] or y < w["Y"] or x+width > w["X"]+w["Width"]+1 or y+height > w["Y"]+w["Height"]+1:
        return None
    if zone == "ribbon" and y+height/2 > w["Y"]+w["Height"]*.28:
        return None
    if zone == "dialog" and y+height/2 < w["Y"]+w["Height"]*.2:
        return None
    return dict(x=x, y=y, width=width, height=height)


def select_control(snapshot, labels, roles, zone=None):
    candidates = []
    for node in snapshot.get("rawNodes", []):
        label = next((label for label in labels if label in (value(node, "AXTitle"), value(node, "AXDescription"))), None)
        box = geometry(node, snapshot, zone)
        if (label and box and value(node, "AXRole") in roles and value(node, "AXEnabled") is True
                and "AXPress" in node.get("attributes", {}).get("actions", {}).get("value", [])):
            candidates.append({"node": node, "label": label, "role": value(node, "AXRole"), **box})
    if len(candidates) != 1:
        raise PermissionError(f"Native control unavailable/ambiguous: {labels}; {len(candidates)} eligible matches")
    return candidates[0]


def style_tab(snapshot, language):
    if language not in NAMES:
        raise PermissionError("Unsupported UI language; no forced fallback state")
    return select_control(snapshot, ["Styles" if language == "en" else "Stijlen"], {"AXRadioButton", "AXTab"}, "ribbon")


def selected_tab(snapshot):
    selected = [n for n in snapshot.get("rawNodes", []) if value(n, "AXRole") in {"AXRadioButton", "AXTab"}
                and (value(n, "AXTitle") or value(n, "AXDescription")) in TABS
                and geometry(n, snapshot, "ribbon")
                and (value(n, "AXSelected") is True or value(n, "AXValue") == 1)]
    if len(selected) != 1:
        raise PermissionError("Initial selected native ribbon tab is not unique")
    return value(selected[0], "AXTitle") or value(selected[0], "AXDescription")


def style_controls(snapshot, language):
    if language not in NAMES:
        raise PermissionError("Unsupported UI language")
    controls = []
    for name in NAMES[language]:
        control = select_control(snapshot, [name], {"AXButton"}, "ribbon")
        attributes = control["node"]["attributes"]
        for key in ("AXTitle", "AXDescription", "AXHelp"):
            text = value(control["node"], key)
            if not isinstance(text, str) or not text.strip() or any(raw in text for raw in ("styles.", "{{", "writer:")):
                raise PermissionError(f"{name} {key} unavailable, truncated or unresolved")
        controls.append({"expectedName": name, "index": control["node"]["index"], "attributes": attributes, "geometry": {k: control[k] for k in ("x", "y", "width", "height")}})
    style = "Normal" if language == "en" else "Standaard"
    if not all(style in value(c["node"], "AXHelp") for c in [select_control(snapshot, [NAMES[language][i]], {"AXButton"}, "ribbon") for i in (2, 3)]):
        raise PermissionError("Update/modify help must interpolate the same native style name")
    return controls


def management_toggle(snapshot, language):
    label = "Styles" if language == "en" else "Stijlen"
    candidates = []
    for n in snapshot.get("rawNodes", []):
        if value(n, "AXRole") == "AXButton" and label in (value(n, "AXTitle"), value(n, "AXDescription")) and geometry(n, snapshot, "ribbon"):
            candidates.append(n)
    if len(candidates) == 1:
        return select_control({**snapshot, "rawNodes": candidates}, [label], {"AXButton"}, "ribbon")
    # Both same-caption groups can be collapsed. Native tree ancestry, rather
    # than a guessed left/right position, must bind this toggle to management.
    nodes = {n["index"]: n for n in snapshot.get("rawNodes", [])}
    def ancestors(n):
        result = set()
        while n.get("parent") in nodes and n["parent"] not in result:
            result.add(n["parent"]); n = nodes[n["parent"]]
        return result
    relevant = [n for n in nodes.values() if value(n, "AXRole") == "AXButton" and any(name in (value(n, "AXTitle"), value(n, "AXDescription")) for name in NAMES[language])]
    groups = [n for n in nodes.values() if value(n, "AXRole") == "AXGroup" and label in (value(n, "AXTitle"), value(n, "AXDescription"))
              and len(relevant) == 5 and all(n["index"] in ancestors(c) for c in relevant)]
    matched = [c for c in candidates if any(g["index"] in ancestors(c) for g in groups)]
    if len(matched) != 1:
        raise PermissionError("Collapsed management toggle cannot be uniquely bound to five native controls")
    selected = select_control({**snapshot, "rawNodes": matched}, [label], {"AXButton"}, "ribbon")
    return selected


def preserve_errors(body, cleanups):
    errors = []
    result = None
    try:
        result = body()
    except Exception as error:
        errors.append(error)
    for cleanup in cleanups:
        try:
            cleanup()
        except Exception as error:
            errors.append(error)
    if len(errors) == 1:
        raise errors[0]
    if errors:
        raise ExceptionGroup("#363 native operation and/or cleanup failed", errors)
    return result


def error_info(error):
    result = {"type": type(error).__name__, "message": str(error)}
    if isinstance(error, ExceptionGroup):
        result["errors"] = [error_info(e) for e in error.exceptions]
    return result


class Probe:
    def __init__(self, identity, output, phase, stop):
        self.identity, self.out, self.phase, self.stop = identity, Path(output).resolve(), phase, stop
        self.helper = self.out / "writer363-ax"
        self.mount = self.out / "mount"
        self.program = self.app = self.container = self.pid = None
        self.mounted = self.profile_owned = self.dialog_open = self.language_may_have_changed = False
        self.previous = None
        self.counter = 0
        self.cleanup_stop = None
        self.profile = Path.home() / "Library/Application Support/org.openaec.office-studio"
        self.report = {"issue": 363, "phase": phase, "status": "failed", "nativePass": False, "identity": identity,
                       "harnessCommit": subprocess.check_output(["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "HEAD"], text=True).strip(),
                       "callerSha256": sha(__file__), "labels": [], "cleanup": {},
                       "limits": ["Only current English/Dutch labels and normal UI language route", "No body/grid/alpha preflight, editor bridge, locale injection, hover/width/disabled/focus/command matrix", "One ordinary Maximize; actual bounds retained; no AX window-size setter", "One-shot original captures only; no persistent recording session"]}

    def check(self, cleanup=False):
        stop = self.cleanup_stop if cleanup else self.stop
        if stop is None or datetime.now(timezone.utc) >= stop:
            raise TimeoutError("Native deadline reached; bounded independent cleanup remains required")

    def run_command(self, args, timeout=30, cleanup=False, **kwargs):
        self.check(cleanup)
        remaining = ((self.cleanup_stop if cleanup else self.stop)-datetime.now(timezone.utc)).total_seconds()
        return subprocess.run(args, check=True, timeout=max(.1, min(timeout, remaining)), **kwargs)

    def owned(self):
        if self.program is None:
            return []
        text = subprocess.check_output(["ps", "-axww", "-o", "pid=", "-o", "comm="], text=True, timeout=5)
        return [int(parts[0]) for line in text.splitlines() if len(parts := line.strip().split(None, 1)) == 2 and Path(parts[1]).resolve() == self.program]

    def wait(self, check, label, seconds=20, cleanup=False):
        end = time.monotonic()+seconds
        while True:
            self.check(cleanup)
            result = check()
            if result:
                return result
            if time.monotonic() >= end:
                raise PermissionError(label)
            time.sleep(.2)

    def action(self, action="snapshot", spec=None, cleanup=False):
        self.check(cleanup)
        if self.pid not in self.owned() or sha(self.program) != self.identity["executableSha256"]:
            raise RuntimeError("Exact owned PID/executable changed; refusing native input")
        self.counter += 1
        result = self.run_command([str(self.helper), str(self.pid), action, json.dumps(spec) if isinstance(spec, dict) else spec or ""], 20, cleanup, capture_output=True, text=True)
        snapshot = json.loads(result.stdout)
        path = self.out / f"action-{self.counter:03d}-{action}.json"
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        if snapshot.get("status") == "blocked":
            raise PermissionError(snapshot.get("reason", "Native capability unavailable"))
        return snapshot

    def press(self, kind, selector, cleanup=False):
        snapshot = self.action(cleanup=cleanup)
        selected = selector(snapshot)
        spec = {"kind": kind, **{k: selected[k] for k in ("label", "role", "x", "y", "width", "height")}}
        self.action("press", spec, cleanup)

    def capture(self, label, snapshot):
        self.check()
        if snapshot.get("screenCaptureAuthorized") is not True:
            raise PermissionError("Screen capture preflight unavailable; no privacy changes")
        window = actual_window(snapshot)
        if window.get("pid") != self.pid:
            raise RuntimeError("Capture window not owned by exact PID")
        path = self.out / (label+".png")
        if path.exists():
            raise RuntimeError("Original screenshot path already exists")
        self.run_command(["screencapture", "-x", "-l", str(window["id"]), str(path)], 15, capture_output=True)
        raw = path.read_bytes()
        if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
            raise RuntimeError("Original native capture is not PNG")
        width, height = struct.unpack(">II", raw[16:24])
        return {"path": str(path), "sha256": sha(path), "pixelWidth": width, "pixelHeight": height, "nativeWindow": window, "unaltered": True, "captureProcessExited": True}

    def evidence(self, label):
        snapshot = self.action()
        (self.out / (label+"-raw-ax.json")).write_text(json.dumps(snapshot, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        capture = self.capture(label+"-original-window", snapshot)
        return snapshot, capture

    def labels(self, language, label):
        self.press("ribbon-tab", lambda state: style_tab(state, language))
        self.wait(lambda: self.tab_is("Styles" if language == "en" else "Stijlen"), "Native Styles tab did not become selected")
        snapshot = self.action()
        try:
            for name in NAMES[language]:
                select_control(snapshot, [name], {"AXButton"}, "ribbon")
        except PermissionError:
            self.press("management-toggle", lambda state: management_toggle(state, language))
        snapshot, capture = self.evidence(label)
        controls = style_controls(snapshot, language)
        self.report["labels"].append({"language": language, "status": "observed", "fiveManagementControls": controls, "capture": capture,
                                      "childListsTruncated": snapshot.get("childListsTruncated", False), "bounded": snapshot.get("bounded", False)})

    def tab_is(self, label, cleanup=False):
        try:
            return selected_tab(self.action(cleanup=cleanup)) == label
        except PermissionError:
            return False

    def open_settings(self, language, cleanup=False):
        self.dialog_open = True
        self.press("settings-open", lambda s: select_control(s, ["Settings" if language == "en" else "Instellingen"], {"AXButton"}, "ribbon"), cleanup)
        self.wait(lambda: self.language_trigger(language, cleanup), "Actual native Settings language control unavailable", cleanup=cleanup)

    def language_trigger(self, language, cleanup=False):
        try:
            label = "Language: English" if language == "en" else "Taal: Nederlands"
            return select_control(self.action(cleanup=cleanup), [label], {"AXButton", "AXPopUpButton"}, "dialog")
        except PermissionError:
            return None

    def cancel_settings(self, cleanup=False):
        self.action("chord", "escape", cleanup)
        snapshot = self.action(cleanup=cleanup)
        try:
            select_control(snapshot, ["Cancel", "Annuleren"], {"AXButton"}, "dialog")
        except PermissionError:
            # Escape can have closed Settings itself rather than just its menu.
            selected_tab(snapshot)
        else:
            self.press("settings-cancel", lambda s: select_control(s, ["Cancel", "Annuleren"], {"AXButton"}, "dialog"), cleanup)
        self.dialog_open = False

    def change_language(self, current, target, cleanup=False):
        self.open_settings(current, cleanup)
        if not cleanup:
            _, capture = self.evidence("settings-"+current+"-to-"+target)
            self.report.setdefault("settingsCapabilities", []).append(capture)
        trigger = "Language: English" if current == "en" else "Taal: Nederlands"
        self.press("language-trigger", lambda s: select_control(s, [trigger], {"AXButton", "AXPopUpButton"}, "dialog"), cleanup)
        if not cleanup:
            self.evidence("language-menu-"+current+"-to-"+target)
        options = ["Nederlands", "Nederlands Dutch", "Nederlands Nederlands"] if target == "nl" else ["English", "English English", "English Engels"]
        self.language_may_have_changed = True
        self.press("language-option", lambda s: select_control(s, options, {"AXMenuItem", "AXButton", "AXRow"}, "dialog"), cleanup)
        self.wait(lambda: self.language_trigger(target, cleanup), "Native UI preview language change not observed", cleanup=cleanup)
        self.press("settings-save", lambda s: select_control(s, ["Opslaan" if target == "nl" else "Save"], {"AXButton"}, "dialog"), cleanup)
        self.dialog_open = False
        self.wait(lambda: self.tab_is("Stijlen" if target == "nl" else "Styles", cleanup), "Native UI language did not reach ribbon", cleanup=cleanup)
        if target == "en":
            self.language_may_have_changed = False

    def body(self):
        self.check()
        source = Path(__file__).with_name("writer363-macos-ax.swift")
        with (self.out / "swift-compile.log").open("wb") as log:
            self.run_command(["xcrun", "swiftc", str(source), "-o", str(self.helper)], 120, stdout=log, stderr=subprocess.STDOUT)
        self.report.update(helperCompiledBeforeAppLaunch=True, helperSourceSha256=sha(source), helperBinarySha256=sha(self.helper))
        package = Path(self.identity["packagePath"]).resolve(strict=True)
        if sha(package) != self.identity["packageSha256"]:
            raise RuntimeError("Canonical DMG bytes differ")
        if self.profile.exists() or self.profile.is_symlink():
            raise PermissionError("App-specific runner profile already exists; refusing another owner")
        self.mount.mkdir()
        self.mounted = True
        self.run_command(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(self.mount), str(package)], 60, capture_output=True)
        apps = list(self.mount.glob("*.app"))
        if len(apps) != 1:
            raise RuntimeError("Canonical DMG must expose exactly one app")
        info = plistlib.loads((apps[0] / "Contents/Info.plist").read_bytes())
        if info.get("CFBundleIdentifier") != "org.openaec.office-studio":
            raise RuntimeError("Unexpected app bundle")
        payload = apps[0] / "Contents/MacOS" / info["CFBundleExecutable"]
        if sha(payload) != self.identity["executableSha256"]:
            raise RuntimeError("Read-only DMG executable hash differs")
        runner_temp = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
        self.container = Path(tempfile.mkdtemp(prefix="writer363-owned-app-", dir=runner_temp))
        self.app = self.container / apps[0].name
        shutil.copytree(apps[0], self.app, symlinks=True)
        self.program = (self.app / "Contents/MacOS" / info["CFBundleExecutable"]).resolve(strict=True)
        if sha(self.program) != self.identity["executableSha256"]:
            raise RuntimeError("Copied executable differs from canonical DMG")
        self.run_command(["hdiutil", "detach", str(self.mount)], capture_output=True)
        self.mounted = False
        self.profile.mkdir(parents=True, exist_ok=False)
        self.profile_owned = True
        (self.profile / "voorkeuren.json").write_text(json.dumps({"taal": "en", "updates": {"automatisch": False}}), encoding="utf-8")
        self.report["profile"] = {"path": str(self.profile), "createdByThisProbe": True, "initialLanguage": "en", "scope": "App-specific fresh disposable CI config; no OS/defaults/HOME changes"}
        fixture = self.out / "writer363-normal.docx"
        shutil.copyfile("public/templates/nieuw.docx", fixture)
        self.report["fixture"] = {"path": str(fixture), "sha256": sha(fixture), "kind": "Unmodified built-in DOCX; no grid/alpha/body target requirement"}
        if self.owned():
            raise RuntimeError("Owned application already running")
        self.run_command(["open", "-a", str(self.app), str(fixture)], 20)
        self.pid = self.wait(lambda: self.owned()[0] if len(self.owned()) == 1 else None, "Exactly one copied native app PID required", 60)
        self.report.update(pid=self.pid, executablePath=str(self.program))
        self.previous = self.wait(lambda: self.initial_tab(), "Initial ribbon did not become ready", 60)
        self.report["originalTab"] = self.previous
        self.press("maximize", lambda s: select_control(s, ["Maximize"], {"AXButton"}, "ribbon"))
        self.wait(lambda: self.maximized(), "Ordinary native Maximize did not expose Restore down/actual viewport")
        self.labels("en", "English-before")
        if self.phase == "capability":
            self.open_settings("en")
            self.evidence("Settings-language-capability")
            self.press("language-trigger", lambda s: select_control(s, ["Language: English"], {"AXButton", "AXPopUpButton"}, "dialog"))
            self.evidence("Settings-language-options-capability")
            self.cancel_settings()
        else:
            self.change_language("en", "nl")
            self.labels("nl", "Dutch")
            self.change_language("nl", "en")
            self.labels("en", "English-restored")
            self.report["uiLanguageRestoration"] = "Observed EN→NL→EN via normal Settings UI; app-specific persisted language checked during cleanup"

    def initial_tab(self):
        try:
            return selected_tab(self.action())
        except PermissionError:
            return None

    def maximized(self):
        snapshot = self.action()
        try:
            select_control(snapshot, ["Restore down"], {"AXButton"}, "ribbon")
            w, d = actual_window(snapshot)["bounds"], snapshot["mainDisplay"]["bounds"]
            fitted = w["X"] >= d["X"]-1 and w["Y"] >= d["Y"]-1 and w["X"]+w["Width"] <= d["X"]+d["Width"]+1 and w["Y"]+w["Height"] <= d["Y"]+d["Height"]+1
            if fitted:
                self.report["maximizedActualWindow"] = actual_window(snapshot)
            return fitted
        except PermissionError:
            return False

    def restore(self):
        self.cleanup_stop = datetime.now(timezone.utc)+timedelta(seconds=45)
        if not self.pid or self.pid not in self.owned():
            return
        if self.dialog_open:
            self.cancel_settings(True)
        if self.language_may_have_changed:
            state = self.action(cleanup=True)
            if any(value(n, "AXTitle") == "Stijlen" for n in state.get("rawNodes", [])):
                self.change_language("nl", "en", True)
            else:
                style_tab(state, "en")
                self.language_may_have_changed = False
        if self.previous:
            self.press("ribbon-tab", lambda s: select_control(s, [self.previous], {"AXRadioButton", "AXTab"}, "ribbon"), True)
            self.wait(lambda: self.tab_is(self.previous, True), "Original ribbon tab restoration failed", cleanup=True)
            self.report["cleanup"]["originalTabRestored"] = True
        preferences = json.loads((self.profile / "voorkeuren.json").read_text(encoding="utf-8"))
        if preferences.get("taal") != "en":
            raise RuntimeError("App-specific original English preference was not restored")
        self.report["cleanup"]["originalLanguageRestored"] = True

    def close(self):
        if self.cleanup_stop is None:
            self.cleanup_stop = datetime.now(timezone.utc)+timedelta(seconds=20)
        errors = []
        if self.pid and self.pid in self.owned():
            try:
                self.action("chord", "cmd-q", True)
                self.wait(lambda: not self.owned(), "Owned app did not quit normally", 10, True)
                self.report["cleanup"]["normalQuit"] = True
            except Exception as error:
                errors.append(error)
        for pid in self.owned():
            try:
                os.kill(pid, signal.SIGTERM)
                self.report["cleanup"]["forcedTerminationRequired"] = True
            except ProcessLookupError:
                pass
        end = time.monotonic()+5
        while self.owned() and time.monotonic() < end:
            time.sleep(.2)
        self.report["cleanup"]["ownedAppClosed"] = not self.owned()
        if self.owned():
            errors.append(RuntimeError("Owned app remains alive; preserving its resources"))
        if errors:
            raise ExceptionGroup("App closure errors", errors)

    def detach(self):
        if self.mounted:
            result = subprocess.run(["hdiutil", "detach", str(self.mount)], capture_output=True, timeout=20)
            self.report["cleanup"]["mountDetached"] = result.returncode == 0
            if result.returncode:
                raise RuntimeError("Owned DMG mount could not be detached")
            self.mounted = False
        else:
            self.report["cleanup"]["mountDetached"] = True

    def remove_profile(self):
        if self.profile_owned:
            if self.owned() or self.profile.is_symlink() or self.profile.resolve() != Path.home().resolve() / "Library/Application Support/org.openaec.office-studio":
                raise RuntimeError("Unsafe owned-profile cleanup target or live owned process")
            shutil.rmtree(self.profile)
            self.report["cleanup"]["explicitOwnedProfileRemoved"] = not self.profile.exists()

    def remove_container(self):
        if self.container:
            if self.owned() or self.container.is_symlink() or self.container.resolve().parent != Path(os.environ["RUNNER_TEMP"]).resolve() or not self.container.name.startswith("writer363-owned-app-"):
                raise RuntimeError("Unsafe owned-app cleanup target or live process")
            shutil.rmtree(self.container)
            self.report["cleanup"]["ownedAppContainerRemoved"] = not self.container.exists()

    def run(self):
        self.out.mkdir(parents=True, exist_ok=False)
        try:
            preserve_errors(self.body, [self.restore, self.close, self.detach, self.remove_profile, self.remove_container])
            languages = [entry["language"] for entry in self.report["labels"]]
            if languages != (["en"] if self.phase == "capability" else ["en", "nl", "en"]):
                raise RuntimeError("Missing required actual native language results")
            required_cleanup = ("originalTabRestored", "originalLanguageRestored", "normalQuit", "ownedAppClosed", "mountDetached", "explicitOwnedProfileRemoved", "ownedAppContainerRemoved")
            if any(self.report["cleanup"].get(key) is not True for key in required_cleanup):
                raise RuntimeError("Native acceptance requires confirmed preference/tab restoration and all owned cleanup")
            self.report["status"] = "capability-observed" if self.phase == "capability" else "passed"
            self.report["nativePass"] = self.phase == "ui-language"
        except Exception as error:
            self.report["status"] = "unavailable" if isinstance(error, PermissionError) else "failed"
            self.report["error"] = error_info(error)
        self.report["cleanup"]["recordingSessionCreated"] = False
        self.report["acceptance"] = "#363 labels/UI-language only, not whole application or other issue acceptance"
        (self.out / "report.json").write_text(json.dumps(self.report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        return self.report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identity", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--phase", choices=["capability", "ui-language"], default="capability")
    args = parser.parse_args()
    identity = json.loads(args.identity.read_text(encoding="utf-8"))
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("OOS_363_EXECUTE") != "1" or identity.get("executionApproved") is not True:
        raise RuntimeError("Explicitly released disposable macOS CI only")
    for key, expected in PINNED.items():
        if identity.get(key) != expected:
            raise RuntimeError("Pinned I3 canonical identity differs: "+key)
    git = lambda *a: subprocess.check_output(["git", *a], text=True).strip()
    if git("rev-parse", "HEAD") != APP or git("rev-parse", "HEAD^{tree}") != TREE or git("status", "--porcelain", "--untracked-files=no"):
        raise RuntimeError("Clean APP I3 checkout required; external harness identity remains separate")
    stop = datetime.fromisoformat(os.environ["WRITER363_STOP_AT_UTC"].replace("Z", "+00:00"))
    if stop.tzinfo is None or datetime.now(timezone.utc) >= stop:
        raise RuntimeError("Execution deadline already reached")
    report = Probe(identity, args.output, args.phase, stop).run()
    print(json.dumps({"status": report["status"], "nativePass": report["nativePass"], "phase": args.phase, "cleanup": report["cleanup"], "error": report.get("error")}, ensure_ascii=False))
    return 0 if report["status"] in ("passed", "capability-observed") else 2 if report["status"] == "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
