"""Offline authenticated evidence audit; executes no Office or Word runtime."""
import argparse,hashlib,json,zipfile,copy
from pathlib import Path,PurePosixPath
from xml.etree import ElementTree as E
from oracle import CONFIG,native,docx,write_json,W,R
RUN=45354297317
JOB=138308165799
HARNESS='79114519528e7b413eb2dfe5be3785df4df72611'
ARTIFACT=14902045836
ZIP_SHA='f50b853efad4397c86ee2968578c61b88d51cc09b3acf23506d64d6580c8e79d'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--metadata',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out;out.mkdir(parents=True,exist_ok=True)
 meta=json.loads(a.metadata.read_text());archive=a.archive.read_bytes();assert sha(archive)==ZIP_SHA and len(archive)==78901
 assert meta['id']==ARTIFACT and meta['digest']=='sha256:'+ZIP_SHA and meta['workflow_run']['id']==RUN and meta['workflow_run']['head_sha']==HARNESS
 evidence=out/'original';assert not evidence.exists(),'Use a new audit destination to preserve raw evidence'
 with zipfile.ZipFile(a.archive) as z:
  for x in z.infolist():
   path=PurePosixPath(x.filename);assert not path.is_absolute() and '..' not in path.parts
  z.extractall(evidence)
 load=lambda name:json.loads((evidence/name).read_text())
 b=(evidence/'source.wpd').read_bytes();assert sha(b)==CONFIG['source']['sha256']
 oracle=native(b);assert oracle==load('source-oracle.json')
 binding=load('runtime-binding.json');pin=json.loads(Path('scripts/qa-wpd6/runtime-input.json').read_text());assert binding['application']==CONFIG['application'] and binding['artifact']==pin
 verified=load('runtime-consumer-verification.json');assert verified['status']=='verified' and verified['sourceCommit']==CONFIG['application']['commit'] and verified['tarSha256']==pin['tarSha256']
 assert binding['programSha256']==pin['launcherSha256'] and binding['entryManifest']['entries']==pin['manifestEntries'] and binding['entryManifest']['sha256']==pin['manifestSha256']
 converter=load('converter-report.json');assert converter['binding']==binding and converter['sourceUnchanged'] and converter['sourceSha256']==CONFIG['source']['sha256'] and converter['exitCode']==0
 assert converter['profileSha256']=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
 assert sha((evidence/'converted.docx').read_bytes())==converter['outputSha256']
 for n in CONFIG['source']['notices']:assert sha((evidence/'source-notices'/n['path']).read_bytes())==n['sha256']
 route=load('route-report.json');engine=load('engine-report.json');fresh=load('fresh-process-report.json')
 assert route['passed'] and engine['downstreamEnginePassed'] and fresh['downstreamEnginePassed']
 assert engine['harnessCommit']==fresh['harnessCommit']==HARNESS
 assert engine['application']==fresh['application']==CONFIG['application']
 assert engine['engine']==fresh['engine'] and engine['engine']['route']=='productiekern'
 pins=json.loads(Path('patches/tekstengine-nootnummering.json').read_text());assert engine['engine']['kernels']['edit']['sha256']==pins['wasmSha256'] and engine['engine']['kernels']['layout']['sha256']==pins['layoutWasmSha256']
 assert engine['process']['pid']!=fresh['process']['pid'] and engine['process']['startedAt']<fresh['process']['startedAt']
 assert engine['editedParagraphs']==fresh['paragraphs']==oracle['expected']['editedTexts']
 assert fresh['cleanup']=={'sessionDestroyed':True,'productionLoaderClosed':True,'localGuiOrCaptureUsed':False}
 assert sha((evidence/'saved.docx').read_bytes())==fresh['inputSavedSha256']
 # Preserve original CI failure and raw false reports. Only the diagnosed inactive-first-header comparison is reinterpreted.
 assert not engine['passed'] and not fresh['passed'];originals={}
 for name in ['converted.docx','saved.docx','reopened-saved.docx','fresh-process-saved.docx']:
  old=load(name.replace('.docx','-xml-report.json'));assert len(old['mismatches'])==1
  m=old['mismatches'][0];assert m['case']=='successive Header A exact text' and m['actual']==oracle['expected']['headerTexts']+[''] and m['expected']==oracle['expected']['headerTexts']
  originals[name]={'sha256':sha((evidence/name).read_bytes()),'originalStrictAcceptance':False,'originalMismatches':old['mismatches']}
 corrected=out/'corrected';corrected.mkdir();(corrected/'source.wpd').write_bytes(b)
 reports=[docx(evidence/n,corrected,n!='converted.docx',False) for n in originals]
 # Meaningful controls against accidental weakening: active first headers, wrong case, wrong association and missing page boundary must fail.
 with zipfile.ZipFile(evidence/'converted.docx') as z:parts={n:z.read(n) for n in z.namelist()}
 controls=[]
 for variant in ['inactive-first-header-text','active-first-header','swapped-default-headers','wrong-case-body','removed-page-boundary']:
  data=copy.copy(parts);root=E.fromstring(data['word/document.xml']);secs=list(root.iter(W+'sectPr'))
  if variant=='inactive-first-header-text':
   h=E.fromstring(data['word/header3.xml']);r=E.SubElement(h.find(W+'p'),W+'r');E.SubElement(r,W+'t').text='IGNORED_FIRST_HEADER_CONTROL';data['word/header3.xml']=E.tostring(h)
  elif variant=='active-first-header':E.SubElement(secs[1],W+'titlePg')
  elif variant=='swapped-default-headers':
   x=secs[0].find(W+'headerReference');y=secs[1].find(W+'headerReference');v=x.get(R+'id');x.set(R+'id',y.get(R+'id'));y.set(R+'id',v)
  elif variant=='wrong-case-body':next(root.iter(W+'t')).text='FOO'
  else:
   for run in root.iter(W+'r'):
    for x in list(run):
     if x.tag==W+'br' and x.get(W+'type')=='page':run.remove(x)
   for sec in secs:sec.find(W+'type').set(W+'val','continuous')
  data['word/document.xml']=E.tostring(root);f=out/(variant+'.docx')
  with zipfile.ZipFile(f,'w',compression=zipfile.ZIP_DEFLATED) as z:
   for name,value in data.items():z.writestr(name,value)
  report=docx(f,corrected,False,True);wanted=variant=='inactive-first-header-text';assert report['boundedSourceAcceptance']==wanted
  controls.append({'variant':variant,'expectedAcceptance':wanted,'actualAcceptance':report['boundedSourceAcceptance'],'mismatches':report['mismatches']})
 report={'scope':'WPD6 / lo-wpd-1 only under #30','application':CONFIG['application'],'runtimeExecutedByThisOfflineAudit':False,'originalCI':{'run':RUN,'job':JOB,'attempt':1,'harnessCommit':HARNESS,'conclusion':'failure','reason':'Test-oracle defect: inactive first-page header counted despite absent titlePg. Original reports retained unchanged.'},'artifact':{'id':ARTIFACT,'bytes':len(archive),'sha256':ZIP_SHA,'expiresAt':meta['expires_at']},'originalFiles':originals,'correctedStrictSourceAcceptance':all(x['boundedSourceAcceptance'] for x in reports),'casesPerStage':len(reports[0]['checkedCases']),'stages':len(reports),'controls':controls,'downstreamEnginePassed':True,'newProcessReopenPassed':True,'sourceUnchanged':True,'fullFormatAcceptance':False,'normativeCorrectionSources':['https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.titlepage','https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.evenandoddheaders'],'limits':CONFIG['source']['coverageLimit'],'cleanup':{'localOfficeOrWordExecution':False,'localGuiOrCaptureUsed':False,'newProcessCleanup':fresh['cleanup']}}
 write_json(out/'offline-analysis.json',report);print(json.dumps({k:report[k] for k in ['correctedStrictSourceAcceptance','casesPerStage','stages','downstreamEnginePassed','newProcessReopenPassed','fullFormatAcceptance']}))
if __name__=='__main__':main()
