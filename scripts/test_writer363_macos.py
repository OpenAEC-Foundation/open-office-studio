"""Synthetic AX/cleanup contracts only; these tests are not native acceptance."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone, timedelta

SPEC = importlib.util.spec_from_file_location("writer363_macos", Path(__file__).with_name("proef-writer363-macos.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def node(index, name, role="AXButton", parent=0, x=600, y=105, width=90, height=30, selected=False):
    values = dict(AXTitle=name, AXDescription=name, AXHelp=name, AXRole=role, AXEnabled=True,
                  AXPosition=dict(x=x, y=y), AXSize=dict(width=width, height=height), AXSelected=selected)
    return {"index": index, "parent": parent, "attributes": {**{k: {"status": "available", "value": v, "truncated": False} for k, v in values.items()}, "actions": {"axError": 0, "value": ["AXPress"]}}}


def snapshot(language="en"):
    tab = "Styles" if language == "en" else "Stijlen"
    return {"ownedScreenWindows": [{"id": 33, "pid": 500, "bounds": dict(X=0, Y=25, Width=1024, Height=743)}],
            "rawNodes": [node(1, tab, "AXRadioButton", x=400, y=55, selected=True),
                         node(2, tab, x=500, y=110, height=70),
                         *[node(i+10, label, x=650 if i < 2 else 780, y=95+i*25, width=200) for i, label in enumerate(M.NAMES[language])]]}


class Selectors(unittest.TestCase):
    def test_styles_tab_role_excludes_same_caption_collapsed_button(self):
        result = M.style_tab(snapshot(), "en")
        self.assertEqual(result["node"]["index"], 1)
        self.assertEqual(result["role"], "AXRadioButton")

    def test_duplicate_real_tabs_are_unavailable(self):
        state = snapshot()
        state["rawNodes"].append(node(99, "Styles", "AXTab", x=480, y=55))
        with self.assertRaises(PermissionError):
            M.style_tab(state, "en")

    def test_unexposed_geometry_cannot_select_a_hidden_duplicate(self):
        state = snapshot()
        state["rawNodes"].append(node(99, "Styles", "AXTab", x=0, y=0, width=1, height=1))
        self.assertEqual(M.style_tab(state, "en")["node"]["index"], 1)

    def test_tab_requires_enabled_press_and_geometry(self):
        for field in ("AXEnabled", "AXPosition", "actions"):
            with self.subTest(field=field):
                state = snapshot()
                del state["rawNodes"][0]["attributes"][field]
                with self.assertRaises(PermissionError):
                    M.style_tab(state, "en")

    def test_five_labels_in_both_actual_supported_languages(self):
        for language in ("en", "nl"):
            with self.subTest(language=language):
                controls = M.style_controls(snapshot(language), language)
                self.assertEqual([c["expectedName"] for c in controls], M.NAMES[language])

    def test_missing_truncated_or_raw_control_attribute_is_unavailable(self):
        for attribute, replacement in [("AXHelp", {"status": "unavailable", "axError": -25212}),
                                       ("AXTitle", {"status": "available", "value": "New Style…", "truncated": True}),
                                       ("AXHelp", {"status": "available", "value": "styles.manage.new"})]:
            with self.subTest(attribute=attribute, replacement=replacement):
                state = snapshot()
                state["rawNodes"][3]["attributes"][attribute] = replacement
                with self.assertRaises(PermissionError):
                    M.style_controls(state, "en")

    def test_wrong_style_help_interpolation_cannot_pass(self):
        state = snapshot()
        state["rawNodes"][4]["attributes"]["AXHelp"]["value"] = "Update missing-name"
        with self.assertRaises(PermissionError):
            M.style_controls(state, "en")

    def test_unsupported_language_is_not_forced(self):
        for callback in (M.style_tab, M.style_controls):
            with self.assertRaises(PermissionError):
                callback(snapshot(), "lo")

    def test_management_toggle_needs_native_tree_binding_not_guess(self):
        state = snapshot()
        state["rawNodes"].append(node(77, "Styles", x=300))
        with self.assertRaises(PermissionError):
            M.management_toggle(state, "en")

    def test_unique_collapsed_management_button_does_not_need_hidden_children(self):
        state = snapshot()
        state["rawNodes"] = state["rawNodes"][:2]
        self.assertEqual(M.management_toggle(state, "en")["node"]["index"], 2)

    def test_management_toggle_is_bound_to_five_descendants(self):
        state = snapshot()
        group = node(60, "Styles", "AXGroup", x=600)
        state["rawNodes"].append(group)
        state["rawNodes"][1]["parent"] = 60
        for control in state["rawNodes"][2:7]:
            control["parent"] = 60
            control["attributes"]["AXSize"]["value"] = {"width": 1, "height": 1}
        state["rawNodes"].append(node(77, "Styles", x=300))
        self.assertEqual(M.management_toggle(state, "en")["node"]["index"], 2)

    def test_language_popup_requires_actual_role_enabled_and_press(self):
        state = snapshot()
        state["rawNodes"].append(node(100, "Language: English", x=400, y=350, width=220))
        self.assertEqual(M.select_control(state, ["Language: English"], {"AXButton", "AXPopUpButton"}, "dialog")["node"]["index"], 100)
        state["rawNodes"][-1]["attributes"]["actions"]["value"] = []
        with self.assertRaises(PermissionError):
            M.select_control(state, ["Language: English"], {"AXButton", "AXPopUpButton"}, "dialog")

    def test_actual_partially_intersecting_language_popup_frame_is_preserved(self):
        state = snapshot()
        popup = node(100, "Language: English", "AXPopUpButton", x=269, y=-55, width=493, height=270)
        state["rawNodes"].append(popup)
        control = M.select_control(state, ["Language: English"], {"AXPopUpButton"}, "dialog", "language-trigger")
        self.assertEqual({key: control[key] for key in ("x", "y", "width", "height")}, dict(x=269, y=-55, width=493, height=270))
        self.assertEqual(control["geometryPolicy"], "partial-native-language-popup-AXPress-only")
        self.assertEqual(M.value(popup, "AXPosition"), dict(x=269, y=-55))

    def test_partial_frame_exception_requires_exact_kind_role_and_label(self):
        for role, label, kind in [("AXButton", "Language: English", "language-trigger"),
                                   ("AXPopUpButton", "Other popup", "language-trigger"),
                                   ("AXPopUpButton", "Language: English", "settings-open"),
                                   ("AXPopUpButton", "Language: English", None),
                                   ("AXButton", "Save", "settings-save")]:
            with self.subTest(role=role, label=label, kind=kind):
                state = snapshot()
                state["rawNodes"].append(node(100, label, role, x=269, y=-55, width=493, height=270))
                with self.assertRaises(PermissionError):
                    M.select_control(state, [label], {role}, "dialog", kind)

    def test_fully_offscreen_or_nonfinite_language_popup_stays_unavailable(self):
        for x, y in [(269, -400), (-800, 100), (float("nan"), 100)]:
            with self.subTest(x=x, y=y):
                state = snapshot()
                state["rawNodes"].append(node(100, "Language: English", "AXPopUpButton", x=x, y=y, width=493, height=270))
                with self.assertRaises(PermissionError):
                    M.select_control(state, ["Language: English"], {"AXPopUpButton"}, "dialog", "language-trigger")

    def test_partial_popup_still_requires_strict_uniqueness_enabled_and_press(self):
        for problem in ("duplicate", "disabled", "missing-press"):
            with self.subTest(problem=problem):
                state = snapshot()
                popup = node(100, "Language: English", "AXPopUpButton", x=269, y=-55, width=493, height=270)
                state["rawNodes"].append(popup)
                if problem == "duplicate":
                    state["rawNodes"].append(node(101, "Language: English", "AXPopUpButton", x=279, y=-55, width=493, height=270))
                if problem == "disabled":
                    popup["attributes"]["AXEnabled"]["value"] = False
                if problem == "missing-press":
                    popup["attributes"]["actions"]["value"] = []
                with self.assertRaises(PermissionError):
                    M.select_control(state, ["Language: English"], {"AXPopUpButton"}, "dialog", "language-trigger")

    def test_settings_original_evidence_precedes_trigger_readiness_failure(self):
        probe = M.Probe.__new__(M.Probe)
        probe.counter = 15
        probe.report = {}
        calls = []
        probe.press = lambda *args: calls.append("settings-native-press")
        def evidence(label):
            calls.append("original-raw-and-capture")
            return {}, {"path": label+".png", "unaltered": True}
        probe.evidence = evidence
        def wait(*args, **kwargs):
            calls.append("trigger-readiness")
            raise PermissionError("trigger unavailable")
        probe.wait = wait
        with self.assertRaises(PermissionError):
            probe.open_settings("en")
        self.assertEqual(calls, ["settings-native-press", "original-raw-and-capture", "trigger-readiness"])
        self.assertTrue(probe.report["settingsCapabilities"][0]["capture"]["unaltered"])


class Cleanup(unittest.TestCase):
    def test_returns_only_after_all_cleanup(self):
        calls = []
        result = M.preserve_errors(lambda: "done", [lambda: calls.append("app"), lambda: calls.append("profile")])
        self.assertEqual(result, "done")
        self.assertEqual(calls, ["app", "profile"])

    def test_original_and_cleanup_errors_retained_in_order(self):
        original, cleanup = ValueError("native failed"), RuntimeError("close failed")
        calls = []
        def body():
            raise original
        def close():
            calls.append("close")
            raise cleanup
        with self.assertRaises(ExceptionGroup) as result:
            M.preserve_errors(body, [close, lambda: calls.append("profile")])
        self.assertEqual(result.exception.exceptions, (original, cleanup))
        self.assertEqual(calls, ["close", "profile"])

    def test_successful_operation_cannot_hide_cleanup_failure(self):
        problem = RuntimeError("detach failed")
        def fail():
            raise problem
        with self.assertRaises(RuntimeError) as result:
            M.preserve_errors(lambda: "passed", [fail])
        self.assertIs(result.exception, problem)

    def test_noop_native_body_never_becomes_acceptance(self):
        with tempfile.TemporaryDirectory(prefix="writer363-contract-") as directory:
            probe = M.Probe.__new__(M.Probe)
            probe.out = Path(directory) / "fresh"
            probe.phase = "ui-language"
            probe.report = {"status": "failed", "nativePass": False, "labels": [], "cleanup": {}}
            for method in ("body", "restore", "close", "detach", "remove_profile", "remove_container"):
                setattr(probe, method, lambda: None)
            report = probe.run()
            self.assertEqual(report["status"], "failed")
            self.assertFalse(report["nativePass"])
            self.assertIn("Missing required", report["error"]["message"])

    def test_language_results_alone_cannot_hide_missing_restoration(self):
        with tempfile.TemporaryDirectory(prefix="writer363-contract-") as directory:
            probe = M.Probe.__new__(M.Probe)
            probe.out = Path(directory) / "fresh"
            probe.phase = "ui-language"
            probe.report = {"status": "failed", "nativePass": False, "labels": [{"language": x} for x in ("en", "nl", "en")], "cleanup": {"ownedAppClosed": True}}
            for method in ("body", "restore", "close", "detach", "remove_profile", "remove_container"):
                setattr(probe, method, lambda: None)
            report = probe.run()
            self.assertEqual(report["status"], "failed")
            self.assertFalse(report["nativePass"])
            self.assertIn("confirmed preference/tab restoration", report["error"]["message"])

    def test_cancellation_deadline_blocks_actions_but_allows_short_cleanup(self):
        probe = M.Probe.__new__(M.Probe)
        probe.stop = datetime.now(timezone.utc)-timedelta(seconds=1)
        probe.cleanup_stop = datetime.now(timezone.utc)+timedelta(seconds=5)
        with self.assertRaises(TimeoutError):
            probe.action()
        probe.check(cleanup=True)


if __name__ == "__main__":
    unittest.main()
