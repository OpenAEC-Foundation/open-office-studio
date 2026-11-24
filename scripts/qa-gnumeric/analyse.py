"""Source/reuse audit only; positive tests of a different fixture stay separate."""
import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import subprocess
import zipfile
from xml.etree import ElementTree as E
from native import native,controls

ROOT=Path(__file__).resolve().parents[2]
PROOF=ROOT/'docs/tests/gnumeric-source-2026-11-24'
CONFIG=json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
S='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def load(name):return json.loads((PROOF/'retained'/name).read_bytes())

def historical_structure(path):
    result=[]
    with zipfile.ZipFile(path) as z:
        book=E.fromstring(z.read('xl/workbook.xml'))
        rels={e.get('Id'):e for e in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for sheet in book.find(S+'sheets'):
            rel=rels[sheet.get(R+'id')];assert rel.get('TargetMode')!='External' and rel.get('Type').endswith('/worksheet')
            target=rel.get('Target');part=target[1:] if target.startswith('/') else posixpath.normpath('xl/'+target)
            assert not part.startswith('../') and part in z.namelist()
            physical=styled=populated=formulas=0
            # Large style-only sheets are streamed, never materialized as cell matrices.
            with z.open(part) as stream:
                for event,e in E.iterparse(stream,events=('end',)):
                    if e.tag==S+'c':
                        physical+=1;styled+=int('s' in e.attrib)
                        has_formula=e.find(S+'f') is not None
                        formulas+=int(has_formula)
                        populated+=int(has_formula or e.find(S+'v') is not None or e.find(S+'is') is not None)
                        e.clear()
                    elif e.tag==S+'row':e.clear()
            result.append({'name':sheet.get('name'),'physicalCellElements':physical,'styledCellElements':styled,
                           'populatedValueOrFormulaOrInlineStringElements':populated,'formulaElements':formulas})
    assert [s['name'] for s in result]==['Sheet1','Sheet2','Sheet3']
    assert all(s['populatedValueOrFormulaOrInlineStringElements']==s['formulaElements']==0 for s in result)
    return result

def analyse():
    s=CONFIG['source'];data=(PROOF/'source.gnumeric').read_bytes()
    assert len(data)==s['bytes'] and sha(data)==s['sha256'] and blob(data)==s['gitSha']
    for n in CONFIG['notices']:
        b=(PROOF/'source-notices'/n['path']).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for name,n in CONFIG['retainedBindings'].items():
        b=(PROOF/'retained'/name).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256']
    for name,n in CONFIG['referenceGitBindings'].items():
        b=(PROOF/'retained'/name).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for path,n in CONFIG['p2Bindings'].items():
        b=subprocess.check_output(['git','cat-file','blob',n['blob']],cwd=ROOT)
        assert len(b)==n['bytes'] and sha(b)==n['sha256']
        assert subprocess.check_output(['git','rev-parse',CONFIG['application']['commit']+':'+path],text=True,cwd=ROOT).strip()==n['blob']
    catalog=json.loads(subprocess.check_output(['git','cat-file','blob',CONFIG['p2Bindings']['docs/tests/formatendekking/bronnen.json']['blob']],cwd=ROOT))
    assert next(entry for entry in catalog['sources'] if entry['id']=='lo-gnumeric-1')==s,'Full source metadata, including the Unicode path, must equal canonical UTF-8 catalogue bytes'
    source=native(data);container_controls=controls(data)
    historical=(PROOF/'retained/historical-windows-report.json').read_bytes()
    assert sha(historical)==CONFIG['p2Bindings']['docs/tests/formatendekking/resultaat-windows.json']['sha256']
    old=json.loads(historical);row=next(x for x in old['results'] if x['id']=='lo-gnumeric-1')
    cache=(PROOF/'retained/empty-historical-result.xlsx').read_bytes()
    assert sha(cache)==row['savedSha256'] and len(cache)==row['savedBytes'] and row['passed']
    empty=historical_structure(PROOF/'retained/empty-historical-result.xlsx')
    other=load('other-fixture.json')
    assert other['bytes']==2062 and other['sha256']=='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6'
    assert other['sha256']!=s['sha256'] and other['typedCells']==8 and other['formulas']==4
    assert other['testedExts']==['gnumeric','gnm'] and other['expectedSheets']==['Sheet1','Sheet2']
    assert 'three empty sheets' in (PROOF/'retained/other-fixture-p2-route.md').read_text(encoding='utf8')
    win=load('other-fixture-p2-windows.json');assert win['applicationCommit']==CONFIG['application']['commit']
    mac=load('mac-other-fixture-boundary.json')
    inputs=[e for e in mac['actualFiles'] if e['role'].startswith('actual input')]
    assert len(inputs)==2 and all(e['sha256']==other['sha256'] and e['bytes']==other['bytes'] for e in inputs)
    assert {e['extensionRoute'] for e in inputs}=={'.gnm','.gnumeric'}
    assert all(j['conclusion']=='success' for j in mac['jobs']) and mac['workflowConclusion']=='failure'
    fmt=json.loads(subprocess.check_output(['git','cat-file','blob',CONFIG['p2Bindings']['src/formaten.json']['blob']],cwd=ROOT))
    assert all(e in fmt['xlsx']['invoer'] for e in ['gnm','gnumeric'])
    assert all(e not in fmt['xlsx']['uitvoer'] for e in ['gnm','gnumeric'])
    return {'scope':'#30 / original lo-gnumeric-1 only','application':CONFIG['application'],'source':s,'sourceOracle':source,
            'containerOracleControls':container_controls,
            'historicalSameSourceReuse':{'result':row,'date':old['date'],'converter':old['converter'],'historicalProfileSha256':old['profileSha256'],
                                       'p2ProfileSha256':CONFIG['p2Bindings']['src-tauri/src/conversieprofiel.xcu']['sha256'],
                                       'cacheMatchesReportedSavedDigest':True,'oldPointOrProfileEquivalentToP2':False,
                                       'streamedWorksheetObservation':empty,'positiveTypeValueFormulaImportAccepted':False},
            'otherFixtureBoundary':{'fixture':other,'sameSourceAsCurrent':False,'sameWorkbookStructureAsCurrent':False,
                                    'p2WindowsRun':win['nativeRun'],'p2LinuxRun':45155198992,
                                    'macOwner':mac['owner'],'macHarness':mac['harnessCommit'],'macJobs':mac['jobs'],
                                    'macOverallRunConclusion':mac['workflowConclusion'],
                                    'macPackageOrNativeAcceptanceReauditedByThisTask':False,
                                    'otherSourceOrAliasRuntimePassBorrowed':False},
            'p2StaticPolicyReview':{'level':'Read-only code, no production helper execution','route':'gnm and gnumeric are distinct catalog filename entries mapping to legacy XLSX conversion; Tauri desktop bridge required',
                                   'save':'Neither extension has an output override; ordinary XLSX is the modern proposal','currentOriginalGnmAliasExecuted':False,
                                   'unicodeOriginalFilenameTested':False},
            'status':'AUTHENTIC_EMPTY_GNUMERIC_SOURCE_NO_POSITIVE_CELL_WITNESS_REUSE_ONLY',
            'sourcePositiveWitnessGapAlreadyDocumented':True,'newCiRuns':[],'newRuntimeConsumption':False,'newBuildOrArtifactDownload':False,
            'runtimeAllocationRequested':False,'runtimeAllocationReason':'Another empty import cannot produce original source cell/formula witnesses; positive other-fixture checks are already separate',
            'fullFormatAccepted':False,
            'remaining':['No positive original1716-byte source cell/value/type/formula witness; empty source is valid, not a corrupt document or product bug',
                         'Current original1716-byte .gnumeric exact P2/native route is not newly executed; .gnm acceptance is not inferred from expanded XML',
                         'Other2062-byte P2 Windows/Linux and owner6f92 P5 Mac positive cases remain their own source/point/container/filename scopes',
                         'No complete style/font/print/locale/non-ASCII/schema/rendering/security or all-variants acceptance']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args();result=analyse();target=PROOF/'result.json'
    if a.write:target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    else:assert json.loads(target.read_text(encoding='utf8'))==result
    print(json.dumps({'status':result['status'],'sourceCells':0,'sourceFormulas':0,'gzipControls':len(result['containerOracleControls']),
                      'physicalHistoricalCellElements':sum(s['physicalCellElements'] for s in result['historicalSameSourceReuse']['streamedWorksheetObservation']),
                      'otherFixturePassBorrowed':False,'newRuntimeConsumption':False,'fullFormatAccepted':False}))
