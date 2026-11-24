"""Replay source qualification + independent historical XLSX checks. No app execution."""
import collections
import copy
import datetime as dt
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import read_source

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / 'docs/tests/dbf-source-2026-11-24'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def git_bytes(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)


def observe(path):
    with zipfile.ZipFile(path) as z:
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = workbook.findall('s:sheets/s:sheet', NS)
        assert len(sheets) == 1
        rel = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = next(x.get('Target') for x in rels if x.get('Id') == rel)
        part = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        styles = ET.fromstring(z.read('xl/styles.xml'))
        formats = {int(f.get('numFmtId')): f.get('formatCode') for f in styles.findall('s:numFmts/s:numFmt', NS)}
        xfs = styles.findall('s:cellXfs/s:xf', NS)
        cells = {}
        for c in ET.fromstring(z.read(part)).findall('.//s:sheetData/s:row/s:c', NS):
            typ = c.get('t', 'n')
            value = c.findtext('s:v', None, NS)
            if typ == 's' and value is not None:
                value = strings[int(value)]
            elif typ == 'inlineStr':
                value = ''.join(c.find('s:is', NS).itertext())
            fmt_id = int(xfs[int(c.get('s', '0'))].get('numFmtId', '0'))
            cells[c.get('r')] = dict(type=typ, value=value, formula=c.find('s:f', NS) is not None,
                                     numFmtId=fmt_id, formatCode=formats.get(fmt_id))
        pr = workbook.find('s:workbookPr', NS)
        return dict(sheetName=sheets[0].get('name'),
                    date1904=pr is not None and pr.get('date1904') in ('1', 'true'), cells=cells)


def check(source, observation):
    cells = observation['cells']
    cases = []
    def case(name, passed):
        cases.append(dict(case=name, passed=bool(passed)))
    names = [f['name'] for f in source['fields']]
    # Converter schema annotations after ',' are presentation, not source records.
    case('ordered-field-names', all(cells.get(chr(65+i)+'1', {}).get('type') in ('s', 'inlineStr')
         and (cells.get(chr(65+i)+'1', {}).get('value') or '').split(',', 1)[0] == n
         for i, n in enumerate(names)))
    expected_refs = {chr(65+i)+'1' for i in range(len(names))}
    for record in source['records']:
        assert not record['deleted'], 'fixture does not exercise deleted records'
        for col, slot in enumerate(record['slots']):
            ref = chr(65+col) + str(record['index']+1)
            expected_refs.add(ref)
            c = cells.get(ref)
            kind, value = slot['kind'], slot['value']
            if kind in ('blank-character', 'blank-numeric', 'unknown-logical'):
                # Bounded blank projection; SQL NULL / blank / unknown identity is not certified.
                ok = c is None or (c['value'] in (None, '') and not c['formula'])
            elif c is None or c['formula']:
                ok = False
            elif kind == 'text':
                ok = c['type'] in ('s', 'inlineStr') and c['value'] == value
            elif kind == 'boolean':
                ok = c['type'] == 'b' and c['value'] == ('1' if value else '0')
            elif kind == 'number':
                ok = c['type'] == 'n' and c['value'] is not None and Decimal(c['value']) == Decimal(value)
            else:
                date = dt.date.fromisoformat(value)
                epoch = dt.date(1904, 1, 1) if observation['date1904'] else dt.date(1899, 12, 30)
                assert date >= dt.date(1900, 3, 1), 'early Excel leap-day policy outside fixture'
                # This fixture's actual custom date format, not a general Excel format recognizer.
                date_style = c['numFmtId'] in (14, 15, 16, 17) or c['formatCode'] == 'dd/mm/yy'
                ok = c['type'] == 'n' and c['value'] is not None and Decimal(c['value']) == (date-epoch).days and date_style
            case(ref+':'+slot['field']+':'+kind, ok)
    case('no-extra-valued-cells', all(r in expected_refs or c['value'] in (None, '') for r,c in cells.items()))
    case('no-output-formulas', not any(c['formula'] for c in cells.values()))
    return cases


def main():
    config = json.loads((Path(__file__).with_name('fixture.json')).read_text(encoding='utf8'))
    commit = config['application']['commit']
    assert subprocess.check_output(['git', 'rev-parse', commit+'^{tree}'], cwd=ROOT, text=True).strip() == config['application']['tree']
    for path, pin in config['p2Bindings'].items():
        data = git_bytes(commit, path)
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'] and blob(data) == pin['blob'], path
    catalog = json.loads(git_bytes(commit, 'docs/tests/formatendekking/bronnen.json'))
    assert config['source'] == next(x for x in catalog['sources'] if x['id'] == 'lo-dbf-1')
    raw = (DOC/'source.dbf').read_bytes()
    pin = config['source']
    assert len(raw) == pin['bytes'] and sha(raw) == pin['sha256'] and blob(raw) == pin['gitSha']
    for pin in config['notices']:
        data = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'] and blob(data) == pin['blob']
    for path,pin in config['retainedBindings'].items():
        data = (DOC/'retained'/path).read_bytes()
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'], path
    source = read_source(raw)  # derived before observing converter output
    assert (source['recordCount'], len(source['fields']), source['headerLength'], source['recordLength']) == (5,11,385,238)
    assert source['deletedCount'] == 0 and source['codepageMark'] == 0
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes == git_bytes(commit, 'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    historic = next(x for x in report['results'] if x['id'] == 'lo-dbf-1')
    cached = (DOC/'retained/historical-result.xlsx').read_bytes()
    assert historic['savedBytes'] == len(cached) and historic['savedSha256'] == sha(cached)
    observation = observe(DOC/'retained/historical-result.xlsx')
    baseline = check(source, observation)
    controls = []
    def control(name, mutate):
        changed = copy.deepcopy(observation)
        mutate(changed)
        failed = {c['case'] for c in check(source, changed) if not c['passed']}
        baseline_failed = {c['case'] for c in baseline if not c['passed']}
        controls.append(dict(control=name, passed=bool(failed-baseline_failed), newFailedCases=sorted(failed-baseline_failed)))
    control('numeric-value-as-string', lambda x: x['cells']['C2'].update(type='inlineStr'))
    control('unknown-logical-coerced-to-false', lambda x: x['cells'].__setitem__('F3', dict(type='b',value='0',formula=False,numFmtId=0,formatCode=None)))
    control('date-loses-date-style', lambda x: x['cells']['K2'].update(numFmtId=0,formatCode=None))
    control('record-anchor-changed', lambda x: x['cells']['A6'].update(value='different'))
    control('formula-with-same-cached-value', lambda x: x['cells']['C2'].update(formula=True))
    controls_native = []
    for name, mutate in [('header-length', lambda x: x.__setitem__(8,128)),
                         ('record-truncation', lambda x: x.pop()),
                         ('numeric-tail-nonzero', lambda x: x.__setitem__(385+1+50+50+2,65))]:
        changed = bytearray(raw)
        mutate(changed)
        try:
            read_source(bytes(changed))
            rejected = False
        except (AssertionError, ValueError, UnicodeError):
            rejected = True
        controls_native.append(dict(control=name, passed=rejected))
    formats = json.loads(git_bytes(commit, 'src/formaten.json'))
    assert 'dbf' in formats['xlsx']['invoer'] and 'dbf' not in formats['xlsx']['uitvoer']
    result = dict(status='QUALIFIED_BOUNDED_DBF_SOURCE_HISTORICAL_CONTENT_REUSE_ONLY', fullFormatAcceptance=False,
                  application=config['application'], source=config['source'], nativeOracle=source,
                  slotKinds=dict(collections.Counter(s['kind'] for r in source['records'] for s in r['slots'])),
                  historicalBinding=dict(date=report['date'], platform=report['platform'], converter=report['converter'],
                       profileSha256=report['profileSha256'], result=historic,
                       savedBytesIdentityVerified=True, currentP2RuntimeEquivalence=False),
                  independentHistoricalCases=baseline, outputNegativeControls=controls, nativeNegativeControls=controls_native,
                  snapshotObservation=observation,
                  p2Policy=dict(dbfInput=True, dbfOutput=False, conversionTarget='xlsx', defaultModernSave='xlsx',
                       browser='External converter is desktop-only. Static policy review only, no browser UI/runtime test.'),
                  remaining=['Exact P2 private converter + production helper + engine edit/UndoRedo + XLSX save + fresh-process reopen not proved by historical cache.',
                             'LDID 0, ASCII only; producer identity and general non-ASCII decoding not proved.',
                             'NUL numeric padding observation is not canonical DBF conformance certification.',
                             'Blank character/numeric and unknown logical project blank; SQL NULL distinctions not proved.',
                             'No deleted record, memo sidecar, binary field, source formula, rendering or layout witness.'],
                  newRuntimeOrCIStarted=False, originalUnmodified=sha((DOC/'source.dbf').read_bytes()) == config['source']['sha256'])
    assert all(c['passed'] for c in baseline + controls + controls_native), 'strict case failure; inspect raw evidence'
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'], historicalCases=len(baseline), outputControls=len(controls),
                         nativeControls=len(controls_native), slotKinds=result['slotKinds'], fullFormatAcceptance=False)))


if __name__ == '__main__':
    main()
