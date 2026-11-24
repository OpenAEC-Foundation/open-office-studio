"""Static source and historical-cache audit only; no product/runtime execution."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
from xml.etree import ElementTree as E
from native import native,sha

ROOT=Path(__file__).resolve().parents[2]
PROOF=ROOT/'docs/tests/sxw-2026-11-24'
CONFIG=json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'


def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()


def docx_parts(parts,oracle):
    root=E.fromstring(parts['word/document.xml']);body=root.find(W+'body')
    texts=[''.join(n.text or '' for n in p.iter(W+'t')) for p in body.findall(W+'p')]
    fields=[];stack=[]
    for r in body.iter(W+'r'):
        for n in r:
            if n.tag==W+'fldChar':
                kind=n.get(W+'fldCharType')
                if kind=='begin':
                    assert not stack
                    stack.append({'instruction':'','cached':'','phase':'instruction'})
                elif kind=='separate':assert stack;stack[-1]['phase']='result'
                elif kind=='end':
                    assert stack;f=stack.pop();f.pop('phase');f['instruction']=' '.join(f['instruction'].split());fields.append(f)
            elif n.tag==W+'instrText':
                assert stack and stack[-1]['phase']=='instruction';stack[-1]['instruction']+=n.text or ''
            elif n.tag==W+'t' and stack:
                assert stack[-1]['phase']=='result';stack[-1]['cached']+=n.text or ''
    assert not stack
    content=next(e.get('ContentType') for e in E.fromstring(parts['[Content_Types].xml']) if e.get('PartName')=='/word/document.xml')
    expectedFields=[{'instruction':'MERGEFIELD '+f['column'],'cached':f['cachedDisplay']} for f in oracle['databaseFields']]
    cases=[{'case':'ordinary DOCX main content type','actual':content,'expected':'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'},
           {'case':'four body paragraphs, ordinary literal and cached display including explicit whitespace','actual':texts,'expected':oracle['expectedCachedDisplayOnly']},
           {'case':'typed MERGEFIELD structure and individual caches, without live binding acceptance','actual':fields,'expected':expectedFields}]
    for c in cases:c['passed']=c['actual']==c['expected']
    return {'method':'Independent XML read of local historical conversion snapshot only; not a current P2 runtime test',
            'cases':cases,'matchesBoundedCachedDisplay':all(c['passed'] for c in cases),
            'bodyParagraphTexts':texts,'fields':fields,'liveDatabaseSemanticsAccepted':False,'currentP2RuntimeAccepted':False,'fullFormatAccepted':False}


def analyse():
    source=(PROOF/'source.sxw').read_bytes();s=CONFIG['source']
    assert len(source)==s['bytes'] and sha(source)==s['sha256'] and blob(source)==s['gitSha']
    for n in CONFIG['notices']:
        b=(PROOF/'source-notices'/n['path']).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256'] and blob(b)==n['blob']
    for p,n in CONFIG['p2Bindings'].items():
        b=subprocess.check_output(['git','cat-file','blob',n['blob']],cwd=ROOT)
        assert len(b)==n['bytes'] and sha(b)==n['sha256']
        assert subprocess.check_output(['git','rev-parse',CONFIG['application']['commit']+':'+p],text=True,cwd=ROOT).strip()==n['blob']
    oracle=native(source)
    for name,n in CONFIG['historicalCache']['files'].items():
        b=(PROOF/'retained'/name).read_bytes();assert len(b)==n['bytes'] and sha(b)==n['sha256']
    historical=(PROOF/'retained/historical-windows-report.json').read_bytes()
    assert sha(historical)==CONFIG['p2Bindings']['docs/tests/formatendekking/resultaat-windows.json']['sha256']
    old=json.loads(historical);row=next(x for x in old['results'] if x['id']=='lo-sxw-1')
    cache=json.loads((PROOF/'retained/cached-report.json').read_bytes());cacheRow=next(x for x in cache['results'] if x['id']=='lo-sxw-1')
    assert row['passed'] and row['outcome']=='opened-saved-reopened'
    assert all(cacheRow[k]==row[k] for k in cacheRow)
    timing=json.loads((PROOF/'retained/cached-conversion.json').read_bytes());assert timing['ms']==row['conversionMs'] and not timing['timedOut']
    with zipfile.ZipFile(PROOF/'retained/cached-converted.docx') as z:parts={n:z.read(n) for n in z.namelist()}
    observed=docx_parts(parts,oracle);assert observed['matchesBoundedCachedDisplay']
    controls=[]
    for name in ['changed-literal-Test','lost-second-space','flattened-fields','wrong-field-column']:
        changed=copy.copy(parts);root=E.fromstring(parts['word/document.xml']);paras=root.find(W+'body').findall(W+'p')
        if name=='changed-literal-Test':next(paras[1].iter(W+'t')).text='test'
        elif name=='lost-second-space':
            space=next(n for n in paras[2].iter(W+'t') if n.text=='  ');space.text=' '
        elif name=='flattened-fields':
            for run in paras[2].iter(W+'r'):
                for child in list(run):
                    if child.tag in (W+'instrText',W+'fldChar'):run.remove(child)
        else:next(paras[2].iter(W+'instrText')).text=' MERGEFIELD Address '
        changed['word/document.xml']=E.tostring(root);result=docx_parts(changed,oracle)
        assert not result['matchesBoundedCachedDisplay']
        controls.append({'case':name,'oracleRejected':True,'failedCases':[c['case'] for c in result['cases'] if not c['passed']]})
    return {'application':CONFIG['application'],'scope':'#30 / lo-sxw-1 only','source':s,'sourceOracle':oracle,
            'historicalReuse':{'technicalResult':row,'date':old['date'],'platform':old['platform'],'converter':old['converter'],
                              'historicalProfileSha256':old['profileSha256'],'p2SafeProfileSha256':CONFIG['p2Bindings']['src-tauri/src/conversieprofiel.xcu']['sha256'],
                              'profileEquivalence':False,'cacheProducerBindingAuthenticated':False,'cacheCorrelation':'Same report row and converter timing, no official artifact/producing-run attestation'},
            'historicalCacheObservation':observed,'oracleControls':controls,
            'p2StaticPolicyReview':{'executionLevel':'Read-only source','inputModule':'docx','route':'SXW has no direct text-import branch; fallback viaRuntime calls hulp.converteer with source ext sxw and target docx',
                                   'browserBoundary':'converteer requires window.__TAURI_INTERNALS__; no hosted browser or Node production function execution in this scope',
                                   'saveRecommendation':'No SXW output entry; ordinary DOCX default'},
            'status':'STATIC_SOURCE_PASS_HISTORICAL_REUSE_CURRENT_RUNTIME_OPEN',
            'newCiRuns':[],'newRuntimeConsumption':False,'newProductionHelperOrWordTests':False,
            'newNativeOrBrowserUiTests':False,'databaseConnectionOrMailMergeExecuted':False,'fullFormatAccepted':False,
            'runtimeGuard':CONFIG['runtimeGuard'],
            'remaining':['Targeted capacity coordination before any new CI/runtime; failed collector does not waive guard',
                         'Missing actual P2 private runtime/helper/Word edit of ordinary paragraph1/UndoRedo/DOCX-save/independent XML and separate-process reopen',
                         'Cached field text is not live database binding/update/row-selection/mailmerge behavior',
                         'No full field/header/style/font/layout/rendering/native/platform equivalence acceptance']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args()
    result=analyse();target=PROOF/'result.json'
    if a.write:target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    else:assert json.loads(target.read_text(encoding='utf8'))==result
    print(json.dumps({'status':result['status'],'sourceBodyParagraphs':len(result['sourceOracle']['mainBodyParagraphs']),
                      'databaseFields':len(result['sourceOracle']['databaseFields']),'historicalCacheCases':len(result['historicalCacheObservation']['cases']),
                      'oracleControls':len(result['oracleControls']),'newCiRuns':0,'fullFormatAccepted':False}))
