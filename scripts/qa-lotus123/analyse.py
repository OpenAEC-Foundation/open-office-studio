"""Static native-content-prefix and historical OOXML audit, without Office."""
import copy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import inspect_source

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/lotus123-source-2026-11-24'
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(point,path):
    return subprocess.check_output(['git','show',point+':'+path],cwd=ROOT)


def observe(path):
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rels = {r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        styles = ET.fromstring(z.read('xl/styles.xml'))
        format_codes = {int(f.get('numFmtId')):f.get('formatCode') for f in styles.findall('s:numFmts/s:numFmt',NS)}
        xfs = styles.findall('s:cellXfs/s:xf',NS)
        sheets = []
        for s in wb.findall('s:sheets/s:sheet',NS):
            rel = s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            target = rels[rel]
            part = target.lstrip('/') if target.startswith('/') else 'xl/'+target
            cells = {}
            for c in ET.fromstring(z.read(part)).findall('.//s:sheetData/s:row/s:c',NS):
                typ = c.get('t','n')
                value = c.findtext('s:v',None,NS)
                if typ=='s' and value is not None:
                    value = strings[int(value)]
                elif typ=='inlineStr':
                    value = ''.join(c.find('s:is',NS).itertext())
                if value is not None or c.find('s:f',NS) is not None:
                    format_id = int(xfs[int(c.get('s','0'))].get('numFmtId','0'))
                    cells[c.get('r')] = dict(type=typ,value=value,formula=c.findtext('s:f',None,NS),
                                            observedNumFmtId=format_id,observedFormatCode=format_codes.get(format_id))
            sheets.append(dict(name=s.get('name'),cells=cells))
        return dict(sheets=sheets)


def check(source,observed):
    cases = [dict(case='BOF-sheet-count',passed=len(observed['sheets'])==source['sourceSheetCountFromBOF'])]
    for sheet,name in source['explicitSheetNames'].items():
        i = int(sheet)
        cases.append(dict(case='sheet-'+sheet+':explicit-name',passed=i<len(observed['sheets']) and observed['sheets'][i]['name']==name))
    literal_refs = []
    for key,expected in source['cells'].items():
        i,ref = expected['sheet'],expected['address']
        actual = observed['sheets'][i]['cells'].get(ref) if i<len(observed['sheets']) else None
        if expected['kind']=='text':
            ok = actual is not None and actual['type'] in ('s','inlineStr') and actual['value']==expected['value']
        else:
            wanted = expected.get('cachedValue') if expected['kind']=='formula' else expected['value']
            ok = actual is not None and actual['type']=='n' and actual['value'] is not None and Decimal(actual['value'])==Decimal(wanted)
        cases.append(dict(case=key+':typed-value-or-cache',passed=ok,sourceKind=expected['kind'],
                          sourceRawValue=expected.get('value',expected.get('cachedValue')),
                          observedValue=None if actual is None else actual['value'],
                          qualification='Raw numeric equality only; native unit/format/epoch/projection unqualified' if expected['kind']=='number'
                              else 'Decoded same-sheet reference cache' if expected['kind']=='formula' else 'Literal ASCII cell text'))
        if expected['kind']=='formula':
            cases.append(dict(case=key+':reference-formula',passed=actual is not None and actual['formula']==expected['formula']['expression']))
        else:
            literal_refs.append((i,ref))
    cases.append(dict(case='decoded-literals-remain-literals',passed=all(i<len(observed['sheets']) and observed['sheets'][i]['cells'].get(ref,{}).get('formula') is None for i,ref in literal_refs)))
    return cases


def main():
    config = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = config['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip()==config['application']['tree']
    for path,pin in config['p2Bindings'].items():
        b = git_bytes(point,path)
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob'],path
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert config['source']==next(x for x in catalog['sources'] if x['id']=='lo-123-1')
    raw = (DOC/'source.123').read_bytes()
    pin = config['source']
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256'] and blob(raw)==pin['gitSha']
    for pin in config['notices']:
        b = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob']
    for path,pin in config['retainedBindings'].items():
        b = (DOC/'retained'/path).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
    source = inspect_source(raw)  # independent original-byte decoding before output
    assert source['cells']['0!A1']['sourceCacheMatchesCalculation']
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes==git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    historical = next(r for r in report['results'] if r['id']=='lo-123-1')
    saved = (DOC/'retained/historical-result.xlsx').read_bytes()
    assert len(saved)==historical['savedBytes'] and sha(saved)==historical['savedSha256']
    receipt = json.loads((DOC/'retained/historical-conversion-receipt.json').read_text(encoding='utf8'))
    observation = observe(DOC/'retained/historical-result.xlsx')
    cases = check(source,observation)
    baseline_failed = {c['case'] for c in cases if not c['passed']}
    output_controls = []
    for name,mutate in [('text-label-changed',lambda x:x['sheets'][0]['cells']['C1'].update(value='changed')),
                        ('number-type-changed',lambda x:x['sheets'][0]['cells']['B1'].update(type='inlineStr')),
                        ('compact-number-value-changed',lambda x:x['sheets'][2]['cells']['A1'].update(value='13')),
                        ('formula-dropped',lambda x:x['sheets'][0]['cells']['A1'].update(formula=None)),
                        ('formula-reference-changed',lambda x:x['sheets'][0]['cells']['A1'].update(formula='A9')),
                        ('known-sheet-name-changed',lambda x:x['sheets'][1].update(name='changed'))]:
        altered = copy.deepcopy(observation)
        mutate(altered)
        failed = {c['case'] for c in check(source,altered) if not c['passed']}-baseline_failed
        output_controls.append(dict(control=name,passed=bool(failed),newFailedCases=sorted(failed)))
    native_controls = []
    for name,mutate in [('wrong-family-word',lambda x:x.__setitem__(4,0)),
                        ('prefix-record-overrun',lambda x:struct.pack_into('<H',x,2991+2,0xffff)),
                        ('text-without-terminal-nul',lambda x:x.__setitem__(3041,65)),
                        ('formula-without-return',lambda x:x.__setitem__(3013,9))]:
        altered = bytearray(raw)
        mutate(altered)
        try:
            inspect_source(bytes(altered))
            rejected = False
        except (AssertionError,ValueError,struct.error):
            rejected = True
        native_controls.append(dict(control=name,passed=rejected))
    try:
        inspect_source(raw[:3799])
        truncated_rejected = False
    except (AssertionError,ValueError,struct.error):
        truncated_rejected = True
    native_controls.append(dict(control='truncated-content-prefix',passed=truncated_rejected))
    altered = bytearray(raw)
    struct.pack_into('<I',altered,3014+4+4,4<<6)
    native_controls.append(dict(control='changed-referenced-number-exposes-cache-mismatch',
                                 passed=not inspect_source(bytes(altered))['cells']['0!A1']['sourceCacheMatchesCalculation']))
    assert all(c['passed'] for c in output_controls+native_controls)
    formats = json.loads(git_bytes(point,'src/formaten.json'))
    assert '123' in formats['xlsx']['invoer'] and '123' not in formats['xlsx']['uitvoer']
    result = dict(status='BOUNDED_PREFIX_RAW_NUMBER_DIFFERENCES_NATIVE_SEMANTICS_OPEN' if baseline_failed else 'BOUNDED_LOTUS123_CONTENT_PREFIX_HISTORICAL_REUSE_ONLY',fullFormatAcceptance=False,
                  application=config['application'],source=config['source'],nativeOracle=source,
                  historicalBinding=dict(reportDate=report['date'],converter=report['converter'],profileSha256=report['profileSha256'],
                       result=historical,conversionReceipt=receipt,savedDigestIdentityVerified=True,currentP2RuntimeEquivalence=False),
                  independentHistoricalCases=cases,strictBoundedContentPassed=not baseline_failed,
                  outputOracleControls=output_controls,nativeReaderControls=native_controls,snapshotObservation=observation,
                  p2Policy=dict(conversionTarget='xlsx',native123Output=False,modernDefault='xlsx',browser='External converter desktop boundary; no actual browser test'),
                  remaining=['Only the first3800-byte content-prefix oracle is decoded; remaining26552 bytes and native objects/graphics/styles are opaque, not validated or rejected.',
                       'Seven raw-number differences correlate with output date/time styles; native per-cell format/epoch/projection must be independently qualified before calling these value loss or product defects.',
                       'Single reference formula cache matches the source calculation; actual recalculation/edit/UndoRedo/save/fresh-process acceptance remains unexecuted.',
                       'Labels mentioning styles/protection are ordinary cell text in this audit, not tested style/protection properties.',
                       'Comment control/metadata remain raw; no comment preservation or visual rendering acceptance.',
                       'Lotus123-family header1003 is not original producer/app-version attestation; no general Lotus/Works/Quattro variant claim.',
                       'Current P2 private-runtime/package/helper/engine/native Windows/Linux/macOS and supported browser checks remain OPEN.'],
                  newRuntimeOrCIStarted=False,originalUnchanged=sha((DOC/'source.123').read_bytes())==config['source']['sha256'])
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],prefixRecords=source['prefix']['recordCount'],decodedCells=len(source['cells']),
                         historicalPassed=sum(c['passed'] for c in cases),historicalFailed=len(baseline_failed),
                         outputControls=len(output_controls),nativeControls=len(native_controls),fullFormatAcceptance=False)))
    if baseline_failed:
        raise SystemExit(2)


if __name__=='__main__':
    main()
