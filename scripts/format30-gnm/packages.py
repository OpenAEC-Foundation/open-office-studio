"""Bind the root-approved P2 Linux packages to actual canonical CI artifact bytes."""
import hashlib
import json
import os
from pathlib import Path,PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import zipfile

APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE='5a644e397ecc6af5452a49b6404edf953687d1b2'
RUN=45143305147
JOB=137586343061

def sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda:stream.read(1024*1024),b''):digest.update(data)
    return digest.hexdigest()

def metadata(plan,run,commit,job,artifacts):
    assert plan['applicationCommit']==APP and plan['applicationTree']==TREE and plan['desktopRun']==RUN
    assert plan['platforms']==['Linux'] and plan['version']=='2026.48.1'
    assert run['id']==RUN and run['head_sha']==APP and commit['tree']['sha']==TREE
    assert job['id']==JOB and job['run_id']==RUN,'Wrong Linux source job'
    steps={s['name']:s for s in job['steps']}
    for name in ('Linux-pakket bouwen','Linux-installers werkelijk uitpakken en controleren'):
        assert steps.get(name,{}).get('status')=='completed' and steps[name]['conclusion']=='success',f'Own Linux package check not successful: {name}'
    # The own-platform package is independent of the later native Writer gate
    # and other platforms. Preserve their status instead of calling them green.
    matches=[a for a in artifacts if a['name']=='open-office-studio-Linux' and not a['expired']]
    assert len(matches)==1
    artifact=matches[0];assert re.fullmatch(r'sha256:[0-9a-f]{64}',artifact['digest'])
    assert artifact.get('workflow_run',{}).get('head_sha',APP)==APP
    return artifact

def main():
    plan_path,output=sys.argv[1:];plan=json.loads(Path(plan_path).read_bytes())
    assert os.environ.get('GITHUB_ACTIONS')=='true','Only the isolated read-only CI download step may fetch canonical packages'
    root=Path(output);root.mkdir(parents=True,exist_ok=False)
    repo='OpenAEC-Foundation/open-office-studio'
    def api(endpoint):return json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/{endpoint}']))
    run=api(f'actions/runs/{RUN}');commit=api(f'git/commits/{APP}');job=api(f'actions/jobs/{JOB}')
    listing=api(f'actions/runs/{RUN}/artifacts?per_page=100');assert listing['total_count']<=100
    artifact=metadata(plan,run,commit,job,listing['artifacts'])
    archive=root/'canonical-linux.zip'
    with archive.open('xb') as stream:subprocess.run(['gh','api',f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"],stdout=stream,check=True)
    archive_sha=sha(archive);assert artifact['digest']=='sha256:'+archive_sha,'Actual canonical ZIP digest differs from GitHub metadata'
    packages=[];ancillary=[];destination=root/'packages';destination.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        entries=bundle.infolist();names=[e.filename for e in entries]
        (root/'archive-entries.json').write_text(json.dumps(names,indent=2)+'\n',encoding='utf-8')
        assert len(entries)==len(set(names)) and len(entries)<10000
        for entry in entries:
            path=PurePosixPath(entry.filename)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename
            assert not stat.S_ISLNK(entry.external_attr>>16)
            if entry.is_dir():continue
            # As in the existing reviewed canonical installer classifier, only
            # direct installer-root files are packages. The desktop upload glob
            # can also capture nested helper .exe files from an AppDir. They
            # remain whole-ZIP hash-bound data and are NEVER extracted/executed.
            if len(path.parts)!=2 or path.parts[0] not in ('deb','appimage','nsis','dmg'):
                ancillary.append(entry.filename);continue
            assert path.parts[0] in ('deb','appimage'),f'Unexpected other-platform installer: {entry.filename}'
            assert '2026.48.1' in path.name
            kind='deb' if path.parts[0]=='deb' else 'appimage'
            assert path.suffix==('.deb' if kind=='deb' else '.AppImage') and entry.file_size<2*1024**3
            target=destination/entry.filename;target.parent.mkdir(exist_ok=True)
            with bundle.open(entry) as source,target.open('xb') as out:shutil.copyfileobj(source,out,1024*1024)
            packages.append(dict(path=entry.filename,kind=kind,sha256=sha(target),bytes=target.stat().st_size))
    assert sorted(p['kind'] for p in packages)==['appimage','deb']
    packages.sort(key=lambda p:p['kind'])
    frozen={**plan,'frozen':True,'artifact':dict(name=artifact['name'],id=artifact['id'],archiveSha256=archive_sha,packages=packages),
            'binding':'Root-approved P2 source/run + successful own Linux package checks + official immutable artifact ZIP digest; inner hashes derived after verifying that ZIP. Not a release/native approval.'}
    receipt=dict(applicationCommit=APP,applicationTree=TREE,desktopRun=RUN,platform='Linux',artifactId=artifact['id'],archiveSha256=archive_sha,packages=packages,ancillaryNotExtracted=ancillary,
                 upstreamRunStatus=run['status'],upstreamRunConclusion=run['conclusion'],linuxJobStatus=job['status'],linuxJobConclusion=job['conclusion'])
    for name,value in [('candidate.json',frozen),('verified.json',receipt),('source-run.json',run),('source-job.json',job),('artifact-metadata.json',artifact)]:
        (root/name).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(source=APP,platform='Linux',packages=packages,archiveSha256=archive_sha,otherPlatformWait=False)))

if __name__=='__main__':main()
