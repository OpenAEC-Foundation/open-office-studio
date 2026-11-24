"""Static source/output audit. Exit 2 means the retained strict finding remains."""
import copy
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import statistics
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import inspect_source

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/wks-source-2026-11-24'
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(commit,path):
    return subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT)


def expression(node):
    if node['kind']=='ref':
        return node['address']
    if node['kind']=='range':
        return expression(node['first'])+':'+expression(node['last'])
    if node['kind']=='integer':
        return str(node['value'])
    if node['kind']=='text':
        return '"'+node['value']+'"'
    args = [expression(a) for a in node['args']]
    name = node['function']
    if name=='EQUAL':
        return args[0]+'='+args[1]
    return name+'('+','.join(args)+')'


def normalize(text):
    if text is None:
        return None
    text = text.removeprefix('=')
    # Bounded numeric-only equivalence, not general COUNT/COUNTA semantics.
    for name in ('COUNT','COUNTA'):
        if text.startswith(name+'('):
            return 'COUNT_NUMERIC_ONLY_FAMILY'+text[len(name):]
    for name in ('STDEVP','STDEV.P','STDEVPA'):
        if text.startswith(name+'('):
            return 'STD_POPULATION_INTERPRETATION'+text[len(name):]
    return text


def observe(path):
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = wb.findall('s:sheets/s:sheet',NS)
        assert len(sheets)==1
        rel = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = next(r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')) if r.get('Id')==rel)
        part = target.lstrip('/') if target.startswith('/') else 'xl/'+target
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        cells = {}
        for c in ET.fromstring(z.read(part)).findall('.//s:sheetData/s:row/s:c',NS):
            typ = c.get('t','n')
            value = c.findtext('s:v',None,NS)
            if typ=='s' and value is not None:
                value = strings[int(value)]
            elif typ=='inlineStr':
                value = ''.join(c.find('s:is',NS).itertext())
            cells[c.get('r')] = dict(type=typ,value=value,formula=c.findtext('s:f',None,NS))
        return dict(sheetName=sheets[0].get('name'),cells=cells)


def check(source,observed):
    cases = []
    def case(name,ok,**detail):
        cases.append(dict(case=name,passed=bool(ok),**detail))
    for ref,expected in source['cells'].items():
        actual = observed['cells'].get(ref)
        value = expected.get('value') if expected['kind']=='number' else expected['cachedValue']
        if isinstance(value,str):
            ok = actual is not None and actual['type'] in ('s','str','inlineStr') and actual['value']==value
        else:
            ok = actual is not None and actual['type']=='n' and actual['value'] is not None and Decimal(actual['value'])==Decimal(str(value))
        case(ref+':typed-value-or-cache',ok)
        if expected['kind']=='formula':
            wanted = expression(expected['formula']['ast'])
            case(ref+':source-expression',actual is not None and normalize(actual['formula'])==wanted,
                 expectedExpression=wanted,actualExpression=None if actual is None else actual['formula'],
                 qualification='conditional population interpretation; producer semantics unresolved' if ref=='C2' else 'bounded numeric-only COUNT-family interpretation' if ref=='B2' else 'bounded decoded expression')
    case('numeric-literals-remain-literals',all(observed['cells'].get(ref,{}).get('formula') is None for ref,c in source['cells'].items() if c['kind']=='number'))
    case('no-extra-valued-cells',all(ref in source['cells'] or c['value'] in (None,'') for ref,c in observed['cells'].items()))
    c2 = observed['cells'].get('C2',{})
    f = c2.get('formula')
    expected_cache = None
    if f in ('STDEV(A1,B1)','STDEV.S(A1,B1)'):
        expected_cache = statistics.stdev([float(observed['cells'][r]['value']) for r in ('A1','B1')])
    elif f in ('STDEVP(A1,B1)','STDEV.P(A1,B1)','STDEVPA(A1,B1)'):
        expected_cache = statistics.pstdev([float(observed['cells'][r]['value']) for r in ('A1','B1')])
    ok = expected_cache is not None and c2.get('type')=='n' and c2.get('value') is not None and math.isclose(float(c2['value']),expected_cache,rel_tol=1e-12)
    case('C2:output-expression-cache-consistency',ok,expectedFromOutputExpression=expected_cache,actualCache=c2.get('value'),
         qualification='Output formula/cache mathematical consistency only; no native producer or actual recalculation claim')
    return cases


def main():
    config = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = config['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip()==config['application']['tree']
    for path,pin in config['p2Bindings'].items():
        b = git_bytes(point,path)
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob'],path
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert config['source']==next(s for s in catalog['sources'] if s['id']=='lo-wks-1')
    raw = (DOC/'source.wks').read_bytes()
    pin = config['source']
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256'] and blob(raw)==pin['gitSha']
    for pin in config['notices']:
        b = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob']
    for path,pin in config['retainedBindings'].items():
        b = (DOC/'retained'/path).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
    source = inspect_source(raw)  # source-derived before observing XLSX
    assert len(source['records'])==20 and len(source['cells'])==7
    assert all(c.get('calculationMatchesSourceCache',True) for c in source['cells'].values())
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes==git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    historical = next(r for r in report['results'] if r['id']=='lo-wks-1')
    cached = (DOC/'retained/historical-result.xlsx').read_bytes()
    assert len(cached)==historical['savedBytes'] and sha(cached)==historical['savedSha256']
    observation = observe(DOC/'retained/historical-result.xlsx')
    cases = check(source,observation)
    failed = {c['case'] for c in cases if not c['passed']}
    assert failed=={'C2:source-expression','C2:output-expression-cache-consistency'},'unexpected strict historical result'
    controls = []
    for name,mutate in [('numeric-type-changed',lambda x:x['cells']['A1'].update(type='inlineStr')),
                        ('sum-formula-removed',lambda x:x['cells']['A2'].update(formula=None)),
                        ('sum-range-changed',lambda x:x['cells']['A2'].update(formula='SUM(A1:B2)')),
                        ('if-formula-literal-changed',lambda x:x['cells']['A5'].update(formula='IF(MOD(A4,2)=1,"Odd","Odd")')),
                        ('string-cache-changed',lambda x:x['cells']['A5'].update(value='Odd'))]:
        altered = copy.deepcopy(observation)
        mutate(altered)
        new_failed = {c['case'] for c in check(source,altered) if not c['passed']}-failed
        controls.append(dict(control=name,passed=bool(new_failed),newFailedCases=sorted(new_failed)))
    corrected = copy.deepcopy(observation)
    corrected['cells']['C2']['formula']='STDEVP(A1,B1)'
    controls.append(dict(control='oracle-only-population-expression-model-resolves-both-cases',
                         passed=all(c['passed'] for c in check(source,corrected)),
                         boundary='In-memory observer control, not a product fix, generated output or accepted producer contract'))
    native_controls = []
    for name,mutate in [('wrong-bof',lambda x:x.__setitem__(4,0)),
                        ('record-overrun',lambda x:struct.pack_into('<H',x,0x23f+2,0xffff)),
                        ('truncated-eof',lambda x:x.pop()),
                        ('unknown-rpn-token',lambda x:x.__setitem__(0x261+4+15,0x7f)),
                        ('orphan-string-companion',lambda x:struct.pack_into('<H',x,0x2fd+4+1,1))]:
        altered = bytearray(raw)
        mutate(altered)
        try:
            inspect_source(bytes(altered))
            rejected = False
        except (AssertionError,ValueError,struct.error,IndexError):
            rejected = True
        native_controls.append(dict(control=name,passed=rejected))
    altered = bytearray(raw)
    struct.pack_into('<d',altered,0x23f+4+5,12)
    altered_oracle = inspect_source(bytes(altered))
    native_controls.append(dict(control='changed-input-exposes-source-cache-mismatch',
                    passed=not altered_oracle['cells']['A2']['calculationMatchesSourceCache']))
    assert all(c['passed'] for c in controls+native_controls)
    formats = json.loads(git_bytes(point,'src/formaten.json'))
    assert 'wks' in formats['xlsx']['invoer'] and 'wks' not in formats['xlsx']['uitvoer']
    result = dict(status='HISTORICAL_STRICT_FORMULA_CACHE_INCONSISTENCY_CURRENT_RUNTIME_OPEN',fullFormatAcceptance=False,
                  application=config['application'],source=config['source'],nativeOracle=source,
                  historicalBinding=dict(reportDate=report['date'],converter=report['converter'],profileSha256=report['profileSha256'],
                       result=historical,savedRawDigestIdentityVerified=True,currentP2RuntimeEquivalence=False),
                  independentHistoricalCases=cases,strictPassed=False,outputControls=controls,nativeControls=native_controls,
                  snapshotObservation=observation,
                  p2Policy=dict(conversionTarget='xlsx',wksOutput=False,modernDefault='xlsx',browser='External desktop converter required; static inspection only'),
                  boundaries=['BOF0404 / WKS filename does not independently attest a particular Works/Lotus producer version.',
                       'C2 population-source interpretation is conditional on the pinned Lotus opcode map; source cache agrees but does not prove a normative producer contract.',
                       'Historical output STDEV(A1,B1) cache0.75 is mathematically inconsistent with sample STDEV for10/11.5; actual recalculation was not run.',
                       'Numeric-only COUNT-family witness does not distinguish COUNT and COUNTA for text/empty/boolean data.',
                       'No source sheet name, rendering/font/style/macro/encryption/full-format acceptance.',
                       'Current P2 pinned converter/helper/engine edit/UndoRedo/explicit modern save/fresh-process and platform/browser acceptance remain OPEN.'],
                  newRuntimeOrCIStarted=False,originalUnchanged=sha((DOC/'source.wks').read_bytes())==config['source']['sha256'])
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],historicalPassed=sum(c['passed'] for c in cases),historicalFailed=len(failed),
                         outputControls=len(controls),nativeControls=len(native_controls),strictPassed=False,fullFormatAcceptance=False)))
    raise SystemExit(2)


if __name__=='__main__':
    main()
