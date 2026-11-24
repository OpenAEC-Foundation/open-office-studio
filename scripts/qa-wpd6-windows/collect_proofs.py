"""Collect small official QA artifacts; recheck saved bytes, never infer visual pass."""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import zipfile
from intake import APPS, APP, TREE, RUN, JOB, digest, write
from oracle import inspect


def collect(gh, repo, run, target, cache=None):
    def api(endpoint):
        return json.loads(subprocess.check_output([gh, 'api', f'repos/{repo}/{endpoint}']))
    metadata = api(f'actions/runs/{run}')
    jobs = api(f'actions/runs/{run}/jobs?per_page=100')['jobs']
    artifacts = api(f'actions/runs/{run}/artifacts?per_page=100')['artifacts']
    target.mkdir(parents=True, exist_ok=False)
    write(target/'run.json', metadata)
    write(target/'jobs.json', jobs)
    write(target/'artifacts.json', artifacts)
    fetched = {}
    for artifact in artifacts:
        name = artifact['name']
        if name not in ('standalone-windows-p5-binding','wpd6-windows-binding','standalone-windows-p5-spreadsheet-xlsb377-proof','standalone-windows-p5-presentation-canvas-proof','standalone-windows-p5-writer-wpd6-proof') and name not in [f'standalone-windows-p5-{app}-proof' for app in APPS]:
            continue
        assert name not in fetched and not artifact['expired']
        assert artifact['workflow_run']['id'] == run
        assert artifact['workflow_run']['head_sha'] == metadata['head_sha']
        assert re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest', ''))
        assert 0 < artifact['size_in_bytes'] < 100*1024**2, 'Only small QA evidence, no installer transfers'
        archive = target/(name+'.zip')
        cached=cache/(name+'.zip') if cache else None
        if cached and cached.exists() and cached.stat().st_size==artifact['size_in_bytes'] and digest(cached)==artifact['digest'].removeprefix('sha256:'):
            shutil.copyfile(cached,archive)
        else:
            with archive.open('xb') as stream:
                subprocess.run([gh, 'api', f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"], stdout=stream, check=True)
        assert archive.stat().st_size == artifact['size_in_bytes']
        assert digest(archive) == artifact['digest'].removeprefix('sha256:')
        directory = target/name
        directory.mkdir()
        with zipfile.ZipFile(archive) as z:
            entries = z.infolist()
            assert len(entries) == len({e.filename for e in entries}) < 10000
            assert sum(e.file_size for e in entries) < 500*1024**2
            for entry in entries:
                path = PurePosixPath(entry.filename)
                assert not path.is_absolute() and '..' not in path.parts
                assert '\\' not in entry.filename and ':' not in entry.filename
                assert not stat.S_ISLNK(entry.external_attr >> 16)
                assert path.suffix.lower() not in ('.exe', '.dll', '.msi'), 'Evidence artifact must not contain product binaries'
            z.extractall(directory)
        fetched[name] = directory
    return metadata, jobs, fetched


def exactly(root, relative):
    found = [p for p in root.rglob(Path(relative).name) if p.as_posix().endswith('/'+relative)]
    assert len(found) == 1, (relative, found)
    return found[0]


def audit(run, metadata, jobs, fetched, target):
    reuse='wpd6-windows-binding' in fetched
    owner=fetched['wpd6-windows-binding' if reuse else 'standalone-windows-p5-binding']
    binding = json.loads(exactly(owner, 'binding.json').read_bytes())
    requested=set(APPS)
    requested377=False
    canvas_requested=False
    if reuse:
        reuse_plan=json.loads(exactly(owner,'reuse-plan.json').read_bytes())
        config=reuse_plan['config']
        assert (config['preparerRun'],config['preparerHarness'])==(45195780472,'f88a805beb152d42a22806d135d9af1c912aedcb')
        archive=exactly(owner,'standalone-windows-p5-binding.zip')
        assert digest(archive)==config['bindingSha256']=='c6ee34b5bec7cd1368331bb02a182bbfb23d55bc70d68c78dee28c366b489d22'
        parent_meta=json.loads(exactly(owner,'standalone-windows-p5-binding-metadata.json').read_bytes())
        assert parent_meta['id']==config['bindingArtifact']==14828032444
        assert parent_meta['workflow_run']['id']==config['preparerRun'] and parent_meta['workflow_run']['head_sha']==config['preparerHarness']
        assert parent_meta['digest']=='sha256:'+digest(archive) and archive.stat().st_size==parent_meta['size_in_bytes']
        with zipfile.ZipFile(archive) as z:assert json.loads(z.read('binding.json'))==binding
        requested={case['app'] for case in reuse_plan['matrix'] if case['mode'] in ('core','presentation-canvas','wpd6')}
        canvas_requested=any(case['mode']=='presentation-canvas' for case in reuse_plan['matrix'])
        assert not canvas_requested or all(case['app']=='presentation' and case['mode']=='presentation-canvas' for case in reuse_plan['matrix'])
        requested377=any(case['mode']=='xlsb377' for case in reuse_plan['matrix'])
        assert requested.issubset({'writer','presentation','email','notition','database'})
        assert binding['preparerRun']==config['preparerRun'] and binding['preparerHarness']==config['preparerHarness']
    else:
        assert binding['preparerRun'] == run and binding['preparerHarness'] == metadata['head_sha']
    assert (binding['applicationCommit'], binding['applicationTree']) == (APP, TREE)
    assert (binding['artifactRun'], binding['platformJobId'], binding['sourceAttempt']) == (RUN, JOB, 1)
    result = dict(source=APP, tree=TREE, version='2026.48.1', preparerRun=binding['preparerRun'], executionRun=run, executionHarness=metadata['head_sha'], apps={})
    for app in APPS:
        if app not in requested:
            result['apps'][app]=dict(status='not-tested-in-this-execution',reference='Retain original accepted core; no pass inferred from this reuse run')
            continue
        mode='wpd6' if app=='writer' and reuse else ('presentation-canvas' if canvas_requested and app=='presentation' else 'core')
        name = f'standalone-windows-p5-{app}-'+('wpd6-proof' if mode=='wpd6' else 'canvas-proof' if mode=='presentation-canvas' else 'proof')
        own_jobs = [j for j in jobs if j['name'] == (f'Native {app} {mode} child reuse' if reuse else f'Native {app} Windows app-only')]
        entry = dict(visualAcceptance='pending actual completed screenshot review', job=own_jobs)
        result['apps'][app] = entry
        if name not in fetched:
            entry['status'] = 'missing-proof'
            continue
        root = fetched[name]
        reports = list(root.rglob(f'p4-native-{app}/report.json'))
        if len(reports) != 1:
            entry['status'] = 'missing-native-report'
            continue
        report_path = reports[0]
        proof = report_path.parent
        report = json.loads(report_path.read_bytes())
        entry['nativeStatus'] = report['status']
        if report['status'] != 'passed-scoped-native-function':
            entry.update(status='native-failure-preserved', error=report.get('error'))
            continue
        try:
            assert len(own_jobs) == 1 and own_jobs[0]['conclusion'] == 'success'
            receipt_path = exactly(root, 'standalone-windows-package/package.json')
            augmented = binding['products'][app]
            assert digest(receipt_path) == augmented['packageReceiptSha256']
            receipt = json.loads(receipt_path.read_bytes())
            assert receipt == {k:v for k,v in augmented.items() if k not in ('childArtifact','packageReceiptSha256')}
            package_report = exactly(root, 'standalone-windows-package/canonical-package-report.json')
            assert digest(package_report) == receipt['canonicalPackageReport']['sha256']
            assert package_report.stat().st_size == receipt['canonicalPackageReport']['bytes']
            consumed = json.loads(exactly(root, 'standalone-windows-package/consumer-binding.json').read_bytes())
            assert consumed['status'] == 'strict-own-child-zip-nsis-report-source-receipt-verified'
            assert consumed['childArtifact']['id'] == augmented['childArtifact']['id']
            assert consumed['childArtifact']['digest'] == augmented['childArtifact']['digest']
            assert consumed['receiptSha256'] == augmented['packageReceiptSha256']
            assert report['package'] == receipt
            assert report['harnessCommit']==metadata['head_sha']
            assert (report['applicationCommit'], report['applicationTree'], report['version']) == (APP, TREE, '2026.48.1')
            assert report['payloadEqualsInstalled'] is True
            executable = report['executable']
            payload = receipt['application']['payloadExecutable']
            assert (executable['sha256'], executable['bytes']) == (payload['sha256'], payload['bytes'])
            assert executable['productVersion'] == '2026.48.1'
            for identity in (executable, report['installer']):
                assert identity['signature'] == 'Valid' and identity['timestampSigner']
            assert all(report['baseline'][key] == [] for key in ('profiles','apps','suitePaths'))
            assert report['afterNative']['apps'] == [] and report['afterNative']['suitePaths'] == []
            assert all(p.replace('\\','/').split('/')[-1] == receipt['application']['identifier'] for p in report['afterNative']['profiles'])
            phases = report['phases']
            assert [p['phase'] for p in phases] == ['initial','reopened']
            assert phases[0]['pid'] != phases[1]['pid']
            for phase in phases:
                assert phase['status'] == 'passed-scoped-function'
                assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
                assert phase['nativeMetadata']['identifier'] == receipt['application']['identifier']
                assert phase['nativeMetadata']['version'] == '2026.48.1'
                if app == 'database':
                    identity = phase['nativeMetadata']['osIdentity']
                    assert identity['identifier'] == receipt['application']['identifier'] and identity['shortcuts']
                    assert all(link['identifier'] == identity['identifier'] and link['canonicalTarget'].lower() == phase['executableCanonicalPath'].lower() for link in identity['shortcuts'])
                assert phase['ownWebviewProfile']['createdByNativeWebview'] and phase['ownWebviewProfile']['entries']
                for suffix in ('ready','completed'):
                    assert (proof/(phase['phase']+'-'+suffix+'.png')).stat().st_size > 0
                if app in ('writer','spreadsheet','presentation','email'):
                    assert phase['runtime']['bron'] == 'meegeleverd' and phase['runtime']['profiel'] == 'veilig'
                    relative = phase['runtimeOwnInstallRelative']
                    assert relative and not relative.startswith(('..','\\','/')) and ':' not in relative
            cleanup = report['cleanup']
            assert not any(k.endswith('Error') for k in cleanup)
            assert not cleanup.get('forcedOwnedProcessTree') and cleanup['residualOwnedWebviews'] == []
            assert all(cleanup[k] for k in ('policyRestored','ownedInstallUninstalled','ownedAppExited','ownedNativeProfilesDisposed','ownedTemporaryProfileDisposed'))
            oracles = []
            ext = {'writer':'docx','spreadsheet':'xlsx','presentation':'pptx','notition':'openaec-notities'}.get(app)
            if ext:
                oracles = [inspect(app, proof/(phase+'.'+ext)) for phase in ('initial','reopened')]
            elif app == 'email':
                assert cleanup['loopbackServerClosed']
                oracles = [inspect('email', proof/'mail')]
            else:
                oracles = [inspect('database', exactly(proof/'fixtures', 'Standalone23.sqlite'))]
            if report['originalInput']:
                assert report['originalInput']['unchanged']
                original_name = report['originalInput']['path'].replace('\\','/').split('/')[-1]
                assert digest(exactly(proof/('wpd6-source' if mode=='wpd6' else 'fixtures'), original_name)) == report['originalInput']['sha256']
            if mode=='presentation-canvas':
                assert report['caseMode']==mode
                for phase in ('initial','reopened'):
                    guards=[s for s in report['steps'] if s.get('phase')==phase and 'canvasFocusBeforeGuard' in s]
                    assert len(guards)==1 and guards[0]['canvasFocusBeforeGuard']['documentHasFocus']
                    active=guards[0]['canvasFocusBeforeGuard']['activeElementChain'][0]
                    assert active['role']=='application' and active['tag']=='DIV' and active['connected']
                    readbacks=[s for s in report['steps'] if s.get('phase')==phase and 'canvasReadback' in s]
                    assert len(readbacks)==1 and readbacks[0]['noOutlineMutation']
                    assert readbacks[0]['canvasReadback'].endswith(' STANDALONE23 PRESENTATION EDIT')
                    for suffix in ('after-keys','readback'):assert (proof/f'canvas-{phase}-{suffix}.png').stat().st_size>0
                entry['caseMode']=mode
            if mode=='wpd6':
                assert report['caseMode']=='wpd6'
                assert report['originalInput']['sha256']=='d5fde49f38d0dd73c65c0d19cb132defcc037dc09c8c405a2dfbaba457d65150'
                assert report['originalInput']['bytes']=='3587' and int(report['originalInput']['inode'])>0
                opens=[s for s in report['steps'] if s.get('action')=='OpenDialog']
                assert len(opens)==1 and opens[0]['status']=='passed' and opens[0]['nativeOpenInvoked'] and opens[0]['pathReadbackMatches']
                assert opens[0]['target']==report['originalInput']['path'] and opens[0]['target'].endswith('source.wpd')
                import importlib.util
                spec=importlib.util.spec_from_file_location('wpd6_qualified',Path(__file__).parent/'source-oracle/oracle.py')
                source_reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(source_reader)
                qualified=source_reader.native((proof/'wpd6-source/source.wpd').read_bytes())
                assert qualified==json.loads((proof/'wpd6-source/source-oracle.json').read_bytes())
                assert qualified['header']['major']==2 and qualified['header']['minor']==1
                assert qualified['expected']['texts']==['Foo','foo']
                assert qualified['expected']['headerTexts']==['Header Type A','Header Type A but changed']
                entry['actualOriginalWpdPickerTarget']=opens[0]['target']
                entry['independentNativeHeader']=qualified['header']
                entry['originalQualifiedBodyAndHeaders']=qualified['expected']
                oracles += [inspect('writer',proof/(name+'.docx')) for name in ('imported','edited','undo')]
                entry['scope']='Native WPD6:Two body text segments, hard return/page boundary and active Header A only, edit/UndoRedo/native DOCXsave/newPID; not full format'
            entry.update(status='independently-rechecked-functional-only', savedByteOracles=oracles)
        except Exception as error:
            entry.update(status='proof-audit-failed', error=repr(error))
    supplement_name='standalone-windows-p5-spreadsheet-xlsb377-proof'
    if supplement_name in fetched:
        assert not reuse or requested377
        result['xlsb377']=audit377(fetched[supplement_name],binding,metadata,jobs)
    elif reuse and requested377:
        result['xlsb377']=dict(status='missing-proof')
    elif reuse:
        result['xlsb377']=dict(status='not-tested-in-this-execution',reference='Retain separately accepted supplement; no new pass inferred')
    write(target/'independent-audit.json', result)
    return result


def audit377(root,binding,metadata,jobs):
    entry=dict(status='proof-audit-failed',visualAcceptance='pending actual proposal/cancel screenshots review')
    proof=exactly(root,'p5-xlsb377/report.json').parent
    report=json.loads((proof/'report.json').read_bytes());entry['nativeStatus']=report['status']
    if report['status']!='passed-native-xlsb377-cancel-save':
        entry.update(status='native-failure-preserved',error=report.get('error'));return entry
    try:
        own=[j for j in jobs if j['name']=='Native spreadsheet xlsb377 child reuse']
        assert len(own)==1 and own[0]['conclusion']=='success'
        receipt_path=exactly(root,'standalone-windows-package/package.json')
        product=binding['products']['spreadsheet'];receipt=json.loads(receipt_path.read_bytes())
        assert digest(receipt_path)==product['packageReceiptSha256']
        assert receipt=={k:v for k,v in product.items() if k not in ('childArtifact','packageReceiptSha256')}
        assert report['package']==receipt and report['harnessCommit']==metadata['head_sha']
        assert (report['applicationCommit'],report['applicationTree'],report['version'])==(APP,TREE,'2026.48.1')
        raw_report=exactly(root,'standalone-windows-package/canonical-package-report.json')
        assert digest(raw_report)==receipt['canonicalPackageReport']['sha256'] and raw_report.stat().st_size==receipt['canonicalPackageReport']['bytes']
        consumed=json.loads(exactly(root,'standalone-windows-package/consumer-binding.json').read_bytes())
        assert consumed['status']=='strict-own-child-zip-nsis-report-source-receipt-verified'
        assert consumed['childArtifact']['id']==product['childArtifact']['id'] and consumed['childArtifact']['digest']==product['childArtifact']['digest']
        assert report['payloadEqualsInstalled'] and (report['executable']['sha256'],report['executable']['bytes'])==(receipt['application']['payloadExecutable']['sha256'],receipt['application']['payloadExecutable']['bytes'])
        for identity in (report['installer'],report['executable']):assert identity['signature']=='Valid' and identity['timestampSigner']
        assert report['executable']['productVersion']=='2026.48.1'
        assert all(report['baseline'][k]==[] for k in ('profiles','apps','suitePaths'))
        assert report['afterNative']['apps']==[] and report['afterNative']['suitePaths']==[]
        assert all(p.replace('\\','/').split('/')[-1]=='org.openaec.spreadsheet-studio' for p in report['afterNative']['profiles'])
        assert len(report['phases'])==1
        phase=report['phases'][0]
        assert phase['phase']=='xlsb377' and phase['status']=='passed-short-cancel-save-check' and phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
        assert phase['nativeMetadata']['identifier']=='org.openaec.spreadsheet-studio' and phase['nativeMetadata']['version']=='2026.48.1'
        assert phase['ownWebviewProfile']['createdByNativeWebview'] and phase['ownWebviewProfile']['entries']
        assert phase['runtime']['bron']=='meegeleverd' and phase['runtime']['profiel']=='veilig'
        relative=phase['runtimeOwnInstallRelative'];assert relative and not relative.startswith(('..','\\','/')) and ':' not in relative
        cleanup=report['cleanup'];assert not any(k.endswith('Error') for k in cleanup) and not cleanup.get('forcedOwnedProcessTree') and cleanup['residualOwnedWebviews']==[]
        assert all(cleanup[k] for k in ('policyRestored','ownedInstallUninstalled','ownedAppExited','ownedNativeProfilesDisposed','ownedTemporaryProfileDisposed'))
        assert report['coreReference']==dict(run=45195780472,job=137767767878,proofArtifact=14827264661)
        original=report['originalInput'];assert original['unchanged'] and original['sha256']=='e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3' and original['bytes']=='7651' and int(original['inode'])>0
        source=proof/'shared_formula.xlsb';assert source.stat().st_size==7651 and digest(source)==original['sha256']
        with zipfile.ZipFile(source) as z:assert 'xl/workbook.bin' in z.namelist() and 'xl/workbook.xml' not in z.namelist()
        assert [case['route'] for case in report['cancelSaveChecks']]==['Control+s','ordinary-Save']
        fingerprint={k:original[k] for k in ('sha256','bytes','mtimeNs','inode','device')}
        for case in report['cancelSaveChecks']:
            assert case['proposal']=='xlsx' and case['cancelled'] and case['copyRemainsDirty'] and case['source']==fingerprint
            prefix=re.sub('[^a-z]','-',case['route'],flags=re.I)
            for suffix in ('-xlsx-proposal.png','-cancelled-dirty.png'):assert (proof/(prefix+suffix)).stat().st_size>0
        entry.update(status='independently-rechecked-cancel-save-only',sourceFingerprint=fingerprint)
    except Exception as error:entry['error']=repr(error)
    return entry


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo')
    parser.add_argument('run', type=int)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--gh', default='gh')
    parser.add_argument('--cache',type=Path,help='Reuse locally saved ZIP only when its size/hash match current official metadata')
    args = parser.parse_args()
    metadata, jobs, fetched = collect(args.gh, args.repo, args.run, args.destination,args.cache)
    result = audit(args.run, metadata, jobs, fetched, args.destination)
    print(json.dumps(dict(source=result['source'],preparerRun=result['preparerRun'],executionRun=result['executionRun'],apps={k:{f:v for f,v in a.items() if f in ('status','nativeStatus','error','visualAcceptance')} for k,a in result['apps'].items()},xlsb377=result.get('xlsb377')),indent=2))
