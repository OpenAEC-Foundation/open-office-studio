import copy
from pathlib import Path
import runpy
import unittest

target = runpy.run_path(str(Path(__file__).with_name("mac-native-body-target.py")))["visible_body_target"]


class VisibleTargetTests(unittest.TestCase):
    def setUp(self):
        self.ocr = {"imageSha256": "a"*64, "imageModified": False, "width": 1024, "height": 677,
                    "observations": [{"text": "alpha", "confidence": .99,
                                      "normalizedBottomLeft": {"x": .2, "y": .45, "width": .04, "height": .02}}]}
        self.snapshot = {"applicationActive": True, "frontmostPid": 123, "screenCaptureAuthorized": True,
                         "ownedScreenWindows": [{"pid": 123, "id": 5, "bounds": {"X": 0, "Y": 31, "Width": 1024, "Height": 677}}],
                         "mainDisplay": {"bounds": {"X": 0, "Y": 0, "Width": 1024, "Height": 768}}}

    def test_valid_visible_target(self):
        self.assertAlmostEqual(target(self.ocr, self.snapshot, 123, "a"*64)["point"]["x"], 225.28)

    def test_reject_capture_or_ownership_mismatch(self):
        for key, value in [("frontmostPid", 456), ("applicationActive", False), ("screenCaptureAuthorized", False)]:
            with self.subTest(key=key), self.assertRaises(PermissionError):
                target(self.ocr, dict(self.snapshot, **{key: value}), 123, "a"*64)
        with self.assertRaises(PermissionError):
            target(self.ocr, self.snapshot, 123, "b"*64)

    def test_reject_shadow_geometry_and_duplicate_word(self):
        with self.assertRaises(PermissionError):
            target(dict(self.ocr, width=1070), self.snapshot, 123, "a"*64)
        with self.assertRaises(PermissionError):
            target(dict(self.ocr, observations=self.ocr["observations"]*2), self.snapshot, 123, "a"*64)

    def test_reject_ribbon_word_and_unreadable_word(self):
        for change in [{"confidence": .5}, {"normalizedBottomLeft": {"x": .2, "y": .9, "width": .04, "height": .02}}]:
            ocr = copy.deepcopy(self.ocr); ocr["observations"][0].update(change)
            with self.assertRaises(PermissionError):
                target(ocr, self.snapshot, 123, "a"*64)


if __name__ == "__main__":
    unittest.main()
