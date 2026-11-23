"""Shared Suite transfer verifier; never downloads the canonical parent or starts an app."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import zipfile

spec=importlib.util.spec_from_file_location('producer',Path(__file__).with_name('prepare-linux-release-input-p5.py'))
producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--descriptor',type=Path,required=True);parser.add_argument('--zip',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();assert os.name=='posix' and os.environ.get('GITHUB_ACTIONS')=='true'
    raw=args.descriptor.read_bytes();d=json.loads(raw);p=d['parent'];a=d['artifact'];package=d['package']
    assert d['schemaVersion']==1 and d['executionApproved'] is True and d['signatureBinding']['publicationAuthorized'] is False
    assert (p['sourceCommit'],p['sourceTree'],p['appVersion'],p['run'],p['job'],p['attempt'],p['jobConclusion'])==(producer.SOURCE,producer.TREE,'2026.48.1',45177730188,137703365848,1,'success')
    run=producer.api('actions/runs/45177730188');job=producer.api('actions/jobs/137703365848')
    canonical,=[x for x in producer.api('actions/runs/45177730188/artifacts?per_page=100')['artifacts'] if x['name']=='uitgave-Linux' and not x['expired']]
    archive=p['installerArchive'];assert (archive['id'],archive['name'],archive['sha256'],archive['bytes'])==(canonical['id'],canonical['name'],canonical['digest'].removeprefix('sha256:'),canonical['size_in_bytes'])
    pin=dict(purpose='P5-frozen-candidate',sourceCommit=producer.SOURCE,sourceTree=producer.TREE,version='2026.48.1',run=p['run'],job=p['job'],attempt=1,artifact=dict(id=archive['id'],name=archive['name'],digest='sha256:'+archive['sha256'],bytes=archive['bytes'],createdAt=canonical['created_at'],updatedAt=canonical['updated_at']),window=dict(jobStartedAt=job['started_at'],jobCompletedAt=job['completed_at']))
    producer.verify_intake(pin,run,job,canonical)
    transfer=producer.api(f'actions/artifacts/{a["id"]}')
    assert (transfer['name'],transfer['workflow_run']['id'],transfer['workflow_run']['head_sha'],transfer['digest'],transfer['size_in_bytes'])==(a['name'],a['run'],d['qaPin']['producerCommit'],'sha256:'+a['zipSha256'],a['zipBytes']) and not transfer['expired']
    assert args.zip.stat().st_size==a['zipBytes'] and producer.digest(args.zip)==a['zipSha256']
    report_name=PurePosixPath(p['packageReportMember']).name
    expected={package['member'],report_name,'descriptor.json',*[s['path'] for s in d['signatureBinding']['members']]}
    assert not args.out.exists();args.out.mkdir(parents=True)
    with zipfile.ZipFile(args.zip) as z:
        names=z.namelist();assert len(names)==len(set(names)) and set(names)==expected
        assert all(PurePosixPath(n).parent==PurePosixPath('.') and '\\' not in n and not n.startswith('.') for n in names)
        for name in names:
            with z.open(name) as src,(args.out/name).open('wb') as dst:shutil.copyfileobj(src,dst)
    embedded=json.loads((args.out/'descriptor.json').read_text())
    for key in ['parent','package','qaPin','signatureBinding']:assert embedded[key]==d[key]
    assert (embedded['artifact']['run'],embedded['artifact']['name'])==(a['run'],a['name'])
    installer=args.out/package['member'];assert installer.stat().st_size==package['bytes'] and producer.digest(installer)==package['sha256']
    report=args.out/report_name;assert producer.digest(report)==p['packageReportSha256']
    control=json.loads(report.read_text());assert control['programma']=='open-office-studio' and control['versie']=='2026.48.1'
    original,=[x for x in control['pakketten'] if x['naam']==PurePosixPath(p['packageMember']).name]
    assert (original['sha256'],original['bytes'])==(package['sha256'],package['bytes'])
    for signature in d['signatureBinding']['members']:
        path=args.out/signature['path'];assert path.stat().st_size==signature['bytes'] and producer.digest(path)==signature['sha256']
    actual_elf=producer.inspect_suite_elf(installer);assert actual_elf==package['payloadElf']
    if package['kind']=='deb':
        fields={key:producer.subprocess.check_output(['dpkg-deb','--field',str(installer),key],text=True).strip() for key in ['Package','Version','Architecture','Depends']}
        assert fields==package['control']
    else:assert package['kind']=='appimage' and package['control'] is None
    receipt=dict(status='verified-original-Suite-input-only',descriptorSha256=hashlib.sha256(raw).hexdigest(),parent=p,artifact=a,qaPin=d['qaPin'],package=package,actualPayloadElf=actual_elf,nativeAcceptanceClaim=False,signatureCertifiedByThisVerifier=False,canonicalParentDownloadedByThisVerifier=False)
    (args.out/'verified-input.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt))

if __name__=='__main__':main()
