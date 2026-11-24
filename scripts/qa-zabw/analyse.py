"""Authenticate and audit the completed ZABW result; no Office or Word execution."""
import argparse,copy,hashlib,json,zipfile,subprocess
from pathlib import Path,PurePosixPath
from xml.etree import ElementTree as E
from oracle import CONFIG,native,docx,write_json,W
RUN=45362594875
JOB=138336125899
HARNESS='c8a783153a915577e25e1f7dd2ebc89e439719c4'
ARTIFACT=14904668447
ZIP_SHA='81d42e807ee043744174a4a0467fbd269aeda85859da285a48688aa6762413fe'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--metadata',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--job',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out;out.mkdir(parents=True,exist_ok=True)
 archive=a.archive.read_bytes();meta=json.loads(a.metadata.read_text(encoding='utf-8'));run=json.loads(a.run.read_text(encoding='utf-8'));job=json.loads(a.job.read_text(encoding='utf-8'))
 assert len(archive)==70012 and sha(archive)==ZIP_SHA
 assert meta['id']==ARTIFACT and meta['digest']=='sha256:'+ZIP_SHA and meta['workflow_run']['id']==RUN and meta['workflow_run']['head_sha']==HARNESS
 assert run['id']==RUN and run['head_sha']==HARNESS and run['run_attempt']==1 and run['conclusion']=='success'
 assert job['id']==JOB and job['run_id']==RUN and job['head_sha']==HARNESS and job['conclusion']=='success'
 evidence=out/'original';assert not evidence.exists(),'Preserve existing evidence; use a fresh output directory'
 with zipfile.ZipFile(a.archive) as z:
  for x in z.infolist():
   path=PurePosixPath(x.filename);assert not path.is_absolute() and '..' not in path.parts
  z.extractall(evidence)
 load=lambda n:json.loads((evidence/n).read_text(encoding='utf-8'))
 source=(evidence/'source.zabw').read_bytes();assert sha(source)==CONFIG['source']['sha256'] and len(source)==CONFIG['source']['bytes']
 oracle=json.loads(json.dumps(native(source,CONFIG['edit'])));assert oracle==load('source-oracle.json')
 reader=Path('scripts/qa-zabw/xml_oracle.py').read_bytes().replace(b'\r\n',b'\n');git_reader=subprocess.check_output(['git','cat-file','blob',CONFIG['reusedXMLReader']['gitBlob']]);executed_blob=subprocess.check_output(['git','rev-parse',HARNESS+':scripts/qa-zabw/xml_oracle.py'],text=True).strip();assert executed_blob==CONFIG['reusedXMLReader']['gitBlob'];assert reader==git_reader;assert sha(git_reader)==CONFIG['reusedXMLReader']['sha256'];assert hashlib.sha1(b'blob '+str(len(git_reader)).encode()+b'\0'+git_reader).hexdigest()==CONFIG['reusedXMLReader']['gitBlob']
 container_controls=load('container-controls.json');assert container_controls['passed'] and len(container_controls['controls'])==4 and all(x['rejected'] for x in container_controls['controls'])
 assert {x['control'] for x in container_controls['controls']}=={'corrupt-crc','truncated-trailer','concatenated-members','over-expansion-bound'}
 pin=json.loads(Path('scripts/qa-zabw/runtime-input.json').read_text(encoding='utf-8'));binding=load('runtime-binding.json');verified=load('runtime-consumer-verification.json')
 assert binding['application']==CONFIG['application'] and binding['artifact']==pin
 assert verified['status']=='verified' and verified['sourceCommit']==CONFIG['application']['commit'] and verified['tarSha256']==pin['tarSha256']
 assert binding['programSha256']==pin['launcherSha256'] and binding['entryManifest']['entries']==pin['manifestEntries'] and binding['entryManifest']['sha256']==pin['manifestSha256']
 assert sha((evidence/'runtime-coordinator-descriptor.json').read_bytes())==pin['descriptorSha256']
 coordinator=load('runtime-coordinator-descriptor.json');assert sha((evidence/'runtime-base-descriptor.json').read_bytes())==coordinator['runtimeBaseDescriptorSha256']
 converter=load('converter-report.json');assert converter['binding']==binding and converter['sourceUnchanged'] and converter['sourceSha256']==CONFIG['source']['sha256'] and converter['exitCode']==0
 assert converter['profileSha256']=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
 assert sha((evidence/'converted.docx').read_bytes())==converter['outputSha256']
 assert any(str(x).endswith('/invoer.zabw') for x in converter['argv']),'Wrong converter input extension'
 assert oracle['container']['isize']==CONFIG['innerXML']['bytes'] and oracle['container']['expandedSha256']==CONFIG['innerXML']['sha256']
 assert oracle['container']['members']==1 and oracle['container']['unusedBytes']==0
 for n in CONFIG['source']['notices']:assert sha((evidence/'source-notices'/n['path']).read_bytes())==n['sha256']
 route=load('route-report.json');engine=load('engine-report.json');fresh=load('fresh-process-report.json')
 assert route['passed'] and engine['passed'] and engine['strictSourceAcceptance'] and engine['downstreamEnginePassed'] and fresh['passed'] and fresh['boundedSourceAcceptance'] and fresh['downstreamEnginePassed']
 assert engine['harnessCommit']==fresh['harnessCommit']==HARNESS and engine['application']==fresh['application']==CONFIG['application']
 assert engine['engine']==fresh['engine'] and engine['engine']['route']=='productiekern'
 pins=json.loads(Path('patches/tekstengine-nootnummering.json').read_text(encoding='utf-8'));assert engine['engine']['kernels']['edit']['sha256']==pins['wasmSha256'] and engine['engine']['kernels']['layout']['sha256']==pins['layoutWasmSha256']
 assert engine['process']['pid']!=fresh['process']['pid'] and engine['process']['startedAt']<fresh['process']['startedAt']
 assert engine['editedParagraphs']==fresh['paragraphs']==oracle['expected']['editedTexts']
 assert fresh['cleanup']=={'sessionDestroyed':True,'productionLoaderClosed':True,'localGuiOrCaptureUsed':False}
 assert sha((evidence/'saved.docx').read_bytes())==fresh['inputSavedSha256']
 corrected=out/'rechecked';corrected.mkdir();(corrected/'source.zabw').write_bytes(source);reports=[];files={}
 for name in ['converted.docx','saved.docx','reopened-saved.docx','fresh-process-saved.docx']:
  old=load(name.replace('.docx','-xml-report.json'));new=docx(evidence/name,corrected,name!='converted.docx',False)
  assert new==old and len(new['checkedCases'])==8 and new['mismatches']==[]
  reports.append(new);files[name]={'bytes':(evidence/name).stat().st_size,'sha256':new['sha256']}
 # The unchanged XML checker already has typed negative-control evidence at the same P2 point in the ABW proof.
 # This run's new container controls are authenticated separately; no previous ABW runtime pass is transferred.
 controls=container_controls['controls']
 result={'scope':'ZABW / lo-zabw-1 only under #30','application':CONFIG['application'],'runtimeExecutedByThisOfflineAudit':False,'ci':{'run':RUN,'job':JOB,'attempt':1,'harnessCommit':HARNESS,'conclusion':'success','completedAt':run['updated_at']},'artifact':{'id':ARTIFACT,'bytes':len(archive),'sha256':ZIP_SHA,'expiresAt':meta['expires_at']},'sourceSha256':CONFIG['source']['sha256'],'sourceParagraphs':len(oracle['paragraphs']),'sourceSections':oracle['expected']['sectionCount'],'boundedSourceAcceptance':True,'casesPerStage':8,'stages':4,'controls':controls,'controlsRole':'Recorded synthetic container qualification controls only; concatenation/bound cases are outside QA scope, not general gzip-invalid/product behavior claims','container':oracle['container'],'reusedXMLReader':CONFIG['reusedXMLReader'],'noInheritedABWRuntimePass':True,'officialArtifactName':meta['name'],'files':files,'downstreamEnginePassed':True,'newProcessReopenPassed':True,'sourceUnchanged':True,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit'],'cleanup':{'localGuiOrCaptureUsed':False,'localRuntimeUsed':False,'newProcess':fresh['cleanup']}}
 write_json(out/'offline-analysis.json',result);print(json.dumps({k:result[k] for k in ['boundedSourceAcceptance','casesPerStage','stages','downstreamEnginePassed','newProcessReopenPassed','fullFormatAcceptance']}))
if __name__=='__main__':main()
