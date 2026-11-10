"""Independent spreadsheet round trips through the production macro-disabled profile.

Requires LibreOffice, openpyxl and lxml. Test files and profiles stay in .local.
The XLSB fixture is pinned to LibreOffice's upstream shared-formula regression;
its independently authored expectation is A1:A30 = 3, including after recalculation.
"""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.request
import uuid
import zipfile

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils.datetime import CALENDAR_MAC_1904, CALENDAR_WINDOWS_1900
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get('OOS_FORMAAT_UIT', '.local/rekenbladformaten')
spec = importlib.util.spec_from_file_location('odfcontrole', ROOT/'scripts/test-odf-13.py')
odf = importlib.util.module_from_spec(spec); spec.loader.exec_module(odf)
XLSB_COMMIT = 'bd7011e96264ddfe5506839319dd610975328a59'
XLSB_BLOB = 'b304e0826c391c4977d55a0eddca74d39138a7ee'

def fixture(path, epoch):
    wb = Workbook(); wb.epoch = epoch
    a = wb.active; a.title = 'Invoer'; b = wb.create_sheet('Uitkomst')
    a.append(['Materiaal', 'Aantal']); a.append(['Beton', 12.5]); a.append(['Staal', 7.25])
    a['A5'] = dt.datetime(2026, 11, 9); a['A5'].number_format = 'dd-mm-yyyy'
    a.merge_cells('D2:E3'); a['D2'] = 'Samengevoegd'
    a['A1'].font = Font(bold=True, color='FFFFFF'); a['A1'].fill = PatternFill('solid', fgColor='447755')
    a['B2'].number_format = '#,##0.00'; a['D2'].alignment = Alignment(horizontal='center')
    a.column_dimensions['A'].width = 24; a.row_dimensions[1].height = 26
    wb.defined_names.add(DefinedName('Aantallen', attr_text="'Invoer'!$B$2:$B$3"))
    b['A1'] = '=SUM(Invoer!B2:B3)'; b['A2'] = '=SUM(Aantallen)'; b['A3'] = '=IF(A1>10,A1*2,0)'
    chart = BarChart(); chart.title = 'Materialen'; chart.add_data(Reference(a, min_col=2, min_row=1, max_row=3), titles_from_data=True)
    chart.set_categories(Reference(a, min_col=1, min_row=2, max_row=3)); a.add_chart(chart, 'G2')
    a.print_area = 'A1:L20'; a.page_setup.orientation = 'landscape'
    wb.save(path)

def convert(exe, source, ext, filter_name):
    directory = OUT / ('conversion-' + uuid.uuid4().hex[:12]); (directory/'profile/user').mkdir(parents=True); (directory/'output').mkdir()
    profile = ROOT/'src-tauri/src/conversieprofiel.xcu'
    (directory/'profile/user/registrymodifications.xcu').write_bytes(profile.read_bytes())
    ms = odf.run(exe, ['-env:UserInstallation='+(directory/'profile').as_uri(), '--headless', '--nologo', '--nodefault', '--norestore', '--nolockcheck', '--convert-to', ext+':'+filter_name, '--outdir', str(directory/'output'), str(source)], directory)
    target = directory/'output'/(source.stem+'.'+ext)
    if not target.is_file(): raise AssertionError(f'No {ext} output: {directory}')
    return target, ms

def inspect(path, aantal=12.5):
    wb = load_workbook(path, data_only=False); values = load_workbook(path, data_only=True)
    checks = {}
    checks['sheets'] = wb.sheetnames == ['Invoer', 'Uitkomst']
    checks['values'] = wb['Invoer']['B2'].value == aantal and wb['Invoer']['B3'].value == 7.25
    checks['formulas'] = all(wb['Uitkomst'][f'A{i}'].data_type == 'f' for i in (1,2,3))
    checks['independentResults'] = [values['Uitkomst'][f'A{i}'].value for i in (1,2,3)] == [aantal+7.25, aantal+7.25, (aantal+7.25)*2]
    checks['date'] = values['Invoer']['A5'].value == dt.datetime(2026,11,9)
    checks['merged'] = 'D2:E3' in {str(r) for r in wb['Invoer'].merged_cells.ranges}
    checks['namedRange'] = 'Aantallen' in wb.defined_names
    checks['formatting'] = wb['Invoer']['A1'].font.bold and wb['Invoer']['B2'].number_format == '#,##0.00'
    checks['charts'] = len(wb['Invoer']._charts) == 1
    chart = wb['Invoer']._charts[0] if wb['Invoer']._charts else None
    checks['chartCachedValues'] = chart is not None and [p.v for p in chart.series[0].val.numRef.numCache.pt] == [aantal, 7.25]
    checks['printArea'] = 'A1:L20' in str(wb['Invoer'].print_area).replace('$', '') and wb['Invoer'].page_setup.orientation == 'landscape'
    return checks

def odf_checks(path, ext, document_schema, manifest_schema):
    if ext == 'fods':
        root = ET.parse(str(path), ET.XMLParser(resolve_entities=False, no_network=True))
        return [{'part':'flat-document', 'valid':document_schema.validate(root) and root.getroot().get(odf.OFFICE+'version') == '1.3'}]
    if ext not in ('ods','ots'): return []
    checks = odf.validate(path, document_schema, manifest_schema, 'application/vnd.oasis.opendocument.spreadsheet'+('-template' if ext == 'ots' else ''))
    standard = {'content.xml','styles.xml','meta.xml','settings.xml','META-INF/manifest.xml'}
    with zipfile.ZipFile(path) as package:
        for name in package.namelist():
            if not name.endswith('.xml') or name in standard: continue
            root = ET.fromstring(package.read(name), ET.XMLParser(resolve_entities=False, no_network=True))
            if root.tag.startswith(odf.OFFICE):
                checks.append({'part':name, 'valid':document_schema.validate(root) and root.get(odf.OFFICE+'version') == '1.3', 'errors':[str(e) for e in document_schema.error_log]})
    return checks

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if '--probe-workbook-protection' in sys.argv:
        exe = os.environ.get('OPENAEC_CONVERSIE_PROGRAMMA') or shutil.which('soffice')
        if not exe: raise RuntimeError('Set OPENAEC_CONVERSIE_PROGRAMMA')
        source = ROOT/'src/import/testbestanden/modern-workbook-protection.xlsx'
        assert odf.sha(source.read_bytes()) == '372ab091dc4ef97b799f33ce780531156d8e68a327fe91e75de5245cbf766a4d'
        before = load_workbook(source)
        middle, export_ms = convert(exe, source, 'ods', 'calc8')
        back, import_ms = convert(exe, middle, 'xlsx', 'Calc MS Excel 2007 XML')
        after = load_workbook(back); values = load_workbook(back,data_only=True)
        report = {'sourceSha256':odf.sha(source.read_bytes()),'sourceStructureProtected':bool(before.security.lockStructure),
                  'convertedStructureProtected':bool(after.security.lockStructure), 'sheetProtected':bool(after.active.protection.sheet),
                  'valuesRetained':values.active['B3'].value == 20 and values.active['A1'].value == 22,
                  'exportMs':export_ms,'importMs':import_ms,'output':str(back)}
        report['confirmedLoss'] = report['sourceStructureProtected'] and not report['convertedStructureProtected']
        report['pass'] = report['confirmedLoss'] and report['sheetProtected'] and report['valuesRetained']
        (OUT/'protection-loss-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report),flush=True)
        return 0 if report['pass'] else 1
    if '--validate-engine-roundtrip' in sys.argv:
        cases = json.loads((OUT/'engine-roundtrip-report.json').read_text(encoding='utf-8'))
        document_schema = odf.schema('OpenDocument-v1.3-schema.rng'); manifest_schema = odf.schema('OpenDocument-v1.3-manifest-schema.rng')
        for case in cases:
            case['checks'] = inspect(Path(case['output']),20)
            case['odf13'] = odf_checks(Path(case['intermediate']), case['format'], document_schema, manifest_schema)
            case['pass'] = all(case['checks'].values()) and all(c['valid'] for c in case['odf13'])
        (OUT/'engine-roundtrip-checked.json').write_text(json.dumps(cases, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'pass':all(c['pass'] for c in cases),'cases':len(cases),'odfChecks':sum(len(c['odf13']) for c in cases)}))
        return 0 if all(c['pass'] for c in cases) else 1
    if '--roundtrip-engine' in sys.argv:
        exe = os.environ.get('OPENAEC_CONVERSIE_PROGRAMMA') or shutil.which('soffice')
        if not exe: raise RuntimeError('Set OPENAEC_CONVERSIE_PROGRAMMA')
        catalog = json.loads((ROOT/'src/formaten.json').read_text(encoding='utf-8'))['xlsx']['uitvoer']
        document_schema = odf.schema('OpenDocument-v1.3-schema.rng'); manifest_schema = odf.schema('OpenDocument-v1.3-manifest-schema.rng')
        cases = json.loads((OUT/'engine-report.json').read_text(encoding='utf-8'))
        result = []
        try:
            for case in cases:
                if case['format'] == 'xlsb': continue
                out = {'format':case['format'], 'dateSystem':case['dateSystem']}; result.append(out)
                try:
                    middle, out['exportMs'] = convert(exe, (ROOT/case['output']).resolve(), case['format'], catalog[case['format']]['filter'])
                    out['odf13'] = odf_checks(middle, case['format'], document_schema, manifest_schema)
                    assert all(c['valid'] for c in out['odf13']), out['odf13']
                    back, out['importMs'] = convert(exe, middle, 'xlsx', 'Calc MS Excel 2007 XML')
                    out.update(intermediate=str(middle), output=str(back), checks=inspect(back,20))
                    out['pass'] = all(out['checks'].values())
                except Exception as error: out.update(error=str(error), **{'pass':False})
                print(json.dumps(out), flush=True)
        finally: (OUT/'engine-roundtrip-report.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        return 0 if all(c['pass'] for c in result) else 1
    if '--validate-engine' in sys.argv:
        cases = json.loads((OUT/'engine-report.json').read_text(encoding='utf-8'))
        for case in cases:
            if case['format'] != 'xlsb': case['checks'] = inspect(Path(case['output']), 20)
            else:
                wb = load_workbook(case['output'], data_only=True)
                case['checks'] = {'independentResults':all(wb.active[f'A{r}'].value == 3 for r in range(1,31)), 'edit':wb.active['D1'].value == 'Checked'}
            case['pass'] = all(case['checks'].values())
        (OUT/'engine-report-checked.json').write_text(json.dumps(cases, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(cases))
        return 0 if all(c['pass'] for c in cases) else 1
    if '--validate-existing' in sys.argv:
        report = json.loads((OUT/'report.json').read_text(encoding='utf-8'))
        for case in report['cases']:
            if case.get('output') and case['format'] != 'xlsb':
                case['checksBeforeValidatorCorrection'] = case.get('checks')
                case['checks'] = inspect(Path(case['output']))
                case['pass'] = all(case['checks'].values())
        report['pass'] = all(c.get('pass') for c in report['cases'])
        (OUT/'report-checked.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'pass':report['pass'], 'cases':[(c['format'],c.get('dateSystem'),c['pass']) for c in report['cases']]}))
        return 0 if report['pass'] else 1
    exe = os.environ.get('OPENAEC_CONVERSIE_PROGRAMMA') or shutil.which('soffice')
    if not exe: raise RuntimeError('Set OPENAEC_CONVERSIE_PROGRAMMA')
    catalog = json.loads((ROOT/'src/formaten.json').read_text(encoding='utf-8'))['xlsx']['uitvoer']
    report = {'profileSha256': odf.sha((ROOT/'src-tauri/src/conversieprofiel.xcu').read_bytes()), 'cases': []}
    schema = odf.schema('OpenDocument-v1.3-schema.rng'); manifest = odf.schema('OpenDocument-v1.3-manifest-schema.rng')
    try:
        for label, epoch in [('1900', CALENDAR_WINDOWS_1900), ('1904', CALENDAR_MAC_1904)]:
            source = OUT/f'Spreadsheet-{label}.xlsx'; fixture(source, epoch)
            for ext in ['ods','ots','fods','xls','xlt']:
                case = {'dateSystem': label, 'format': ext}; report['cases'].append(case)
                try:
                    middle, ms1 = convert(exe, source, ext, catalog[ext]['filter'])
                    case.update(intermediate=str(middle), intermediateSha256=odf.sha(middle.read_bytes()), exportMs=ms1)
                    if ext in ('ods','ots'):
                        case['odf13'] = odf.validate(middle, schema, manifest, 'application/vnd.oasis.opendocument.spreadsheet'+('-template' if ext == 'ots' else ''))
                        assert all(c['valid'] for c in case['odf13']), case['odf13']
                    elif ext == 'fods':
                        root = ET.parse(str(middle), ET.XMLParser(resolve_entities=False, no_network=True))
                        case['flatOdf13'] = schema.validate(root) and root.getroot().get(odf.OFFICE+'version') == '1.3'
                        assert case['flatOdf13'], [str(e) for e in schema.error_log]
                    back, ms2 = convert(exe, middle, 'xlsx', 'Calc MS Excel 2007 XML')
                    case.update(output=str(back), importMs=ms2, checks=inspect(back)); case['pass'] = all(case['checks'].values())
                except Exception as error: case.update(error=str(error), **{'pass':False})
                print(json.dumps(case), flush=True)
        # The fixture's expectation comes from upstream testSharedFormulaXLSB,
        # not from the source cache or the converter being tested.
        case = {'format':'xlsb', 'sourceCommit':XLSB_COMMIT, 'sourceBlob':XLSB_BLOB}; report['cases'].append(case)
        try:
            source = OUT/'shared_formula.xlsb'
            if not source.exists():
                with urllib.request.urlopen(f'https://raw.githubusercontent.com/LibreOffice/core/{XLSB_COMMIT}/sc/qa/unit/data/xlsb/shared_formula.xlsb', timeout=30) as response: source.write_bytes(response.read())
            data = source.read_bytes(); assert len(data) == 7651
            assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest() == XLSB_BLOB
            back, ms = convert(exe, source, 'xlsx', 'Calc MS Excel 2007 XML')
            wb = load_workbook(back, data_only=False); values = load_workbook(back, data_only=True)
            case.update(output=str(back), ms=ms, sha256=odf.sha(data), checks={'sharedFormulas':all(wb.active[f'A{r}'].data_type == 'f' for r in range(1,31)), 'independentResults':all(values.active[f'A{r}'].value == 3 for r in range(1,31))})
            case['pass'] = all(case['checks'].values())
        except Exception as error: case.update(error=str(error), **{'pass':False})
        print(json.dumps(case), flush=True)
    finally:
        report['pass'] = all(c.get('pass') for c in report['cases'])
        (OUT/'report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    return 0 if report['pass'] else 1

if __name__ == '__main__': sys.exit(main())
