"""Small static provenance/source replay of existing P2 SXC evidence.

Do not run prior native/converter/audit CLIs. Only unchanged read_source() runs;
all existing native operations and negative object outcomes are reused.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import PIL

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
PROOF=ROOT/'docs/tests/sxc-2026-11-24'
CONFIG=json.loads((BASE/'fixture.json').read_text(encoding='utf8'))

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def load(name):return json.loads((PROOF/'retained'/name).read_bytes())

def analyse():
    s=CONFIG['source'];source=(PROOF/'source.sxc').read_bytes()
    assert len(source)==s['bytes'] and sha(source)==s['sha256'] and blob(source)==s['gitSha']
    for n in CONFIG['notices']:
        b=(PROOF/'source-notices'/n['path']).read_bytes()
        assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for path,n in CONFIG['reusedGitFiles'].items():
        b=(ROOT/path).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for path,n in CONFIG['p2Bindings'].items():
        b=subprocess.check_output(['git','cat-file','blob',n['blob']],cwd=ROOT)
        assert len(b)==n['bytes'] and sha(b)==n['sha256']
        assert subprocess.check_output(['git','rev-parse',CONFIG['application']['commit']+':'+path],text=True,cwd=ROOT).strip()==n['blob']
    issue=(PROOF/'retained/issue-380-snapshot.json').read_bytes()
    assert len(issue)==CONFIG['relatedIssueSnapshot']['bytes'] and sha(issue)==CONFIG['relatedIssueSnapshot']['sha256']
    assert PIL.__version__=='13.0.0','Use the existing source-decoder version; do not silently requalify pixel results'
    reader=BASE/'reference/oracle.py'
    spec=importlib.util.spec_from_file_location('sxc_unchanged_source_reference',reader)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    # The CLI main(), fetch(), read_xlsx() and audit() are deliberately not called.
    oracle=module.read_source(PROOF/'source.sxc')
    assert oracle==load('source-oracle-before-import.json')
    assert oracle['sourceCells']==1 and oracle['sourceFormulas']==0
    assert [x['name'] for x in oracle['sheets']]==['Sheet1','Sheet2','Sheet3']
    assert oracle['sheets'][0]['cells']=={'C13':{'kind':'text','value':'Note attached','formula':None}}
    assert oracle['sheets'][0]['annotations'][0]['text']=='Just a note'
    native=load('native-result-binding.json');audit=load('native-byte-audit.json')
    control=load('converter-control-binding.json');comparison=load('converter-comparison.json')
    assert native['applicationCommit']==audit['application']==CONFIG['application']['commit']
    assert native['applicationTree']==audit['tree']==CONFIG['application']['tree']
    assert native['version']==CONFIG['application']['version']
    assert native['nativeRun']==audit['nativeRun']==45164747391
    assert native['nativeConclusion']=='failure' and audit['nativeStatus']=='failed-strict-preservation'
    assert audit['nativeOperationsPassed'] and audit['strictPreservationPassed'] is False
    assert audit['originalUnchanged'] and audit['sourceSha256']==s['sha256']
    assert audit['normalFullExits']==3 and audit['newProcessReopens']==2
    assert all(x['cells']['passed'] for x in audit['actualSavedXlsx'])
    assert control['run']==comparison['run']==45166523239
    assert comparison['cellsPassed'] and comparison['strictPreservationPassed'] is False
    assert comparison['allSelectedNativeStructuresEqualControl'] and len(comparison['comparisons'])==4
    categories=dict(Counter(x['category'] for x in comparison['differences']))
    assert set(categories)=={'vector-size-within-0.001cm','form-control-kind-counts','form-control-label'}
    drawings=oracle['sheets'][0]['drawings'];controls=[x['control'] for x in drawings if x['kind']=='control']
    old=json.loads((PROOF/'retained/nov10-historical-windows-report.json').read_bytes())
    assert sha((PROOF/'retained/nov10-historical-windows-report.json').read_bytes())==CONFIG['p2Bindings']['docs/tests/formatendekking/resultaat-windows.json']['sha256']
    row=next(x for x in old['results'] if x['id']=='lo-sxc-1')
    return {'scope':'#30 / lo-sxc-1 only','application':CONFIG['application'],
            'status':'REUSED_P2_WINDOWS_CELL_PASS_STRICT_OBJECT_FAIL_NO_NEW_RUNTIME',
            'source':s,'sourceReaderCanonicalBytesUnchanged':True,'sourceOracleReplayedExactly':True,'sourceDecoderPillow':PIL.__version__,
            'sourceSummary':{'sheetNames':[x['name'] for x in oracle['sheets']],
                             'cells':[{'sheet':x['name'],'cells':x['cells'],'annotations':x['annotations']} for x in oracle['sheets']],
                             'sourceCells':1,'sourceFormulas':0,'topLevelDrawings':len(drawings),'sourceTypedControls':controls},
            'reusedNativeResult':{'binding':native,'nativeOperationsPassed':True,'strictPreservationPassed':False,
                                 'normalFullExits':3,'newProcessReopens':2,'savedXlsx':audit['actualSavedXlsx'],
                                 'boundary':'Previously audited exact P2 Windows suite, not a newly executed native test or final release/signing/standalone acceptance'},
            'reusedConverterControl':{'binding':control,'outputSha256':comparison['outputSha256'],'cellsPassed':True,
                                      'strictPreservationPassed':False,'differenceCategoryCounts':categories,
                                      'fourNativeObjectStructuresMatchConverter':True,
                                      'boundary':'Existing complete independent control reused; large proof ZIPs and all output files are not rehashed/retested by this small static replay'},
            'nov10TechnicalResult':{'row':row,'profileSha256':old['profileSha256'],'role':'Earlier technical coverage only; exact P2 Windows proof above supersedes the missing content/native context, not the strict object failures'},
            'knownLimitsRetained':['Three vector widths differ +0.009cm from source, outside frozen0.001cm tolerance; original strict result remains failed',
                                  'Output typed controls include button/checkbox; Radio has hidden AlternateContent name/label but no typed relationship, original TextBox control is absent',
                                  'Exact P2 chord renderer shows placeholder while original DrawingML survives Save; future #380 source42d161a3 is a different point and is not merged/validated here',
                                  'No original formulas: UI-added I1=40+2/result42 is editing evidence, not source formula import',
                                  'No general object/shape/style/control-action/font/rendering/full-source preservation acceptance'],
            'runtimeGuard':CONFIG['runtimeGuard'],'newCiRuns':[],'newRuntimeConsumption':False,
            'oldNativeOrConverterJobsRepeated':False,'oldLargeProofZipDownloadsOrRehashes':False,
            'productOrCatalogChanges':False,'issue380ProductWork':False,'fullFormatAccepted':False,
            'remaining':['Windows native operation evidence is reused; known converter/control/width and P2 renderer limitations remain',
                         'Native Linux/macOS and direct hosted browser SXC conversion are not newly tested; a browser XLSX test on the future chord-fix point is not direct SXC or P2 equivalence',
                         'Any truly missing future runtime/platform step requires targeted capacity assignment; no already covered P2 Windows step should be repeated automatically']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args();result=analyse();target=PROOF/'result.json'
    if a.write:target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    else:assert json.loads(target.read_text(encoding='utf8'))==result
    print(json.dumps({k:result[k] for k in ['status','sourceOracleReplayedExactly','oldNativeOrConverterJobsRepeated','newRuntimeConsumption','fullFormatAccepted']}))
