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
    def test_377_requires_unique_selected_unsaved_xlsx_copy_not_a_clean_or_other_tab(self):
        tab={'AXRole':'AXRadioButton','AXRoleDescription':'tab','AXSelected':True,'AXValue':True,
             'AXTitle':'shared_formula.xlsx','AXHelp':'shared_formula.xlsx · unsaved changes',
             'frame':{'x':10,'y':190,'width':200,'height':24}}
        snap={'rawNodes':[{'attributes':tab}]}
        self.assertTrue(sheet_formats.unsaved_xlsx_copy(snap,'shared_formula')['AXSelected'])
        for bad in ({**tab,'AXHelp':'shared_formula.xlsx'},{**tab,'AXSelected':False},
                    {**tab,'AXTitle':'another.xlsx','AXHelp':'another.xlsx · unsaved changes'}):
            with self.assertRaises(Unavailable):sheet_formats.unsaved_xlsx_copy({'rawNodes':[{'attributes':bad}]},'shared_formula')
        with self.assertRaises(Unavailable):sheet_formats.unsaved_xlsx_copy({'rawNodes':[{'attributes':tab}]*2},'shared_formula')

    def test_377_reads_existing_default_xlsx_proposal_without_selecting_or_trusting_background(self):
        frame={'x':20,'y':100,'width':200,'height':30}
        rows=[{'index':0,'parent':-1,'attributes':{'AXRole':'AXGroup','AXSubrole':'AXApplicationDialog','AXTitle':'Save as'}},
              {'index':1,'parent':0,'attributes':{'AXRole':'AXRadioButton','AXTitle':'Excel workbook (.xlsx)','AXValue':1,'frame':frame}},
              {'index':2,'parent':0,'attributes':{'AXRole':'AXTextField','AXTitle':'File name .xlsx','AXValue':'shared_formula','frame':frame}}]
        self.assertIsNotNone(sheet_formats.default_xlsx_proposal({'rawNodes':rows},'shared_formula'))
        rows[1]['attributes']['AXValue']=0
        self.assertIsNone(sheet_formats.default_xlsx_proposal({'rawNodes':rows},'shared_formula'))
        rows[1]['attributes']['AXValue']=1;rows[1]['parent']=-1
        self.assertIsNone(sheet_formats.default_xlsx_proposal({'rawNodes':rows},'shared_formula'))
        rows[1]['parent']=0;rows[2]['attributes']['AXValue']='shared_formula.xlsb'
        self.assertIsNone(sheet_formats.default_xlsx_proposal({'rawNodes':rows},'shared_formula'))

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
