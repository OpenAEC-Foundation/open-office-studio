import gzip,hashlib,io,json,posixpath,subprocess,xml.etree.ElementTree as ET,zipfile
from pathlib import Path,PurePosixPath
sha=lambda b:hashlib.sha256(b).hexdigest();q=Path('C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes/work/oos-linux-release-input-p5-2026-11-23');p=q/'.local/p5-spreadsheet-45194487509/proof.zip';rev='548a342cb79e2db317c9157b83bbd7b49635c6b1';source='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';blob=lambda r,n:subprocess.check_output(['git','-C',str(q),'show',r+':'+n]);ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def xlsx(raw):
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  names=z.namelist();assert len(names)==len(set(names));wb=ET.fromstring(z.read('xl/workbook.xml'));rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};ss=[]
  if 'xl/sharedStrings.xml' in names:ss=[''.join(t.text or '' for t in s.iter(ns['s'].join(['{','}t']))) for s in ET.fromstring(z.read('xl/sharedStrings.xml'))]
  result={}
  for sheet in wb.findall('s:sheets/s:sheet',ns):
   target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target);cells={}
   for c in ET.fromstring(z.read(target)).findall('.//s:sheetData/s:row/s:c',ns):
    f=c.find('s:f',ns);v=c.find('s:v',ns);typ=c.get('t','n');val=v.text if v is not None else None
    if typ=='s':val=ss[int(val)]
    elif typ=='inlineStr':val=''.join(t.text or '' for t in c.findall('.//s:t',ns))
    cells[c.attrib['r']]=dict(type=typ,formula=f.text if f is not None else None,value=val)
   result[sheet.attrib['name']]=cells
  return result
raw=p.read_bytes();assert len(raw)==5142530 and sha(raw)=='948517759acfc3e4be36aa3436aa6f27b697286860bcdb41524df8c53599611f';meta=json.loads(subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/14828631845']));assert meta['digest']=='sha256:'+sha(raw) and meta['workflow_run']['head_sha']==rev and meta['workflow_run']['id']==45194487509
h=blob(rev,'scripts/proef-standalone-linux.mjs');assert sha(h)=='8985557e67f2a3d2638ba3f6519fb30aa80f2ac86b909cde64756481cddbb09b';assert b'Fresh process on reopen' in h and b'Normal Alt+F4 must fully exit app, AppImage launcher and owned WebKit processes' in h
fixture=blob(rev,'scripts/standalone-linux-ooxml.mjs');assert b'<c r="A1"><v>4</v></c><c r="B1"><f>A1*3</f><v>12</v></c>' in fixture;forms=[]
with zipfile.ZipFile(p) as z:
 o=json.loads(z.read('standalone-linux-input/origin.json'));inp=json.loads(z.read('standalone-linux-input/input-artifact-receipt.json'));pr=z.read('standalone-linux-input/pakketcontrole-spreadsheet-Linux.json');packages=json.loads(pr)['pakketten'];studio=next(s for s in json.loads(blob(source,'assets/studios.json')) if s['sleutel']=='spreadsheet')
 assert o['sourceCommit']==source and o['sourceTree']==tree and o['version']=='2026.48.1' and o['studio']==studio and sha(pr)==o['packageReportSha256'];assert inp['inputArtifact']['id']==14824139421 and inp['canonicalParent']['id']==14824745492 and inp['archiveLocallyHashVerified'] is True
 for kind,pids in [('appimage',[4915,5132]),('deb',[23667,23831])]:
  base='standalone-linux-results/spreadsheet/'+kind+'/';rraw=z.read(base+'report.json');r=json.loads(rraw);gbase='linux-p2-native/standalone-spreadsheet-'+kind+'/';g=json.loads(z.read(gbase+'report.json'))
  assert r['sourceCommit']==source and r['sourceTree']==tree and r['version']=='2026.48.1' and r['harnessCommit']==rev and r['harnessSha256']==sha(h);assert r['identity']==studio['identifier'] and r['nativeMetadata']==dict(identifier=studio['identifier'],name=studio['naam'],version='2026.48.1')
  pkg=r['package'];op=next(a for a in o['packages'] if a['path']==PurePosixPath(pkg['path']).name);entry=next(a for a in packages if a['naam']==op['path']);assert all(pkg[k]==op[k] for k in ['sha256','bytes','canonicalMember']) and all(pkg[k]==entry[k] for k in ['sha256','bytes'])
  saved=z.read(base+'Synthetic spreadsheet.xlsx');assert sha(saved)==r['savedSha256'];sheets=xlsx(saved);assert len(sheets)==1;cells=next(iter(sheets.values()))
  for address,value,formula in [('A1','9',None),('B1',str(9*3),'A1*3'),('C1',str(9+9*3),'A1+B1')]:assert cells[address]==dict(type='n',formula=formula,value=value),(kind,address,cells[address])
  launches=r['launches'][:2];assert [l['pid'] for l in launches]==pids
  for l in launches:
   bind=l['x11']['binding'];assert bind['pid']==l['pid'] and bind['sha256']==l['executableSha256']==r['payloadExecutableSha256'] and bind['executable']==l['executable'];assert l['executable'].endswith('/usr/bin/open-spreadsheet-studio') and not any('/usr/bin/open-office-studio' in s or '/usr/lib/Open Office Studio/' in s for s in l['mappedResources']);env=dict(v.split('=',1) for v in l['environment']);assert env['XDG_DATA_HOME'].startswith(env['HOME']) and env['XDG_CONFIG_HOME'].startswith(env['HOME']) and 'empty-home' in env['HOME']
  for c in r['nativeCaptures']:assert sha(z.read(base+c['name']))==c['sha256'] and c['pid'] in pids
  assert all(r[k] is True for k in ['ownedApplicationClosed','ownedDriverClosed','ownedKeyringClosed','ownedProfilesRemoved'])
  auditedCases=[]
  for case in g['cases']:
   ext=case['extension'];src=z.read(gbase+'source.'+ext);assert len(src)==2062 and sha(src)==case['sourceSha256']=='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6';rt=ET.fromstring(gzip.decompress(src));sourceCells=[n for n in rt.iter() if n.tag.rsplit('}',1)[-1]=='Cell'];assert len(sourceCells)==8;assert [c.text for c in sourceCells]==['1','String1','=2*3','2','String2','=2+3','=2-3','=C1+C2']
   converted=z.read(gbase+case['xlsx']);assert sha(converted)==case['xlsxSha256'];tabs=xlsx(converted);assert list(tabs)==['Sheet1','Sheet2'];s=tabs['Sheet1']
   for address,val,f in [('A1','1',None),('A2','2',None),('C1',str(2*3),'2*3'),('C2',str(2+3),'2+3'),('C3',str(2-3),'2-3'),('C4',str(2*3+2+3),'C1+C2')]:assert s[address]==dict(type='n',formula=f,value=val)
   assert s['B1']['value']=='String1' and s['B2']['value']=='String2' and s['B1']['type'] in ['s','inlineStr'] and s['B2']['type'] in ['s','inlineStr'];assert tabs['Sheet2']['A1']['value']=='GNM30 EDIT' and case['firstPid']!=case['reopenPid'] and case['originalUnchanged'] is True and case['status']=='passed';auditedCases.append(dict(extension=ext,status='source-derived-typed-XML/caches-and-recorded-reopen-pass',sourceSha256=sha(src),savedSha256=sha(converted),firstPid=case['firstPid'],reopenPid=case['reopenPid']))
  if kind=='appimage':assert r['status']==g['status']=='failed' and g['failedPhase']=='gnumeric-import' and 'invalid session id' in g['error'] and [c['extension'] for c in g['cases']]==['gnm']
  else:assert r['status']==g['status']=='passed' and [c['extension'] for c in g['cases']]==['gnm','gnumeric']
  forms.append(dict(kind=kind,originalOverallStatus=r['status'],rawReportSha256=sha(rraw),coreXlsxFunctionalStatus='passed',coreSavedSha256=sha(saved),independentTypedCells=cells,corePids=pids,fullQuitThenNewPidVerifiedInPinnedHarness=True,ownedPrivateXdgEnvironment=True,noSuiteMappedExecutable=True,package=pkg,payloadElfSha256=r['payloadExecutableSha256'],coreSavedAndReopenedPngInspected=True,allFourFinalCleanupFlagsTrue=True,finalPostScenarioProfileInventoryPresent='profilePaths' in r,gnmCases=auditedCases,gnumericStatus='failed-unclassified-invalid-session-after-picker' if kind=='appimage' else 'passed'))
audit=dict(scope='Read-only standalone Linux Spreadsheet P5 core-XLSX and completed GNM evidence audit',status='core-XLSX-functional-pass-both; AppImage-gnumeric-overall-failure-preserved',source=source,tree=tree,version='2026.48.1',run=45194487509,harness=rev,harnessSha256=sha(h),fixtureOracleSha256=sha(fixture),proofPath=str(p),proofArtifact=14828631845,proofBytes=len(raw),proofZipSha256=sha(raw),child=14824139421,parent=14824745492,forms=forms,limits=['No new GUI/run/build/installer or ZIP download.','AppImage whole route remains FAILED/unclassified at .gnumeric import; core pass does not waive that addon.','AppImage final post-scenario profilePaths inventory was not reached after addon failure; actual private XDG bindings/no Suite mapped executable and final cleanup are present. No claim that the missing final inventory ran.','Forensic reuse of producer package/process receipts; no independent payload extraction, signature/hardware/general-variant acceptance.'],sixPngsViewedSerially=True)
out=Path('.local/spreadsheet-core-audit/audit.json');out.write_bytes((json.dumps(audit,indent=2)+'\n').encode());print(json.dumps(dict(path=str(out.resolve()),sha256=sha(out.read_bytes()),status=audit['status'])))
