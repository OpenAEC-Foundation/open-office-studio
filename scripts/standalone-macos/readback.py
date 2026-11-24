"""Only finish the missing visible XLSB-output readback; never rerun import/edit/#377."""
import json,shutil,subprocess,time,zipfile
from pathlib import Path
from contracts import digest,verify_source_witness_record

READBACK={'run':45357794642,'qaCommit':'4c2d7637e61a39d851cccb39d296d13d520a9388',
    'artifact':14904041365,'name':'standalone-native-spreadsheet-xlsb-4c2d7637e61a39d851cccb39d296d13d520a9388',
    'archiveSHA256':'fa28025fb854905a58643eb6f12b1a084e6569c418e6501d5fc964dd39981acd','archiveBytes':6053555,
    'members':{
        'edited-native.xlsx':{'member':'spreadsheet-documents/xlsb/edited-native.xlsx','bytes':6476,
            'sha256':'0eb60817b210e6e9261764b32f97971d69e9d9ee911f3a012072c91632defdee'},
        'shared_formula.xlsb':{'member':'spreadsheet-documents/xlsb/shared_formula.xlsb','bytes':7651,
            'sha256':'e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3'},
        'original-policy377.json':{'member':'spreadsheet/xlsb/save-policy377.json','bytes':5653,
            'sha256':'6a90dd10169de9988566bbf63f9c2ffe66752abc4b272cf814d3f8c96c59c8f7'},
        'original-receipt.json':{'member':'spreadsheet/receipt.json','bytes':84221,
            'sha256':'3b8ce7ab1e3fc913745dd5371fdf6da384dcfbf587902c335315da4226744844'}}}


def verify_policy(policy):
    source=policy['sourceFingerprint'];before=policy['beforeWorkingCopy']
    if (policy.get('status')!='functional-evidence-collected-review-pending' or policy.get('failure')
            or source.get('sha256')!=READBACK['members']['shared_formula.xlsb']['sha256']
            or source.get('bytes')!=7651 or type(source.get('mtimeNs')) is not int
            or set(policy.get('routes',{}))!={'command-s','ordinary-save'}):
        raise ValueError('Original short #377 source/proposal/Cancel evidence not complete')
    for route in policy['routes'].values():
        if (route.get('sourceBytesUnchanged') is not True or route.get('unsavedWorkingCopyPreserved') is not True
                or route.get('sourceFingerprintAfterCancel')!=source or route.get('afterWorkingCopy')!=before
                or route['proposal']['selectedFormat'].get('AXValue')!=1
                or route['proposal']['filename'].get('AXTitle')!='File name .xlsx'
                or route['proposal']['filename'].get('AXValue')!='shared_formula'):
            raise ValueError('Original short #377 route changed source/default/copy state')


def load_readback(q,proof,folder):
    if q.get('spreadsheetFollowup',{}).get('readback')!=READBACK:raise ValueError('Exact saved-output readback not authorized')
    folder=Path(folder)/'readback'
    for name,entry in READBACK['members'].items():
        p=folder/name
        if p.is_symlink() or p.stat().st_size!=entry['bytes'] or digest(p)!=entry['sha256']:
            raise ValueError('Authenticated original readback member bytes differ: '+name)
    old=json.loads((folder/'original-receipt.json').read_text())
    if (old.get('source')!=q['source'] or old['provenance'].get('parentArtifact')!=q['parentArtifact']
            or old['provenance'].get('package')!=proof.get('package')
            or any(old.get(k) is not True for k in ('identityVerified','installedSignatureGatesVerified','suiteAbsent',
                'freshProfileVerified','ownCwdEnvironmentVerified','nativeFocusVerified','fullQuitVerified','cleanupPassed'))
            or old.get('failure',{}).get('message')!='Visible Writer body target unavailable; no input or paint primer sent: Unique readable original body word unavailable: 42'):
        raise ValueError('Original XLSB evidence is not the exact source-bound late visibility failure')
    launches=old.get('launches',[]);preflight=old.get('additionalCases',{}).get('xlsb',{}).get('ownNativeHostPreflight',{})
    pids=[l.get('pid') for l in launches]
    if (len(launches)!=3 or len(set(pids))!=3 or any(type(p) is not int or p<=0 for p in pids)
            or not launches[-1].get('argv',[])[-1].endswith('/xlsb/edited-native.xlsx')
            or preflight.get('previousPid')!=pids[0] or preflight.get('newReopenPid')!=pids[1]
            or any(preflight.get(k) is not True for k in ('nativeFocusVerified','nativeSaveAndIndependentOracleVerified','fullNormalQuitVerified'))):
        raise ValueError('Original native fresh-host preflight and final saved-file cold launch not established')
    verify_source_witness_record(q,old['provenance'])
    verify_policy(json.loads((folder/'original-policy377.json').read_text()))
    import xlsb_oracle
    xlsb_oracle.BASE=folder;xlsb_oracle.source_oracle();oracle=xlsb_oracle.inspect_xlsx(folder/'edited-native.xlsx',True)
    return folder,{'originalProof':READBACK,'originalEditAndPolicyReused':True,'originalFailureRetained':True,
        'savedOutputIndependentOracle':oracle,'scope':'Only missing native visible reopening; no new raw import, save-policy or edit pass inferred.'}


def prepare_readback(q,output,api):
    if not q.get('spreadsheetFollowup',{}).get('readback'):return
    meta=api('/actions/artifacts/'+str(READBACK['artifact']))
    if (meta.get('id')!=READBACK['artifact'] or meta.get('name')!=READBACK['name'] or meta.get('expired') is not False
            or meta.get('digest')!='sha256:'+READBACK['archiveSHA256'] or meta.get('size_in_bytes')!=READBACK['archiveBytes']
            or meta.get('workflow_run',{}).get('id')!=READBACK['run'] or meta['workflow_run'].get('head_sha')!=READBACK['qaCommit']):
        raise ValueError('Official saved-output source proof identity/hash differs')
    archive=Path(output).parent/'frozen-xlsb-readback-proof.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh','api','repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/'+str(READBACK['artifact'])+'/zip'],stdout=stream,check=True)
    if archive.stat().st_size!=READBACK['archiveBytes'] or digest(archive)!=READBACK['archiveSHA256']:
        raise ValueError('Original XLSB proof archive hash differs')
    folder=Path(output)/'spreadsheet/readback';folder.mkdir()
    with zipfile.ZipFile(archive) as z:
        for name,item in READBACK['members'].items():
            if z.namelist().count(item['member'])!=1:raise ValueError('Unique original readback member required')
            entry=z.getinfo(item['member'])
            if entry.is_dir() or (entry.external_attr>>16)&0o170000==0o120000 or entry.file_size!=item['bytes']:
                raise ValueError('Readback member must be the exact bounded regular file')
            (folder/name).write_bytes(z.read(entry))
    package=folder.parent;proof=json.loads((package/'provenance.json').read_text());load_readback(q,proof,package)


def selected_a15(snapshot):
    focus=snapshot.get('focused',{});label=focus.get('AXDescription') or focus.get('AXTitle','')
    fields=[r['attributes'] for r in snapshot.get('rawNodes',[]) if r['attributes'].get('AXRole')=='AXTextField'
        and r['attributes'].get('frame') and r['attributes'].get('AXEnabled') is not False
        and 'Enter a value or formula' in (r['attributes'].get('AXTitle'),r['attributes'].get('AXDescription'))]
    return (focus.get('AXRole')=='AXCell' and focus.get('AXSelected') is True and focus.get('AXFocused') is True
            and focus.get('frame') and label=='A15, 42, selected'
            and len(fields)==1 and fields[0].get('AXValue') in ('=40+2','40+2'))


def native_readback(session,q,proof,package):
    from cases import Case
    from sheet_formats import readable_grid_zoom,selected_workbook
    from native import Unavailable
    import xlsb_oracle
    origin,binding=load_readback(q,proof,package);target=session.documents/'xlsb-readback';target.mkdir()
    for name in ('edited-native.xlsx','shared_formula.xlsb'):
        shutil.copyfile(origin/name,target/name)
        if digest(target/name)!=READBACK['members'][name]['sha256']:raise Unavailable('Own readback copy bytes changed')
    output=target/'edited-native.xlsx';xlsb_oracle.BASE=target
    receipt={'status':'running','nativeAccepted':False,'binding':binding,'passes':[]}
    session.report['xlsbVisualReadback']=receipt;session.start(output);first_pid=session.process.pid
    for attempt in range(2):
        case=Case(session,output)
        for phase in range(2):
            case.select(['AXTextField','AXComboBox'],['Name box']);case.replace('A15');session.ax('key','return')
            deadline=time.monotonic()+5
            while not selected_a15(case.snapshot()):
                if time.monotonic()>=deadline:raise Unavailable('Actual readback A15/formula focus not established')
                time.sleep(.2)
            if phase==0:readable_grid_zoom(case)
        workbook=selected_workbook(case.snapshot(),output.name)
        point=case.writer_visible('42','xlsb-readback-visible-'+str(attempt))
        oracle=xlsb_oracle.inspect_xlsx(output,True)
        if digest(output)!=READBACK['members']['edited-native.xlsx']['sha256']:raise Unavailable('Read-only reopened output changed')
        session.capture('xlsb-readback-'+str(attempt));pid=session.quit()
        receipt['passes'].append({'pid':pid,'actualSelectedWorkbook':workbook,'originalBodyTarget':point,
            'independent30FormulaOracle':oracle,'normalQuitVerified':True})
        if attempt==0:
            session.start(output)
            if session.process.pid==first_pid:raise Unavailable('Readback full quit did not yield a new PID')
            session.report['newPidReopenVerified']=True
    receipt.update(status='functional-evidence-collected-review-pending',sourceAndOutputBytesUnchanged=True)
    session.report.update(status='readback-functional-evidence-collected-review-pending',xlsbVisualReadbackCompleted=True)
    session.write('xlsb-readback-phase.json',receipt)
