import copy
from pathlib import Path
import runpy
import unittest

capture = runpy.run_path(str(Path(__file__).with_name("writer361-macos-ribbon-observation.py")))["capture_window"]


def state():
    value = lambda v: {"status": "available", "value": v}
    return {"pid": 7, "trusted": True, "screenCaptureAuthorized": True,
            "ownedScreenWindows": [{"id": 1, "pid": 7, "title": "", "bounds": {"X": 15, "Y": 296, "Width": 75, "Height": 47}},
                                   {"id": 33, "pid": 7, "title": "A.docx", "bounds": {"X": 0, "Y": 31, "Width": 1024, "Height": 677}}],
            "rawNodes": [{"depth": 0, "attributes": {"AXRole": value("AXWindow"), "AXTitle": value("A.docx"),
                           "AXPosition": value({"x": 0, "y": 31}), "AXSize": value({"width": 1024, "height": 677})}}]}


class NativeMainWindow(unittest.TestCase):
    def test_auxiliary_window_does_not_replace_exact_ax_main(self):
        self.assertEqual(capture(state(), 7)["id"], 33)

    def test_duplicate_main_is_rejected(self):
        s = state(); s["ownedScreenWindows"].append(copy.deepcopy(s["ownedScreenWindows"][1]))
        with self.assertRaises(PermissionError): capture(s, 7)

    def test_wrong_main_title_is_rejected(self):
        s = state(); s["ownedScreenWindows"][1]["title"] = "Other.docx"
        with self.assertRaises(PermissionError): capture(s, 7)

    def test_missing_ax_binding_is_rejected(self):
        s = state(); s["rawNodes"] = []
        with self.assertRaises(PermissionError): capture(s, 7)

    def test_wrong_owner_or_permissions_are_rejected(self):
        with self.assertRaises(PermissionError): capture(state(), 8)
        s = state(); s["screenCaptureAuthorized"] = False
        with self.assertRaises(PermissionError): capture(s, 7)

    def test_legacy_single_window_keeps_original_identity(self):
        s = state(); s["ownedScreenWindows"] = s["ownedScreenWindows"][1:]; s["rawNodes"] = []
        self.assertEqual(capture(s, 7)["id"], 33)


if __name__ == "__main__": unittest.main()
