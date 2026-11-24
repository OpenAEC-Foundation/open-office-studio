"""Static native WB1 / historical OOXML audit; no converter, engine or GUI."""
import ast
import collections
import copy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import inspect_source, SharedLookupBoundary

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/wb1-source-2026-11-24'
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(point,path):
    return subprocess.check_output(['git','show',point+':'+path],cwd=ROOT)


def number_equal(a,b):
    # Explicit serialization projection, not exact IEEE-bit preservation.
    return Decimal(format(Decimal(a),'.15g'))==Decimal(format(Decimal(b),'.15g'))


def arithmetic_tree(text):
    def convert(node):
        if isinstance(node,ast.Constant) and type(node.value) is int:
            return dict(kind='integer',value=node.value)
        if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Div):
            return dict(kind='divide',left=convert(node.left),right=convert(node.right))
        raise ValueError('outside bounded integer/division output grammar')
    return convert(ast.parse(text.removeprefix('='),mode='eval').body)


def observe(path):
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        styles = ET.fromstring(z.read('xl/styles.xml'))
        formats = {int(f.get('numFmtId')):f.get('formatCode') for f in styles.findall('s:numFmts/s:numFmt',NS)}
        xfs = styles.findall('s:cellXfs/s:xf',NS)
        sheets = []
        for s in wb.findall('s:sheets/s:sheet',NS):
            target = rels[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
            part = target.lstrip('/') if target.startswith('/') else 'xl/'+target
            cells = {}
            for c in ET.fromstring(z.read(part)).findall('.//s:sheetData/s:row/s:c',NS):
                typ = c.get('t','n')
                value = c.findtext('s:v',None,NS)
                if typ=='s' and value is not None:
                    value = strings[int(value)]
                elif typ=='inlineStr':
                    value = ''.join(c.find('s:is',NS).itertext())
                fmt_id = int(xfs[int(c.get('s','0'))].get('numFmtId','0'))
                cells[c.get('r')] = dict(type=typ,value=value,formula=c.findtext('s:f',None,NS),
                                         observedNumFmtId=fmt_id,observedFormatCode=formats.get(fmt_id))
            sheets.append(dict(name=s.get('name'),cells=cells))
        return dict(sheets=sheets)


def check(source,observed):
    cases = [dict(case='source-page-count',passed=len(observed['sheets'])==len(source['sheets']))]
    for s in source['sheets']:
        if s['name'] is not None:
            i = s['id']
            cases.append(dict(case='sheet-'+str(i)+':explicit-name',passed=i<len(observed['sheets']) and observed['sheets'][i]['name']==s['name']))
    literal_checks = []
    for key,expected in source['cells'].items():
        i,ref,kind = expected['sheet'],expected['address'],expected['kind']
        actual = observed['sheets'][i]['cells'].get(ref) if i<len(observed['sheets']) else None
        if kind=='formula' and not expected['formula']['numericSemanticsAccepted']:
            continue  # explicitly retained below as an unqualified source case
        wanted = expected.get('value')
        if kind=='blank':
            ok = actual is None or actual['value'] in (None,'') and actual['formula'] is None
            qualification = 'Blank projection only, no style or SQL NULL claim'
        elif kind=='text':
            ok = actual is not None and actual['type'] in ('s','inlineStr') and actual['value']==wanted
            qualification = 'ASCII before first NUL; post-terminator bytes unaccepted'
        else:
            if kind=='formula':
                wanted = expected['formula']['cachedValue']
            ok = actual is not None and actual['type']=='n' and actual['value'] is not None and number_equal(actual['value'],wanted)
            qualification = '15-significant-digit numeric projection; native format/unit/epoch semantics not certified'
        cases.append(dict(case=key+':typed-value-or-cache',passed=bool(ok),sourceKind=kind,sourceValue=wanted,
                          observedValue=None if actual is None else actual['value'],qualification=qualification))
        if kind=='formula':
            node = expected['formula']['ast']
            if node['kind']=='ref':
                ok = actual is not None and actual['formula']==node['reference']['candidateAddress']
            else:
                try:
                    ok = actual is not None and actual['formula'] is not None and arithmetic_tree(actual['formula'])==node
                except (SyntaxError,ValueError):
                    ok = False
            cases.append(dict(case=key+':decoded-expression',passed=ok))
        else:
            literal_checks.append((i,ref))
    cases.append(dict(case='literal-cells-no-spurious-formulas',passed=all(i<len(observed['sheets']) and observed['sheets'][i]['cells'].get(ref,{}).get('formula') is None for i,ref in literal_checks)))
    return cases


def main():
    config = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = config['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip()==config['application']['tree']
    for path,pin in config['p2Bindings'].items():
        b = git_bytes(point,path)
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob'],path
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert config['source']==next(x for x in catalog['sources'] if x['id']=='lo-wb1-1')
    raw = (DOC/'source.wb1').read_bytes()
    pin = config['source']
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256'] and blob(raw)==pin['gitSha']
    for pin in config['notices']:
        b = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob']
    for path,pin in config['retainedBindings'].items():
        b = (DOC/'retained'/path).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
    source = inspect_source(raw)  # must precede observing historical conversion output
    assert source['lookupOpcodesObserved']==0
    assert all(c['formula'].get('sourceCacheMatchesCalculation',True) for c in source['cells'].values() if c['kind']=='formula')
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes==git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    old = next(x for x in report['results'] if x['id']=='lo-wb1-1')
    saved = (DOC/'retained/historical-result.xlsx').read_bytes()
    assert len(saved)==old['savedBytes'] and sha(saved)==old['savedSha256']
    observation = observe(DOC/'retained/historical-result.xlsx')
    cases = check(source,observation)
    baseline_failed = {c['case'] for c in cases if not c['passed']}
    output_controls = []
    for name,mutate in [('text-changed',lambda x:x['sheets'][0]['cells']['A2'].update(value='changed')),
                        ('integer-type-changed',lambda x:x['sheets'][0]['cells']['B1'].update(type='inlineStr')),
                        ('reference-formula-dropped',lambda x:x['sheets'][0]['cells']['A1'].update(formula=None)),
                        ('division-association-changed',lambda x:x['sheets'][0]['cells']['C7'].update(formula='12/(3/1967)')),
                        ('known-name-changed',lambda x:x['sheets'][0].update(name='changed')),
                        ('reference-cache-changed',lambda x:x['sheets'][0]['cells']['C9'].update(value='3'))]:
        altered = copy.deepcopy(observation)
        mutate(altered)
        failed = {c['case'] for c in check(source,altered) if not c['passed']}-baseline_failed
        output_controls.append(dict(control=name,passed=bool(failed),newFailedCases=sorted(failed)))
    native_controls = []
    def no_nul(x):
        x[8031:8033] = b'AA'
    for name,mutate in [('wrong-wb-family',lambda x:x.__setitem__(4,2)),
                        ('record-overrun',lambda x:struct.pack_into('<H',x,173775+2,0xffff)),
                        ('truncated-eof',lambda x:x.pop()),
                        ('label-without-nul',no_nul),
                        ('unknown-formula-token',lambda x:x.__setitem__(7983+4+20,0x7f))]:
        altered = bytearray(raw)
        mutate(altered)
        try:
            inspect_source(bytes(altered))
            rejected = False
        except (AssertionError,ValueError,struct.error,IndexError):
            rejected = True
        native_controls.append(dict(control=name,passed=rejected))
    altered = bytearray(raw)
    struct.pack_into('<h',altered,8167+4+6,3)
    native_controls.append(dict(control='changed-reference-value-exposes-source-cache-mismatch',
                                 passed=not inspect_source(bytes(altered))['cells']['0!A1']['formula']['sourceCacheMatchesCalculation']))
    altered = bytearray(raw)
    altered[8032] = ord('Q')
    native_controls.append(dict(control='post-nul-byte-not-promoted-to-label',
                                 passed=inspect_source(bytes(altered))['cells']['0!A2']['value']==source['cells']['0!A2']['value']))
    assert all(c['passed'] for c in output_controls+native_controls)
    unqualified = {k:dict(accepted=False,boundary=c['formula']['boundary'],source=c,
                         historicalObservation=observation['sheets'][c['sheet']]['cells'].get(c['address']))
                   for k,c in source['cells'].items() if c['kind']=='formula' and not c['formula']['numericSemanticsAccepted']}
    formats = json.loads(git_bytes(point,'src/formaten.json'))
    assert 'wb1' in formats['xlsx']['invoer'] and 'wb1' not in formats['xlsx']['uitvoer']
    arithmetic = source['cells']['0!C7']['formula']
    numerator,denominator = arithmetic['independentFraction'].split('/')
    fraction_value = Decimal(numerator)/Decimal(denominator)
    stored_arithmetic = observation['sheets'][0]['cells']['C7']
    precision_observation = dict(sourceFraction=arithmetic['independentFraction'],
          independentlyCalculatedDecimal=str(fraction_value),storedFormula=stored_arithmetic['formula'],
          storedCache=stored_arithmetic['value'],absoluteDecimalDifference=str(abs(fraction_value-Decimal(stored_arithmetic['value']))),
          boundary='Static historical cache precision observation; actual recalculation/current runtime and cause not established')
    result = dict(status='BOUNDED_WB1_HISTORICAL_DIFFERENCES_SEMANTICS_OPEN' if baseline_failed else 'BOUNDED_WB1_SOURCE_HISTORICAL_REUSE_ONLY',
                  fullFormatAcceptance=False,application=config['application'],source=config['source'],nativeOracle=source,
                  historicalBinding=dict(reportDate=report['date'],converter=report['converter'],profileSha256=report['profileSha256'],
                       result=old,savedDigestIdentityVerified=True,currentP2RuntimeEquivalence=False),
                  cellKinds=dict(collections.Counter(c['kind'] for c in source['cells'].values())),
                  independentHistoricalCases=cases,strictBoundedContentPassed=not baseline_failed,
                  explicitlyUnqualifiedSourceCases=unqualified,outputOracleControls=output_controls,nativeReaderControls=native_controls,
                  historicalPrecisionObservation=precision_observation,
                  snapshotObservation=observation,decimalProjection='15 significant decimal digits; exact IEEE-bit/lexeme identity not claimed',
                  p2Policy=dict(conversionTarget='xlsx',wb1Output=False,modernDefault='xlsx',browser='External desktop converter; static source inspection only'),
                  remaining=['Unqualified nonfinite-cache/negated-reference/error projection at sheet1 B6 is explicit, not counted as a numeric pass.',
                       'Native style/unit/date/time mapping and all non-cell graph/font/macro/link/encryption semantics unqualified.',
                       'Historical evidence does not establish current P2 private package/runtime/helper/engine edit/UndoRedo/recalculation/save/fresh-process acceptance.',
                       'Native Windows/Linux/macOS and actual supported browser UI remain OPEN; no general Quattro/Works/Lotus variant claim.'],
                  boundary381=source['boundary381'],newRuntimeOrCIStarted=False,
                  originalUnchanged=sha((DOC/'source.wb1').read_bytes())==config['source']['sha256'])
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],recordCount=source['recordCount'],cellKinds=result['cellKinds'],
                         historicalPassed=sum(c['passed'] for c in cases),historicalFailed=len(baseline_failed),unqualifiedCases=len(unqualified),
                         outputControls=len(output_controls),nativeControls=len(native_controls),fullFormatAcceptance=False)))
    if baseline_failed:
        raise SystemExit(2)


if __name__=='__main__':
    main()
