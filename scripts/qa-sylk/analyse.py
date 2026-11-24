"""Static source/receipt reuse only; never starts an application or converter."""
import copy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import read_source

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/sylk-source-2026-11-24'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(commit, path):
    return subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT)


def observe(path):
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = wb.findall('s:sheets/s:sheet',NS)
        assert len(sheets) == 1
        rel = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = next(r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')) if r.get('Id') == rel)
        part = target.lstrip('/') if target.startswith('/') else 'xl/'+target
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        styles = ET.fromstring(z.read('xl/styles.xml'))
        fmts = {int(f.get('numFmtId')): f.get('formatCode') for f in styles.findall('s:numFmts/s:numFmt',NS)}
        xfs = styles.findall('s:cellXfs/s:xf',NS)
        cells = {}
        for c in ET.fromstring(z.read(part)).findall('.//s:sheetData/s:row/s:c',NS):
            typ = c.get('t','n')
            value = c.findtext('s:v',None,NS)
            if typ == 's' and value is not None:
                value = strings[int(value)]
            elif typ == 'inlineStr':
                value = ''.join(c.find('s:is',NS).itertext())
            fmt_id = int(xfs[int(c.get('s','0'))].get('numFmtId','0'))
            cells[c.get('r')] = dict(type=typ,value=value,formula=c.find('s:f',NS) is not None,
                                     numFmtId=fmt_id,formatCode=fmts.get(fmt_id))
        return dict(sheetName=sheets[0].get('name'), workbookProperties=dict(wb.find('s:workbookPr',NS).attrib),cells=cells)


def check(source, observed):
    cases = []
    def case(name, passed):
        cases.append(dict(case=name,passed=bool(passed)))
    for ref, expected in source['cells'].items():
        cell = observed['cells'].get(ref)
        kind = expected['kind']
        if kind == 'number':
            ok = cell is not None and cell['type'] == 'n' and cell['value'] is not None and not cell['formula']
            if ok:
                ok = Decimal(cell['value']) == Decimal(expected['value'])
            case(ref+':literal-number',ok)
            # Used numeric formats are explicitly present in the input; renderer,
            # calendar epoch, locale and unused P codes are separate boundaries.
            case(ref+':numeric-format-code',cell is not None and cell['formatCode'] == expected['formatCode'])
        elif kind == 'ascii-text':
            case(ref+':ascii-text',cell is not None and cell['type'] in ('s','inlineStr')
                 and not cell['formula'] and cell['value'] == expected['value'])
        else:
            # Presence/type only. No Unicode value or visual fidelity acceptance.
            case(ref+':opaque-text-type-only',cell is not None and cell['type'] in ('s','inlineStr') and not cell['formula'])
    case('no-extra-valued-cells',all(ref in source['cells'] or c['value'] in (None,'') for ref,c in observed['cells'].items()))
    case('no-output-formulas',not any(c['formula'] for c in observed['cells'].values()))
    return cases


def main():
    config = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = config['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip() == config['application']['tree']
    for path,pin in config['p2Bindings'].items():
        data = git_bytes(point,path)
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'] and blob(data) == pin['blob'], path
    comparison = config['i3P2ComponentComparison']
    assert comparison['p2Commit'] == point
    for component in comparison['components']:
        assert sha(git_bytes(point,component['path'])) == component['p2Sha256']
        assert component['byteIdentical'] == (component['i3Sha256'] == component['p2Sha256'])
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert config['source'] == next(s for s in catalog['sources'] if s['id'] == 'lo-slk-2')
    rejected = next(s for s in catalog['sources'] if s['id'] == 'lo-slk-1')
    assert rejected['expected'] == 'reject' and rejected['bytes'] == 104
    raw = (DOC/'source.slk').read_bytes()
    pin = config['source']
    assert len(raw) == pin['bytes'] and sha(raw) == pin['sha256'] and blob(raw) == pin['gitSha']
    for pin in config['notices']:
        data = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'] and blob(data) == pin['blob']
    for path,pin in config['retainedBindings'].items():
        data = (DOC/'retained'/path).read_bytes()
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'],path
    for path,pin in config['referenceGitBindings'].items():
        data = (DOC/'retained'/path).read_bytes()
        assert len(data) == pin['bytes'] and sha(data) == pin['sha256'] and blob(data) == pin['blob'],path
    source = read_source(raw)  # no converter output involved in source decoding
    assert source['bounds'] == {'Y':11,'X':10} and len(source['cells']) == 80
    assert source['cellKinds'] == {'ascii-text':17,'number':35,'opaque-high-byte-text':28}
    assert len(source['formats']) == 19
    assert source['formats'][5] == '"$"#,##0 ;("$"#,##0)', 'doubled semicolon decoding'
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes == git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    historical_report = json.loads(report_bytes)
    historic = next(r for r in historical_report['results'] if r['id'] == 'lo-slk-2')
    cached = (DOC/'retained/historical-result.xlsx').read_bytes()
    assert len(cached) == historic['savedBytes'] and sha(cached) == historic['savedSha256']
    observation = observe(DOC/'retained/historical-result.xlsx')
    cases = check(source,observation)
    controls = []
    for name,mutate in [
        ('numeric-type-changed',lambda x: x['cells']['B6'].update(type='inlineStr')),
        ('ascii-anchor-changed',lambda x: x['cells']['A8'].update(value='different')),
        ('date-format-code-removed',lambda x: x['cells']['B2'].update(formatCode='General')),
        ('numeric-format-code-changed',lambda x: x['cells']['J10'].update(formatCode='0')),
        ('formula-added-same-cache',lambda x: x['cells']['J6'].update(formula=True)),
        ('opaque-text-type-lost',lambda x: x['cells']['A3'].update(type='n')),
    ]:
        altered = copy.deepcopy(observation)
        mutate(altered)
        failed = {c['case'] for c in check(source,altered) if not c['passed']}
        baseline_failed = {c['case'] for c in cases if not c['passed']}
        controls.append(dict(control=name,passed=bool(failed-baseline_failed),newFailedCases=sorted(failed-baseline_failed)))
    native_controls = []
    for name,changed in [('missing-id',raw.split(b'\r',1)[1]),('missing-eof',raw[:-2]),
                         ('unexpected-formula-field',raw.replace(b'C;K1100.64',b'C;K1100.64;E1+1',1))]:
        try:
            read_source(changed)
            rejected_control = False
        except (AssertionError,ValueError,UnicodeError):
            rejected_control = True
        native_controls.append(dict(control=name,passed=rejected_control))
    formats = json.loads(git_bytes(point,'src/formaten.json'))
    assert 'slk' in formats['xlsx']['invoer'] and formats['xlsx']['uitvoer']['slk']['filter'] == 'SYLK'
    audit = json.loads((DOC/'retained/i3-independent-audit.json').read_text(encoding='utf8'))
    assert audit['sourceSha256'] == sha(raw) and audit['applicationCommit'] != point
    historical_ledger = []
    for platform in audit['platforms']:
        old_bytes = (DOC/'retained'/('i3-'+platform['platform']+'-report.json')).read_bytes()
        assert sha(old_bytes) == platform['reportSha256']
        old = json.loads(old_bytes)
        assert old['applicationCommit'] == audit['applicationCommit'] and old['source']['sha256'] == sha(raw)
        for package in old['cases']:
            slk = next(e for e in package['extensions'] if e['ext'] == 'slk')
            assert slk['status'] == 'passed' and slk['originalUnchanged'] and slk['expectedCellsChecked'] == 12
            historical_ledger.append(dict(platform=old['platform'],packageKind=package['kind'],packageSha256=package['packageSha256'],
                  runtimeVersion=package['runtimeVersion'],profileSha256=package['profileSha256'],
                  cleanupReported=package['temporaryDisposed'],slk=slk))
    result = dict(status='QUALIFIED_BOUNDED_SYLK_SOURCE_HISTORICAL_REUSE_ONLY',fullFormatAcceptance=False,
                  application=config['application'],source=config['source'],nativeOracle=source,
                  historicalCache=dict(reportDate=historical_report['date'],
                       targetedProbes=[p for p in historical_report['probes'] if 'lo-slk-2' in p['ids']],
                       converter=historical_report['converter'],
                       profileSha256=historical_report['profileSha256'],savedDigestIdentityVerified=True,result=historic),
                  independentHistoricalCases=cases,outputNegativeControls=controls,nativeReaderControls=native_controls,
                  snapshotObservation=observation,
                  recordedI3P2ComponentComparison=comparison,
                  i3ReportedEvidence=dict(applicationCommit=audit['applicationCommit'],applicationTree=audit['applicationTree'],
                       run=audit['run'],harnessCommit=audit['harnessCommit'],packages=historical_ledger,
                       scope='Previously audited I3 receipts reused; no fresh runtime, artifact download or native test performed here.',
                       currentP2RuntimeEquivalence=False,freshProcessOrUndoRedoNotEstablished=True),
                  p2Policy=dict(input='slk',conversionTarget='xlsx',defaultExportProposal='slk',modernSave='explicit XLSX choice required',
                       browser='Static no-Tauri external-converter boundary only; no current browser UI test.'),
                  remaining=['28 high-byte quoted strings have raw-byte/type evidence only, not proven charset/Unicode/rendering fidelity.',
                       '35 native numeric values include 8 date-formatted serials; no independent source calendar epoch inferred.',
                       'No source formula/cached-formula pair; no recalculation or general formula-import acceptance.',
                       'I3 twelve-cell/edit/new-engine proof is historical, not P2 or separate-process evidence.',
                       'P2 private-runtime/helper/engine/edit/UndoRedo/explicit XLSX-save/fresh-process reopen and actual platform/browser tests remain unexecuted.'],
                  originalUnchanged=sha((DOC/'source.slk').read_bytes()) == config['source']['sha256'],newRuntimeOrCIStarted=False)
    assert all(c['passed'] for c in cases+controls+native_controls), 'strict check failure'
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],cells=len(source['cells']),cellKinds=source['cellKinds'],
                         historicalCases=len(cases),outputControls=len(controls),nativeControls=len(native_controls),
                         i3PackagesReused=len(historical_ledger),fullFormatAcceptance=False)))


if __name__ == '__main__':
    main()
