"""Synthetic oracle failure contracts, not application/converter evidence."""
import importlib.util
import io
from pathlib import Path
import unittest
from xml.sax.saxutils import escape
import zipfile

spec = importlib.util.spec_from_file_location("oracle", Path(__file__).with_name("format30-sylk-oracle.py"))
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
EXPECTED = {"A6": {"kind": "string", "value": "Fuel"}, "J6": {"kind": "number", "value": 1100.64}}


def fixture(text="Fuel", number="1100.64", marker=True, external=False, macro=False, numeric_as_text=False):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
        z.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>' + ('<Relationship Id="bad" Target="https://example.invalid" TargetMode="External"/>' if external else '') + '</Relationships>')
        value = f'<c r="J6"><v>{number}</v></c>' if not numeric_as_text else f'<c r="J6" t="inlineStr"><is><t>{number}</t></is></c>'
        z.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="6"><c r="A6" t="inlineStr"><is><t>' + escape(text) + '</t></is></c>' + value + '</row>' + ('<row r="1"><c r="L1" t="inlineStr"><is><t>SYLK30 EDIT</t></is></c></row>' if marker else '') + '</sheetData></worksheet>')
        if macro: z.writestr("xl/vbaProject.bin", b"forbidden")
    return out.getvalue()


class Contracts(unittest.TestCase):
    def test_known_cells_and_edit_marker(self): oracle.check(fixture(), EXPECTED, True)
    def test_changed_source_bytes_fail(self):
        with self.assertRaises(AssertionError): oracle.source_cells(b"ID;PXL;N;E\nE\n")
    def test_changed_text_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(text="Other"), EXPECTED, True)
    def test_wrong_numeric_cell_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(number="1100.65"), EXPECTED, True)
    def test_number_changed_to_text_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(numeric_as_text=True), EXPECTED, True)
    def test_absent_saved_edit_marker_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(marker=False), EXPECTED, True)
    def test_external_relationship_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(external=True), EXPECTED, True)
    def test_macro_part_fails(self):
        with self.assertRaises(AssertionError): oracle.check(fixture(macro=True), EXPECTED, True)


if __name__ == "__main__": unittest.main()
