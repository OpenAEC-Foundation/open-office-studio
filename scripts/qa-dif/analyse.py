"""Static DIF source and digest-bound historical XLSX replay, without runtime."""
import argparse
import copy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import posixpath
import subprocess
import zipfile
from xml.etree import ElementTree as E
from native import native

ROOT=Path(__file__).resolve().parents[2]
PROOF=ROOT/'docs/tests/dif-2026-11-24'
CONFIG=json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
S='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def observe(parts,oracle):
    workbook=E.fromstring(parts['xl/workbook.xml']);sheets=list(workbook.find(S+'sheets'))
    rels={x.get('Id'):x for x in E.fromstring(parts['xl/_rels/workbook.xml.rels'])}
    observed=[];sheetpaths=[]
    for sheet in sheets:
        rel=rels[sheet.get(R+'id')];assert rel.get('TargetMode')!='External' and rel.get('Type').endswith('/worksheet')
        target=rel.get('Target');path=target[1:] if target.startswith('/') else posixpath.normpath('xl/'+target)
        assert not path.startswith('../') and path in parts;sheetpaths.append(path)
        cells={}
        for c in E.fromstring(parts[path]).iter(S+'c'):
            value=c.findtext(S+'v');formula=c.findtext(S+'f');kind=c.get('t','n')
            if value is None and formula is None:continue
            if kind=='n' and value is not None:
                n=Decimal(value);assert n.is_finite();value=int(n) if n==int(n) else str(n)
            assert c.get('r') not in cells
            cells[c.get('r')]={'kind':'number' if kind=='n' else kind,'value':value,'formula':formula}
        observed.append({'name':sheet.get('name'),'cells':cells})
    content=next(x.get('ContentType') for x in E.fromstring(parts['[Content_Types].xml']) if x.get('PartName')=='/xl/workbook.xml')
    cases=[{'case':'ordinary XLSX main type','actual':content,'expected':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'},
           {'case':'one sheet matching TABLE label, not producer identity','actual':[x['name'] for x in observed],'expected':[oracle['tableLabel']]},
           {'case':'exact first-tuple sparse numeric cells and types, no invented values/formulas','actual':[x['cells'] for x in observed],'expected':[oracle['expectedCellsInFirstTuple']]}]
    for c in cases:c['passed']=c['actual']==c['expected']
    return {'method':'Independent XLSX XML/relationships check of preserved historical result only','cases':cases,
            'boundedNumericPrefixMatches':all(c['passed'] for c in cases),'worksheetPaths':sheetpaths,
            'completeDIFGrammarAccepted':False,'newP2RuntimeAccepted':False,'fullFormatAccepted':False}

def analyse():
    s=CONFIG['source'];source=(PROOF/'source.dif').read_bytes()
    assert len(source)==s['bytes'] and sha(source)==s['sha256'] and blob(source)==s['gitSha']
    for n in CONFIG['notices']:
        b=(PROOF/'source-notices'/n['path']).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for path,n in CONFIG['p2Bindings'].items():
        b=subprocess.check_output(['git','cat-file','blob',n['blob']],cwd=ROOT)
        assert len(b)==n['bytes'] and sha(b)==n['sha256']
        assert subprocess.check_output(['git','rev-parse',CONFIG['application']['commit']+':'+path],cwd=ROOT,text=True).strip()==n['blob']
    oracle=native(source)
    oldbytes=(PROOF/'retained/historical-windows-report.json').read_bytes()
    assert sha(oldbytes)==CONFIG['p2Bindings']['docs/tests/formatendekking/resultaat-windows.json']['sha256']
    old=json.loads(oldbytes);row=next(x for x in old['results'] if x['id']=='lo-dif-1')
    for name,n in CONFIG['cacheBindings'].items():
        b=(PROOF/'retained'/name).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256']
    saved=(PROOF/'retained/cached-result.xlsx').read_bytes()
    assert len(saved)==row['savedBytes'] and sha(saved)==row['savedSha256']
    assert row['passed'] and row['outcome']=='opened-saved-reopened'
    with zipfile.ZipFile(PROOF/'retained/cached-result.xlsx') as z:parts={n:z.read(n) for n in z.namelist()}
    observed=observe(parts,oracle);assert observed['boundedNumericPrefixMatches']
    controls=[]
    for name in ['last-numeric-value-lost','numeric-coerced-to-string','transposed-tuple','injected-formula-with-same-cache','changed-table-label']:
        changed=copy.copy(parts);path=observed['worksheetPaths'][0];root=E.fromstring(parts[path]);data=root.find(S+'sheetData');cells=list(root.iter(S+'c'))
        if name=='last-numeric-value-lost':
            rownode=data.find(S+'row');rownode.remove(next(c for c in rownode if c.get('r')=='AF1'))
        elif name=='numeric-coerced-to-string':cells[0].set('t','str')
        elif name=='transposed-tuple':
            for child in list(data):data.remove(child)
            for i,c in enumerate(cells):
                c.set('r','A'+str(i+1));E.SubElement(data,S+'row',{'r':str(i+1)}).append(c)
            dimension=root.find(S+'dimension')
            if dimension is not None:dimension.set('ref','A1:A32')
        elif name=='injected-formula-with-same-cache':
            f=E.Element(S+'f');f.text='1';cells[0].insert(0,f)
        else:
            book=E.fromstring(parts['xl/workbook.xml']);book.find(S+'sheets')[0].set('name','Changed');changed['xl/workbook.xml']=E.tostring(book)
        changed[path]=E.tostring(root);result=observe(changed,oracle)
        assert not result['boundedNumericPrefixMatches']
        controls.append({'case':name,'oracleRejected':True,'failedCases':[c['case'] for c in result['cases'] if not c['passed']]})
    return {'scope':'#30 / lo-dif-1 only','application':CONFIG['application'],'source':s,'sourceOracle':oracle,
            'historicalReuse':{'recordedResult':row,'date':old['date'],'platform':old['platform'],'converter':old['converter'],
                               'historicalProfileSha256':old['profileSha256'],'p2ProfileSha256':CONFIG['p2Bindings']['src-tauri/src/conversieprofiel.xcu']['sha256'],
                               'profileEquivalence':False,'cachedBytesMatchReportedSavedDigest':True,
                               'originalProducingRunOrAppPointIndependentlyAuthenticated':False},
            'historicalNumericPrefixObservation':observed,'oracleControls':controls,
            'p2StaticPolicyReview':{'level':'Read-only source, no production functions invoked','route':'DIF input maps to xlsx and legacy fallback viaRuntime; browser converter needs Tauri bridge',
                                   'actualRuntimeOpenExportProposal':'dif: src/formaten.json has DIF runtime output, so viaRuntime sets exportFormaat=dif',
                                   'declaredDifExportLimit':'Only first sheet; values without formulas or formatting',
                                   'proposedModernPreservationTestSave':'Explicit SaveAs ordinary XLSX; not an assertion that P2 defaults to XLSX after DIF import'},
            'status':'BOUNDED_NUMERIC_PREFIX_MATCH_SOURCE_END_FRAMING_UNQUALIFIED_P2_RUNTIME_OPEN',
            'completeDIFGrammarQualified':False,'fullFormatAccepted':False,'sourceFormulaImportProven':False,
            'runtimeGuard':CONFIG['runtimeGuard'],'newCiRuns':[],'newRuntimeConsumption':False,'newBuildsOrArtifactDownloads':False,
            'remaining':['Physical blank line before EOD remains unqualified; no source repair or complete DIF grammar claim',
                         'Actual P2 private converter/production helper/engine edit/UndoRedo/XLSX-save/separate-process reopen remain unrun under release capacity guard',
                         'No source formulas or positive string/date/boolean/error/locale/large-matrix/rendering/native/browser/platform coverage']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args();result=analyse();target=PROOF/'result.json'
    if a.write:target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    else:assert json.loads(target.read_text(encoding='utf8'))==result
    print(json.dumps({'status':result['status'],'numericPrefixCells':result['sourceOracle']['numericPrefixCellCount'],
                      'historicalCases':len(result['historicalNumericPrefixObservation']['cases']),'oracleControls':len(result['oracleControls']),
                      'completeDIFGrammarQualified':False,'newCiRuns':0,'fullFormatAccepted':False}))
