"""Supplementary formats cannot replace core native preflight or use renamed bytes."""
from pathlib import Path
import io
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from native import Unavailable
import stw
import sheet_formats


class FormatGates(unittest.TestCase):
    def test_stw_cannot_run_before_real_docx_core_preflight(self):
        session=SimpleNamespace(app="writer",report={"functionalCaseCompleted":False})
        with patch("stw.prepare",side_effect=AssertionError("No fixture download or UI allowed")):
            with self.assertRaises(Unavailable):stw.run_native(session)

    def test_gnm_and_xlsb_cannot_run_before_real_spreadsheet_core(self):
        session=SimpleNamespace(app="spreadsheet",report={"functionalCaseCompleted":False})
        with patch("sheet_formats.prepare",side_effect=AssertionError("No fixture download or UI allowed")):
            for kind in ("gnm","gnumeric","xlsb"):
                with self.subTest(kind=kind),self.assertRaises(Unavailable):sheet_formats.run_native(session,kind)
            with self.assertRaises(Unavailable):sheet_formats.run_native(session,"stc")

    def test_same_size_renamed_html_does_not_become_a_genuine_stw(self):
        with tempfile.TemporaryDirectory(prefix="native-stw-source-") as t:
            with patch("stw.urllib.request.urlopen",return_value=io.BytesIO(b"<html>"+b"x"*11180)):
                with self.assertRaises(Unavailable):stw.prepare(Path(t)/"case")

    def test_same_size_wrong_gnumeric_source_rejected(self):
        with tempfile.TemporaryDirectory(prefix="native-gnm-source-") as t:
            with patch("sheet_formats.urllib.request.urlopen",return_value=io.BytesIO(b"x"*2062)):
                with self.assertRaises(Unavailable):sheet_formats.prepare(Path(t)/"case","gnm")


if __name__=="__main__":unittest.main()
