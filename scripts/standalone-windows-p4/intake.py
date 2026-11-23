"""One official P5 ZIP -> seven unchanged products; six app-only native hosts."""
import base64
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import zipfile

APPS=('writer','spreadsheet','presentation','email','notition','database')
PRODUCTS=('office',)+APPS
APP='b696ab86bd1c128729a079b68c0082e6df3d36a5'
TREE='e30879fd772871e690847c061ef66e6b81808a05'
RUN=45177730188
JOB=137703365803
WINDOWS_GATES=(
    'Pakket bouwen (Windows, ondertekend)',
    'Authenticode controleren (installer, programma en uninstaller)',
    'Windows-installer werkelijk uitpakken en controleren',
    'Meet- en inhoudscontrole voor de meegeleverde runtime',
    'Standaardinstaller controleren met uitsluitend de private runtime',
)

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def write(path,value):path.write_text(json.dumps(value,indent=2)+'\n',encoding='utf8')

def suite_descriptor(binding,suite):
    return dict(schemaVersion=1,consumer='750b',source=dict(producer=binding['artifactRun'],attempt=binding['sourceAttempt'],job=binding['platformJobId'],commit=binding['applicationCommit'],tree=binding['applicationTree'],version=binding['version'],parentArtifact=binding['artifactId'],parentZipSha256=binding['archiveSha256']),suite=suite,contract='Verify full child ZIP against official digest, all3 exact members, original NSIS and canonical report size/SHA, payload==installed app and Authenticode before native UI. Own fresh suite host; no new build.')

def validate(plan):
    assert plan['schemaVersion']==1 and type(plan['ready']) is bool
    assert plan['candidate']=='P5'
    assert (plan['applicationCommit'],plan['applicationTree'],plan['version'])==(APP,TREE,'2026.48.1')
    assert (plan['artifactRun'],plan['platformJobId'],plan['sourceAttempt'])==(RUN,JOB,1)
    assert plan['artifactName']=='uitgave-Windows'
    if plan['ready']:
        assert not plan.get('superseded',False),'Candidate superseded/frozen by integration'
        assert type(plan['artifactId']) is int and plan['artifactId']>0
        assert type(plan['archiveBytes']) is int and plan['archiveBytes']>0
        assert re.fullmatch('[0-9a-f]{64}',plan['archiveSha256'])
        assert plan['officialMetadataGo'] is True

def validate_source(plan,run,job,commit,artifact):
    validate(plan);assert plan['ready']
    assert run['id']==job['run_id']==RUN and run['head_sha']==commit['sha']==APP
    assert commit['tree']['sha']==TREE
    assert job['id']==JOB and job['status']=='completed' and job['conclusion']=='success'
    assert job['head_sha']==APP
    assert run['run_attempt']==job['run_attempt']==1
    assert artifact['id']==plan['artifactId'] and artifact['name']==plan['artifactName'] and not artifact['expired']
    assert artifact['digest']=='sha256:'+plan['archiveSha256']
    assert artifact['size_in_bytes']==plan['archiveBytes']
    assert artifact['workflow_run']['id']==RUN and artifact['workflow_run']['head_sha']==APP
    for name in WINDOWS_GATES:
        steps=[s for s in job['steps'] if s['name']==name]
        assert len(steps)==1 and steps[0]['status']=='completed' and steps[0]['conclusion']=='success',name
    unsigned=[s for s in job['steps'] if s['name']=='Pakket bouwen (onondertekend)']
    assert len(unsigned)==1 and unsigned[0]['conclusion']=='skipped'
    def when(value):return datetime.fromisoformat(value.replace('Z','+00:00'))
    assert when(run['created_at'])<=when(job['started_at'])<=when(artifact['created_at'])<=when(job['completed_at'])
    assert when(artifact['updated_at'])>=when(artifact['created_at'])

def attempt_source(plan,api):
    """Bind the original Windows job, regardless of another OS's later retry."""
    validate(plan)
    attempt=plan['sourceAttempt']
    run=api(f'actions/runs/{RUN}/attempts/{attempt}')
    jobs=api(f'actions/runs/{RUN}/attempts/{attempt}/jobs?per_page=100')
    assert run['id']==RUN and run['run_attempt']==attempt and run['head_sha']==APP
    assert jobs['total_count']<=100
    own=[job for job in jobs['jobs'] if job['id']==JOB]
    assert len(own)==1,'Original Windows job missing or duplicated in pinned attempt'
    job=own[0]
    assert job['run_id']==RUN and job['run_attempt']==attempt and job['head_sha']==APP
    return run,job,jobs

def payload(installer,executable):
    seven=shutil.which('7z') or shutil.which('7z.exe');assert seven
    listing=subprocess.check_output([seven,'l','-slt',str(installer)],encoding='utf8')
    members=[s[7:] for s in listing.splitlines() if s.startswith('Path = ')]
    selected=[m for m in members if PurePosixPath(m.replace('\\','/')).name==executable]
    assert len(selected)==1 and not any(c in selected[0] for c in '*?')
    # A transient PE file is not transferred; only its independent identity is.
    target=installer.parent/'independent-payload.exe'
    with target.open('xb') as output:subprocess.run([seven,'x','-so',str(installer),selected[0]],stdout=output,check=True)
    with target.open('rb') as stream:
        header=stream.read(64);assert header[:2]==b'MZ'
        stream.seek(int.from_bytes(header[60:64],'little'))
        pe=stream.read(26);assert pe[:6]==b'PE\0\0\x64\x86' and pe[24:26]==b'\x0b\x02'
    result=dict(member=selected[0],bytes=target.stat().st_size,sha256=digest(target),pe='x64',derivation='Independent7-Zip stdout from official whole-ZIP/report-bound NSIS before install')
    target.unlink();return result

def main():
    command,config,*args=sys.argv[1:];plan=json.loads(Path(config).read_bytes());validate(plan)
    if command=='plan':
        values='ready='+str(plan['ready']).lower()+'\napps='+json.dumps(APPS)+'\n'
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf8') as f:f.write(values)
        print(values,end='');return
    assert command=='prepare' and plan['ready'] and os.environ.get('GITHUB_ACTIONS')=='true'
    root=Path(args[0]);root.mkdir(parents=True,exist_ok=False)
    provenance=root/'provenance';provenance.mkdir()
    seven=shutil.which('7z') or shutil.which('7z.exe');assert seven,'7-Zip missing before canonical download'
    tools=subprocess.check_output([seven,'i'],encoding='utf8',timeout=15)
    assert 'nsis' in tools.lower(),'NSIS extractor unavailable before canonical download'
    write(provenance/'tool-capability.json',dict(path=seven,nsisHandler=True,description=tools.splitlines()[:5],stage='Before whole canonical download'))
    repo=os.environ['GITHUB_REPOSITORY'];assert re.fullmatch(r'[\w.-]+/[\w.-]+',repo)
    def api(endpoint):return json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/{endpoint}']))
    run,job,attempt_jobs=attempt_source(plan,api)
    commit=api(f'git/commits/{APP}')
    artifact=api(f"actions/artifacts/{plan['artifactId']}")
    validate_source(plan,run,job,commit,artifact)
    all_artifacts=api(f'actions/runs/{RUN}/artifacts?per_page=100')
    assert all_artifacts['total_count']<=100
    canonical=[a for a in all_artifacts['artifacts'] if a['name']==plan['artifactName'] and not a['expired']]
    assert len(canonical)==1 and canonical[0]['id']==artifact['id'],'Official parent name is not unique'
    tree=api(f'git/trees/{TREE}?recursive=1');assert tree['sha']==TREE and not tree['truncated']
    studio_entry=next(e for e in tree['tree'] if e['path']=='assets/studios.json' and e['type']=='blob')
    studio_blob=api('git/blobs/'+studio_entry['sha']);studio_bytes=base64.b64decode(studio_blob['content'])
    assert hashlib.sha1(f'blob {len(studio_bytes)}\0'.encode()+studio_bytes).hexdigest()==studio_entry['sha']
    studios={s['sleutel']:s for s in json.loads(studio_bytes)};assert set(studios)==set(PRODUCTS)
    (provenance/'studios-source.json').write_bytes(studio_bytes)
    for name,value in [('approved-input.json',plan),('source-run.json',run),('source-attempt-jobs.json',attempt_jobs),('source-job.json',job),('source-commit.json',commit),('source-tree.json',tree),('artifact-metadata.json',artifact)]:write(provenance/name,value)
    archive=root/'canonical.zip'
    with archive.open('xb') as stream:subprocess.run(['gh','api',f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"],stdout=stream,check=True)
    assert archive.stat().st_size==artifact['size_in_bytes'] and digest(archive)==plan['archiveSha256'],'Full canonical ZIP identity differs'
    binding=dict(schemaVersion=1,scope='Seven-product preparation/split; six app-only native hosts. Suite transfer is separate for750b.',applicationCommit=APP,applicationTree=TREE,version=plan['version'],artifactRun=RUN,platformJobId=JOB,sourceAttempt=1,artifactId=artifact['id'],archiveSha256=plan['archiveSha256'],archiveBytes=archive.stat().st_size,preparerRun=int(os.environ['GITHUB_RUN_ID']),preparerHarness=os.environ['GITHUB_SHA'],products={})
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist();names=[e.filename for e in entries];assert len(names)==len(set(names))<10000
        for e in entries:
            p=PurePosixPath(e.filename);assert not p.is_absolute() and '..' not in p.parts and '\\' not in e.filename and not stat.S_ISLNK(e.external_attr>>16)
        for key in PRODUCTS:
            studio=studios[key];executable=studio['programma']+'.exe'
            assert executable=='open-'+('office' if key=='office' else key)+'-studio.exe'
            report_name='pakketcontrole-'+('Windows' if key=='office' else ('Database' if key=='database' else key)+'-Windows')+'.json'
            reports=[e for e in entries if PurePosixPath(e.filename).name==report_name];assert len(reports)==1 and reports[0].file_size<5*1024**2
            report_bytes=z.read(reports[0]);report=json.loads(report_bytes)
            assert report['platform']=='windows' and report['programma']==studio['programma'] and report['versie']==plan['version']
            assert len(report['pakketten'])==1 and report['installatie_en_native_bediening']=='niet_gecontroleerd'
            packaged=report['pakketten'][0];assert re.fullmatch('[0-9a-f]{64}',packaged['sha256'])
            members=[e for e in entries if e.filename.startswith(f'dist-installers/{key}/nsis/') and PurePosixPath(e.filename).name==packaged['naam']]
            assert len(members)==1 and members[0].file_size==packaged['bytes'] and 0<packaged['bytes']<2*1024**3
            directory=root/key;directory.mkdir();installer=directory/packaged['naam']
            with z.open(members[0]) as src,installer.open('xb') as dest:shutil.copyfileobj(src,dest,1024*1024)
            assert digest(installer)==packaged['sha256']
            (directory/'canonical-package-report.json').write_bytes(report_bytes)
            (provenance/report_name).write_bytes(report_bytes)
            application=dict(key=key,title=studio['naam'],identifier=studio['identifier'],executable=executable,packagePath=members[0].filename,sha256=packaged['sha256'],bytes=packaged['bytes'],signature='valid',timestampRequired=True,payloadExecutable=payload(installer,executable))
            receipt={k:binding[k] for k in ('applicationCommit','applicationTree','version','artifactRun','platformJobId','sourceAttempt','artifactId','archiveSha256','archiveBytes','preparerRun','preparerHarness')}
            receipt.update(application=application,installer=installer.name,canonicalPackageReport=dict(parentMember=reports[0].filename,sha256=hashlib.sha256(report_bytes).hexdigest(),bytes=len(report_bytes)),boundary='Only this unchanged product NSIS, own canonical report and receipt. Six standalone hosts never receive suite bytes.' if key!='office' else 'Separate unchanged suite transfer reserved for750b; never delivered to standalone hosts.')
            write(directory/'package.json',receipt);binding['products'][key]=receipt
    write(provenance/'binding-before-child-artifacts.json',binding)
    print(json.dumps(dict(source=APP,products=list(PRODUCTS),oneCanonicalDownload=True,scope=binding['scope'])))

if __name__=='__main__':main()
