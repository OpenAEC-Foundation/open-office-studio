"""Reject OCR/AX evidence that cannot justify a real visible document-body click."""
import copy
import unittest
from native import Unavailable
from vision import visible_word


def inputs():
    ocr={"imageSha256":"a"*64,"imageModified":False,"width":1800,"height":1400,
         "wordObservations":[{"text":"velvet","confidence":.98,"normalizedBottomLeft":{"x":.2,"y":.5,"width":.05,"height":.02}}]}
    snapshot={"pid":42,"frontmost":True,"screenCaptureAuthorized":True,
        "mainDisplay":{"X":0,"Y":0,"Width":1512,"Height":982},
        "ownedScreenWindows":[{"kCGWindowOwnerPID":42,"kCGWindowLayer":0,"kCGWindowNumber":70,
                               "kCGWindowBounds":{"X":100,"Y":50,"Width":900,"Height":700}}]}
    return ocr,snapshot


class VisionTests(unittest.TestCase):
    def test_retina_original_window_maps_visible_word_to_body_geometry(self):
        ocr,snapshot=inputs();point=visible_word(ocr,snapshot,42,"a"*64,"velvet")
        self.assertAlmostEqual(point["x"],302.5);self.assertAlmostEqual(point["y"],393)
        self.assertEqual(point["windowId"],70)

    def test_ax_text_mirror_without_original_visible_pixels_cannot_authorize_input(self):
        ocr,snapshot=inputs();ocr["wordObservations"]=[]
        snapshot["rawNodes"]=[{"AXRole":"AXTextArea","AXValue":"velvet"}]
        with self.assertRaises(Unavailable):visible_word(ocr,snapshot,42,"a"*64,"velvet")

    def test_wrong_pid_capture_frontmost_scale_and_ambiguous_word_are_rejected(self):
        cases=[]
        for field,value in (("imageSha256","f"*64),("imageModified",True),("width",900)):
            a,b=inputs();a[field]=value;cases.append((a,b))
        for field,value in (("pid",99),("frontmost",False),("screenCaptureAuthorized",False)):
            a,b=inputs();b[field]=value;cases.append((a,b))
        a,b=inputs();a["wordObservations"]*=2;cases.append((a,b))
        for a,b in cases:
            with self.subTest(a=a,b=b),self.assertRaises(Unavailable):visible_word(a,b,42,"a"*64,"velvet")

    def test_ribbon_offscreen_and_nonfinite_word_geometry_are_rejected(self):
        a,b=inputs();a["wordObservations"][0]["normalizedBottomLeft"]["y"]=.9
        with self.assertRaises(Unavailable):visible_word(a,b,42,"a"*64,"velvet")
        a,b=inputs();b["ownedScreenWindows"][0]["kCGWindowBounds"]["X"]=1000
        with self.assertRaises(Unavailable):visible_word(a,b,42,"a"*64,"velvet")
        a,b=inputs();a["wordObservations"][0]["normalizedBottomLeft"]["x"]=float('nan')
        with self.assertRaises(Unavailable):visible_word(a,b,42,"a"*64,"velvet")


if __name__=="__main__":unittest.main()
