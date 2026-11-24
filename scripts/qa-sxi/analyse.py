"""Static SXI source and historical PPTX snapshot audit; no app/engine runtime."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import posixpath
import subprocess
import zipfile
from xml.etree import ElementTree as E
from native import native,sha,vector_sha

ROOT=Path(__file__).resolve().parents[2]
PROOF=ROOT/'docs/tests/sxi-2026-11-24'
CONFIG=json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
P='{http://schemas.openxmlformats.org/presentationml/2006/main}'
A='{http://schemas.openxmlformats.org/drawingml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
REL='{http://schemas.openxmlformats.org/package/2006/relationships}'

def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def relationships(parts,part):
    path=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    return {r.get('Id'):r for r in E.fromstring(parts[path])}

def resolve(part,r,parts):
    assert r.get('TargetMode')!='External'
    target=r.get('Target');assert '\\' not in target
    path=target[1:] if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part),target))
    assert not path.startswith('../') and path in parts
    return path

def ordered_slides(parts):
    root=E.fromstring(parts['ppt/presentation.xml']);rels=relationships(parts,'ppt/presentation.xml')
    out=[]
    for sid in root.find(P+'sldIdLst'):
        r=rels[sid.get(R+'id')];assert r.get('Type').endswith('/slide')
        out.append(resolve('ppt/presentation.xml',r,parts))
    return root,out

def shape_paragraphs(shape):
    return [''.join(n.text or '' if n.tag==A+'t' else '\n' if n.tag==A+'br' else '' for n in p.iter()) for p in shape.iter(A+'p')]

def main_shapes(root):
    return [s for s in root.find(P+'cSld/'+P+'spTree') if s.tag in (P+'sp',P+'pic',P+'graphicFrame',P+'grpSp',P+'cxnSp')]

def observe(parts,oracle):
    presentation,paths=ordered_slides(parts);roots=[E.fromstring(parts[p]) for p in paths];shapes=[main_shapes(s) for s in roots]
    titles=[vector_sha(shape_paragraphs(next(s for s in ss if s.tag==P+'sp'))) for ss in shapes]
    expected=oracle['expected'];cases=[]
    def check(name,actual,wanted):cases.append({'case':name,'actual':actual,'expected':wanted,'passed':actual==wanted})
    ct=E.fromstring(parts['[Content_Types].xml']);content=next(x.get('ContentType') for x in ct if x.get('PartName')=='/ppt/presentation.xml')
    check('ordinary PPTX main type',content,'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')
    check('source slide count in presentation relationship order',len(paths),expected['slideCount'])
    check('ordered first-title paragraph vectors, SHA256 rather than whole text reproduction',titles,expected['orderedTitleParagraphSha256'])
    for anchor in expected['selectedTextShapes']:
        i,j=anchor['slide'],anchor['shapeOrdinal']
        actual=shape_paragraphs(shapes[i][j]) if i<len(shapes) and j<len(shapes[i]) else None
        check('selected source text shape slide'+str(i)+' ordinal'+str(j),actual,anchor['paragraphs'])
    size=presentation.find(P+'sldSz');check('source actual presentation master size, not handout/notes size',
                                          {'cx':int(size.get('cx')),'cy':int(size.get('cy'))},
                                          {k:expected['pageSize'][k] for k in ['cx','cy']})
    picture_observations=[]
    for image in expected['mainImages']:
        i=image['slide'];actual=[]
        if i<len(paths):
            rels=relationships(parts,paths[i])
            for shape in shapes[i]:
                if shape.tag!=P+'pic':continue
                for blip in shape.iter(A+'blip'):
                    rel=rels[blip.get(R+'embed')];assert rel.get('Type').endswith('/image')
                    target=resolve(paths[i],rel,parts);actual.append(sha(parts[target]))
                    picture_observations.append({'slide':i,'target':target,'sha256':sha(parts[target])})
        check('one original main-slide GIF relationship at source slide'+str(i),actual,[image['sha256']])
    return {'method':'Independent OOXML scan of local historical converted PPTX snapshot only',
            'cases':cases,'allBoundedHistoricalCasesMatch':all(c['passed'] for c in cases),
            'slidePartsInRelationshipOrder':paths,'mainObjectCountObservation':sum(len(s) for s in shapes),
            'pictureRelationshipObservations':picture_observations,'newP2RuntimeAccepted':False,'fullFormatAccepted':False}

def analyse():
    s=CONFIG['source'];source=(PROOF/'source.sxi').read_bytes()
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
    old_bytes=(PROOF/'retained/historical-windows-report.json').read_bytes()
    assert sha(old_bytes)==CONFIG['p2Bindings']['docs/tests/formatendekking/resultaat-windows.json']['sha256']
    old=json.loads(old_bytes);row=next(x for x in old['results'] if x['id']=='lo-sxi-1')
    cache=json.loads((PROOF/'retained/cached-report.json').read_bytes());cache_row=next(x for x in cache['results'] if x['id']=='lo-sxi-1')
    assert row['passed'] and row['slides']==26 and row['outcome']=='opened-saved-reopened'
    assert all(cache_row[k]==row[k] for k in cache_row)
    conversion=json.loads((PROOF/'retained/cached-conversion.json').read_bytes());assert not conversion['timedOut']
    with zipfile.ZipFile(PROOF/'retained/cached-converted.pptx') as z:parts={n:z.read(n) for n in z.namelist()}
    observation=observe(parts,oracle)
    controls=[]
    baseline_failures={c['case'] for c in observation['cases'] if not c['passed']}
    for name in ['dropped-slide','swapped-first-slides','changed-title-case','removed-main-image']:
        changed=copy.copy(parts);root,paths=ordered_slides(parts)
        if name=='dropped-slide':
            ids=root.find(P+'sldIdLst');ids.remove(ids[-1]);changed['ppt/presentation.xml']=E.tostring(root)
        elif name=='swapped-first-slides':
            ids=root.find(P+'sldIdLst');first=ids[0];ids.remove(first);ids.insert(1,first);changed['ppt/presentation.xml']=E.tostring(root)
        elif name=='changed-title-case':
            slide=E.fromstring(parts[paths[0]]);node=next(main_shapes(slide)[0].iter(A+'t'));node.text='OOoCon 2004 - berlin';changed[paths[0]]=E.tostring(slide)
        else:
            slide=E.fromstring(parts[paths[16]]);tree=slide.find(P+'cSld/'+P+'spTree')
            for node in list(tree):
                if node.tag==P+'pic':tree.remove(node)
            changed[paths[16]]=E.tostring(slide)
        result=observe(changed,oracle)
        failures={c['case'] for c in result['cases'] if not c['passed']}
        new_failures=failures-baseline_failures
        assert new_failures,'A pre-existing dimension mismatch cannot make a negative control pass'
        controls.append({'case':name,'oracleRejected':True,'newlyFailedCases':sorted(new_failures),
                         'preexistingHistoricalMismatches':sorted(baseline_failures)})
    return {'scope':'#30 / lo-sxi-1 only','application':CONFIG['application'],'source':s,'sourceOracle':oracle,
            'historicalWindowsReuse':{'technicalResult':row,'date':old['date'],'converter':old['converter'],'historicalProfileSha256':old['profileSha256'],
                                      'p2ProfileSha256':CONFIG['p2Bindings']['src-tauri/src/conversieprofiel.xcu']['sha256'],'profileEquivalence':False,
                                      'cacheRowCorrelation':True,'reportConversionMs':row['conversionMs'],'cacheConversionMs':conversion['ms'],
                                      'cacheOfficialProducingRunBindingAuthenticated':False},
            'historicalLinuxCatalogRecord':{'expectedOn':s['expectedOn'],'newlyReproduced':False,'appliesToP2PrivateRuntime':False},
            'historicalCacheObservation':observation,'oracleControls':controls,
            'p2StaticPolicyReview':{'level':'Read-only pinned P2 code, no production functions invoked','module':'pptx',
                                   'route':'Legacy SXI fallback viaRuntime to PPTX; requires desktop converter/Tauri bridge',
                                   'recommendedSave':'ordinary PPTX; no SXI output override'},
            'historicalBoundedCacheAccepted':observation['allBoundedHistoricalCasesMatch'],
            'status':'STATIC_SOURCE_PASS_HISTORICAL_SIZE_MISMATCH_CURRENT_RUNTIME_OPEN',
            'runtimeGuard':CONFIG['runtimeGuard'],'newCiRuns':[],'newRuntimeConsumption':False,'newEngineOrUiExecution':False,'fullFormatAccepted':False,
            'remaining':['Targeted capacity coordination before any new runtime/CI; SXW separately OPEN',
                         'Actual pinned P2 private converter/production helper/PPTX engine edit/UndoRedo/save/separate-process reopen and independent OOXML',
                         'No full layout/rendering/fonts/notes/master/animation/image-decoding/embedded-object or native/browser/platform acceptance']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args();result=analyse();target=PROOF/'result.json'
    if a.write:target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    else:assert json.loads(target.read_text(encoding='utf8'))==result
    print(json.dumps({'status':result['status'],'slides':result['sourceOracle']['expected']['slideCount'],
                      'historicalCases':len(result['historicalCacheObservation']['cases']),'historicalMismatches':[c['case'] for c in result['historicalCacheObservation']['cases'] if not c['passed']],
                      'oracleControls':len(result['oracleControls']),'newCiRuns':0,'fullFormatAccepted':False}))
