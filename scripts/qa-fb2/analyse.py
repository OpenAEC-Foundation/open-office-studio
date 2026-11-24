"""Authenticate and audit the completed FB2 result; no Office or Word execution."""
import argparse,copy,hashlib,json,zipfile
from pathlib import Path,PurePosixPath
from xml.etree import ElementTree as E
from oracle import CONFIG,native,docx,write_json,W
RUN=45365158601
JOB=138344859697
HARNESS='1f383f40edfdbe4b0bb43c3eb61e1b8340268216'
ARTIFACT=14905653810
ZIP_SHA='845fd68be6efa8535f8ed24068cc56cec99d61c5ed7e7bd85d943fae6c9c6e47'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--metadata',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--job',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out;out.mkdir(parents=True,exist_ok=True)
 archive=a.archive.read_bytes();meta=json.loads(a.metadata.read_text(encoding='utf-8'));run=json.loads(a.run.read_text(encoding='utf-8'));job=json.loads(a.job.read_text(encoding='utf-8'))
 assert len(archive)==68057 and sha(archive)==ZIP_SHA
 assert meta['id']==ARTIFACT and meta['digest']=='sha256:'+ZIP_SHA and meta['workflow_run']['id']==RUN and meta['workflow_run']['head_sha']==HARNESS
 assert run['id']==RUN and run['head_sha']==HARNESS and run['run_attempt']==1 and run['conclusion']=='success'
 assert job['id']==JOB and job['run_id']==RUN and job['head_sha']==HARNESS and job['conclusion']=='success'
 evidence=out/'original';assert not evidence.exists(),'Preserve existing evidence; use a fresh output directory'
 with zipfile.ZipFile(a.archive) as z:
  for x in z.infolist():
   path=PurePosixPath(x.filename);assert not path.is_absolute() and '..' not in path.parts
  z.extractall(evidence)
 load=lambda n:json.loads((evidence/n).read_text(encoding='utf-8'))
 source=(evidence/'source.fb2').read_bytes();assert sha(source)==CONFIG['source']['sha256'] and len(source)==CONFIG['source']['bytes']
 oracle=json.loads(json.dumps(native(source,CONFIG['edit'])));assert oracle==load('source-oracle.json')
 pin=json.loads(Path('scripts/qa-fb2/runtime-input.json').read_text(encoding='utf-8'));binding=load('runtime-binding.json');verified=load('runtime-consumer-verification.json')
 assert binding['application']==CONFIG['application'] and binding['artifact']==pin
 assert verified['status']=='verified' and verified['sourceCommit']==CONFIG['application']['commit'] and verified['tarSha256']==pin['tarSha256']
 assert binding['programSha256']==pin['launcherSha256'] and binding['entryManifest']['entries']==pin['manifestEntries'] and binding['entryManifest']['sha256']==pin['manifestSha256']
 assert sha((evidence/'runtime-coordinator-descriptor.json').read_bytes())==pin['descriptorSha256']
 coordinator=load('runtime-coordinator-descriptor.json');assert sha((evidence/'runtime-base-descriptor.json').read_bytes())==coordinator['runtimeBaseDescriptorSha256']
 converter=load('converter-report.json');assert converter['binding']==binding and converter['sourceUnchanged'] and converter['sourceSha256']==CONFIG['source']['sha256'] and converter['exitCode']==0
 assert converter['profileSha256']=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
 assert sha((evidence/'converted.docx').read_bytes())==converter['outputSha256']
 for n in CONFIG['source']['notices']:assert sha((evidence/'source-notices'/n['path']).read_bytes())==n['sha256']
 route=load('route-report.json');engine=load('engine-report.json');fresh=load('fresh-process-report.json')
 assert route['passed'] and engine['passed'] and engine['strictSourceAcceptance'] and engine['downstreamEnginePassed'] and fresh['passed'] and fresh['boundedSourceAcceptance'] and fresh['downstreamEnginePassed']
 assert engine['harnessCommit']==fresh['harnessCommit']==HARNESS and engine['application']==fresh['application']==CONFIG['application']
 assert engine['engine']==fresh['engine'] and engine['engine']['route']=='productiekern'
 pins=json.loads(Path('patches/tekstengine-nootnummering.json').read_text(encoding='utf-8'));assert engine['engine']['kernels']['edit']['sha256']==pins['wasmSha256'] and engine['engine']['kernels']['layout']['sha256']==pins['layoutWasmSha256']
 assert engine['process']['pid']!=fresh['process']['pid'] and engine['process']['startedAt']<fresh['process']['startedAt']
 assert engine['editedParagraphs']==fresh['paragraphs']==oracle['expected']['editedTexts']
 assert engine['sourceSchemaConformance'] is False and fresh['sourceSchemaConformance'] is False
 assert engine['sourceSchemaGap']==fresh['sourceSchemaGap']==oracle['schemaAssessment']['missingRequiredFields']
 assert len(oracle['schemaAssessment']['missingRequiredFields'])==2
 assert any(str(x).endswith('/invoer.fb2') for x in converter['argv'])
 assert fresh['cleanup']=={'sessionDestroyed':True,'productionLoaderClosed':True,'localGuiOrCaptureUsed':False}
 assert sha((evidence/'saved.docx').read_bytes())==fresh['inputSavedSha256']
 corrected=out/'rechecked';corrected.mkdir();(corrected/'source.fb2').write_bytes(source);reports=[];files={}
 for name in ['converted.docx','saved.docx','reopened-saved.docx','fresh-process-saved.docx']:
  old=load(name.replace('.docx','-xml-report.json'));new=docx(evidence/name,corrected,name!='converted.docx',False)
  assert new==old and len(new['checkedCases'])==4 and new['mismatches']==[]
  reports.append(new);files[name]={'bytes':(evidence/name).stat().st_size,'sha256':new['sha256']}
 # Deliberate non-source body changes must be rejected; these are oracle controls, not extra import fixtures.
 with zipfile.ZipFile(evidence/'converted.docx') as z:parts={n:z.read(n) for n in z.namelist()}
 controls=[]
 for variant in ['dropped-punctuation','metadata-flattened-into-body','invented-table']:
  data=copy.copy(parts);root=E.fromstring(data['word/document.xml']);body=root.find(W+'body');para=body.find(W+'p')
  if variant=='dropped-punctuation':next(para.iter(W+'t')).text='Hello world'
  elif variant=='metadata-flattened-into-body':
   newp=E.Element(W+'p');newr=E.SubElement(newp,W+'r');E.SubElement(newr,W+'t').text='Hello world';body.insert(0,newp)
  else:
   table=E.Element(W+'tbl');E.SubElement(table,W+'tblPr');grid=E.SubElement(table,W+'tblGrid');E.SubElement(grid,W+'gridCol').set(W+'w','1000');row=E.SubElement(table,W+'tr');cell=E.SubElement(row,W+'tc');E.SubElement(cell,W+'tcPr');E.SubElement(cell,W+'p');body.insert(0,table)
  data['word/document.xml']=E.tostring(root);f=out/(variant+'.docx')
  with zipfile.ZipFile(f,'w',compression=zipfile.ZIP_DEFLATED) as z:
   for name,b in data.items():z.writestr(name,b)
  report=docx(f,corrected,False,True);assert not report['boundedSourceAcceptance'];controls.append({'variant':variant,'passed':True,'mismatches':report['mismatches']})
 result={'scope':'FB2 / lo-fb2-1 only under #30','application':CONFIG['application'],'runtimeExecutedByThisOfflineAudit':False,'ci':{'run':RUN,'job':JOB,'attempt':1,'harnessCommit':HARNESS,'conclusion':'success','completedAt':run['updated_at']},'artifact':{'id':ARTIFACT,'bytes':len(archive),'sha256':ZIP_SHA,'expiresAt':meta['expires_at']},'sourceSha256':CONFIG['source']['sha256'],'sourceBodyParagraphs':oracle['expected']['paragraphCount'],'sourceSchemaConformance':False,'missingRequiredSchemaFields':oracle['schemaAssessment']['missingRequiredFields'],'completeFB2Acceptance':False,'boundedSourceAcceptance':True,'bodyRouteOnly':True,'status':'LIMITED_BODY_ROUTE_PASS_SOURCE_SCHEMA_FAIL','casesPerStage':4,'stages':4,'controls':controls,'files':files,'downstreamEnginePassed':True,'newProcessReopenPassed':True,'sourceUnchanged':True,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit'],'cleanup':{'localGuiOrCaptureUsed':False,'localRuntimeUsed':False,'newProcess':fresh['cleanup']}}
 write_json(out/'offline-analysis.json',result);print(json.dumps({k:result[k] for k in ['boundedSourceAcceptance','casesPerStage','stages','downstreamEnginePassed','newProcessReopenPassed','fullFormatAcceptance']}))
if __name__=='__main__':main()
