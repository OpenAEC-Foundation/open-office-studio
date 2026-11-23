"""Synthetic failure contracts for the independent oracle, not converter evidence."""
import importlib.util
import io
from pathlib import Path
import unittest
from xml.sax.saxutils import escape
import zipfile

spec=importlib.util.spec_from_file_location('gnm_oracle',Path(__file__).with_name('oracle.py'))
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
EXPECTED=[dict(name='Sheet1',cells={
    'A1':dict(kind='number',value=1), 'B1':dict(kind='string',value='String1'),
    'C1':dict(kind='number',value=6,formula='=2*3'), 'A2':dict(kind='number',value=2),
    'B2':dict(kind='string',value='String2'), 'C2':dict(kind='number',value=5,formula='=2+3'),
    'C3':dict(kind='number',value=-1,formula='=2-3'), 'C4':dict(kind='number',value=11,formula='=C1+C2')}),
    dict(name='Sheet2',cells={})]

def fixture(changed_text=False,changed_number=False,wrong_type=False,changed_formula=False,drop_formula=False,
            omit_second=False,marker=True,marker_first=False,macro=False,external=False,wrong_sheet_name=False):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/>'+('' if omit_second else '<sheet name="'+('Wrong' if wrong_sheet_name else 'Sheet2')+'" sheetId="2" r:id="rId2"/>')+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>'+('<Relationship Id="bad" TargetMode="External" Target="https://example.invalid"/>' if external else '')+'</Relationships>')
        rows=[]
        for where,value in EXPECTED[0]['cells'].items():
            if value['kind']=='string' or (wrong_type and where=='A1'):
                text='wrong' if changed_text and where=='B1' else str(value['value'])
                rows.append(f'<row><c r="{where}" t="inlineStr"><is><t>{escape(text)}</t></is></c></row>')
            else:
                formula=value.get('formula','').lstrip('=')
                if changed_formula and where=='C4': formula='C1-C2'
                if drop_formula and where=='C4': formula=''
                raw=999 if changed_number and where=='C4' else value['value']
                rows.append(f'<row><c r="{where}">'+(f'<f>{formula}</f>' if formula else '')+f'<v>{raw}</v></c></row>')
        edit=f'<row><c r="A1" t="inlineStr"><is><t>{oracle.MARKER}</t></is></c></row>'
        first=''.join(rows)+(edit if marker_first else '')
        z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+first+'</sheetData></worksheet>')
        z.writestr('xl/worksheets/sheet2.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+(edit if marker and not marker_first else '')+'</sheetData></worksheet>')
        if macro:z.writestr('xl/vbaProject.bin',b'not permitted')
    return out.getvalue()

class Contracts(unittest.TestCase):
    def test_typed_cells_formulas_both_sheets_and_edit(self):oracle.check(fixture(),EXPECTED,True)
    def test_untouched_second_sheet(self):oracle.check(fixture(marker=False),EXPECTED,False)
    def test_wrong_original_hash_rejected(self):
        with self.assertRaises(AssertionError):oracle.source_contents(b'not a pinned Gnumeric source')
    def test_changed_text_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(changed_text=True),EXPECTED,True)
    def test_changed_cached_formula_value_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(changed_number=True),EXPECTED,True)
    def test_wrong_type_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(wrong_type=True),EXPECTED,True)
    def test_changed_formula_same_cache_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(changed_formula=True),EXPECTED,True)
    def test_formula_replaced_by_value_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(drop_formula=True),EXPECTED,True)
    def test_missing_second_sheet_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(omit_second=True),EXPECTED,True)
    def test_wrong_sheet_name_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(wrong_sheet_name=True),EXPECTED,True)
    def test_missing_edit_marker_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(marker=False),EXPECTED,True)
    def test_marker_on_wrong_sheet_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(marker_first=True),EXPECTED,True)
    def test_macro_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(macro=True),EXPECTED,True)
    def test_external_relationship_rejected(self):
        with self.assertRaises(AssertionError):oracle.check(fixture(external=True),EXPECTED,True)
    def test_formula_is_not_executed_as_python(self):
        with self.assertRaises(AssertionError):oracle.expression('__import__("os").system("false")')
    def test_source_math_is_independent_of_converter(self):
        self.assertEqual(oracle.calculate('C1+C2',lambda name:{'C1':6,'C2':5}[name]),11)

if __name__=='__main__':unittest.main(verbosity=2)
