"""Verify existing release-build bytes and prepare signatures; never publish.

One verified parent ZIP is retained at a time. All payloads are hashed from
the archive; only the current Linux package is extracted for OpenPGP signing.
The output contains receipts/signatures/reports, never duplicate installers.
"""
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

REPO = 'OpenAEC-Foundation/open-office-studio'
KEY = '13F6D414ADEE4ED4CD09AC60601D86C93C504D29'
FORMS = {'Windows': ['x64-setup.exe'], 'macOS': ['aarch64.dmg'], 'Linux': ['amd64.deb', 'amd64.AppImage']}
P5_SOURCE = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
P5_TREE = 'e30879fd772871e690847c061ef66e6b81808a05'
P5_RUN = 45177730188
MAC_RUN = 45195055147
MAC_HEAD = '2af94cdcefa3e88e4980b631d16a88d7d7de5ae8'
MAC_JOB = 137763371873
MAC_REF = 'refs/heads/codex/p5-macos-only-producer-20261123'
MAC_WITNESS = '.local/macos-only-producer-source.json'
SOURCE_GATE = 'Exacte P5-appbron en afzonderlijke producerhead bewijzen'
RUNTIME_GATES = ('Meet- en inhoudscontrole voor de meegeleverde runtime',
    'Standaardinstaller controleren met uitsluitend de private runtime')


def producer_spec(request, platform, binding):
    """Legacy requests stay unchanged; the only different-head exception is frozen P5 Mac."""
    if 'producerRun' not in binding and 'producerCommit' not in binding:
        return request['run'], request['source'], False
    check(type(binding.get('producerRun')) is int and isinstance(binding.get('producerCommit'), str), 'Explicit producer run and commit required together')
    check((request['source'], request['tree'], request['version'], request['run']) == (P5_SOURCE, P5_TREE, '2026.48.1', P5_RUN), 'Separate producers require the exact frozen P5 application')
    run_id, head = binding['producerRun'], binding['producerCommit']
    if (run_id, head) == (P5_RUN, P5_SOURCE):
        check(platform != 'macOS', 'New P5 Mac declaration must use its explicit Mac-only producer')
        check(binding['runAttempt'] == 1 and binding['jobId'] == {'Windows':137703365803, 'Linux':137703365848}[platform], 'Original P5 platform job/attempt differs')
        return run_id, head, False
    check(platform == 'macOS' and (run_id, head, binding['runAttempt'], binding['jobId']) == (MAC_RUN, MAC_HEAD, 1, MAC_JOB), 'Unapproved separate platform producer')
    digest = binding.get('sourceWitnessSha256')
    check(isinstance(digest, str) and len(digest) == 64 and all(c in '0123456789abcdef' for c in digest), 'Frozen Mac source witness digest required')
    return run_id, head, True


def validate_producer_origin(producer, run_id, head, separate_mac):
    check(producer['id'] == run_id and producer['head_sha'] == head and producer['head_repository']['full_name'] == REPO, 'Producer source/repository mismatch')
    check(producer['path'] == '.github/workflows/release.yml', 'Expected existing release build workflow')
    if separate_mac:
        check(producer['event'] == 'workflow_dispatch' and producer['head_branch'] == MAC_REF.removeprefix('refs/heads/'), 'Mac-only producer event/ref differs')


def validate_mac_witness(raw, binding):
    check(0 < len(raw) < 65536 and hashlib.sha256(raw).hexdigest() == binding['sourceWitnessSha256'], 'Mac source witness bytes/digest differ')
    witness = json.loads(raw)
    expected = dict(appHead=P5_SOURCE, appTree=P5_TREE, appVersion='2026.48.1', producerHead=MAC_HEAD,
        producerWorkflowHead=MAC_HEAD, producerRef=MAC_REF, producerWorkflowRef=f'{REPO}/.github/workflows/release.yml@{MAC_REF}',
        event='workflow_dispatch', runId=str(MAC_RUN), attempt='1', job='bouwen',
        checkoutWorkflowSha256='620e90485493163b87163a8763ffbbfcc2f0af5f03251b592af577721c5a9c64',
        publiceren='false', nativeAccepted=False, scope='Build-only producer/source binding; no native operation or publication')
    check(witness == expected and witness.get('nativeAccepted') is False, 'Mac source witness application/producer/run/attempt fields differ')
    return {'member':MAC_WITNESS, 'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw), 'witness':witness}


def read_mac_witness(z, members, binding):
    name = PurePosixPath(MAC_WITNESS).name
    check(name in members and members[name].filename == MAC_WITNESS, 'Required original Mac source witness missing or misplaced')
    check(members[name].file_size < 65536, 'Mac source witness too large')
    return validate_mac_witness(z.read(members[name]), binding)


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sha_file(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}']))


def archive_members(z):
    result = {}
    for info in z.infolist():
        raw_name = info.orig_filename
        p = PurePosixPath(raw_name)
        check(not p.is_absolute() and '..' not in p.parts and '\\' not in raw_name and not any(':' in part for part in p.parts), 'Unsafe ZIP path')
        check(not stat.S_ISLNK(info.external_attr >> 16), 'ZIP symlinks are forbidden')
        if info.is_dir():
            continue
        name = p.name.replace(' ', '.')
        check(name not in result, 'Duplicate canonical ZIP member name: ' + name)
        check(0 < info.file_size <= 2_000_000_000, 'Unexpected ZIP member size: ' + name)
        result[name] = info
    return result


def report_name(studio, platform):
    prefix = '' if studio['sleutel'] == 'office' else ('Database-' if studio['sleutel'] == 'database' else studio['sleutel'] + '-')
    return f'pakketcontrole-{prefix}{platform}.json'


def validate_platform_job(job, platform):
    check(job['status'] == 'completed' and job['conclusion'] == 'success', 'Platform producer job must pass: '+platform)
    check(job['name'] == 'Bouwen – '+platform, 'Unexpected platform producer job')
    required = {
        'Windows': ['Pakket bouwen (Windows, ondertekend)', 'Authenticode controleren (installer, programma en uninstaller)'],
        'macOS': ['Pakket bouwen (macOS, ondertekend en genotariseerd)', 'Handtekening en notarisatie controleren (macOS)'],
        'Linux': ['Linux-installers werkelijk uitpakken en controleren'],
    }[platform]
    required += list(RUNTIME_GATES)
    steps = {s['name']:s for s in job['steps']}
    check(all(sum(s['name'] == name for s in job['steps']) == 1 for name in required), 'Required package/signature gate missing or duplicated: '+platform)
    check(all(name in steps and steps[name]['status']=='completed' and steps[name]['conclusion']=='success' for name in required), 'Required package/signature gate did not pass: '+platform)
    return [steps[name] for name in required]


def validate_artifact_binding(producer, binding, job, artifact, platform, extra_gates=()):
    gates = validate_platform_job(job, platform)
    for name in extra_gates:
        matches = [s for s in job['steps'] if s['name'] == name]
        check(len(matches) == 1 and matches[0]['status'] == 'completed' and matches[0]['conclusion'] == 'success', 'Required Mac source/signing gate did not pass: '+name)
        gates.append(matches[0])
    attempt = binding['runAttempt']
    check(type(attempt) is int and 1 <= attempt <= producer['run_attempt'], 'Invalid explicit producer attempt')
    check(job['run_id'] == producer['id'] and job['run_attempt'] == attempt and job['head_sha'] == producer['head_sha'], 'Job producer/attempt/source mismatch')
    check(artifact['workflow_run']['id'] == producer['id'] and artifact['workflow_run']['head_sha'] == producer['head_sha'], 'Artifact producer/source mismatch')
    stamp = lambda value: datetime.fromisoformat(value.replace('Z', '+00:00'))
    created, started, ended = map(stamp, (artifact['created_at'], job['started_at'], job['completed_at']))
    check(started <= created <= ended, 'Artifact is outside the selected producer job window')
    check(max(stamp(gate['completed_at']) for gate in gates) <= created, 'Artifact predates required package/signature verification')


def stop_gpg_agents(homes):
    outcomes = []
    for home in homes:
        result = subprocess.run(['gpgconf','--homedir',str(home),'--kill','gpg-agent'],check=False,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        outcomes.append({'temporaryHomeRole':home.name,'terminationReturnCode':result.returncode,'stderr':result.stderr.decode(errors='replace')[:2000]})
    check(all(item['terminationReturnCode'] == 0 for item in outcomes), 'Scoped GPG-agent termination could not be confirmed: '+json.dumps(outcomes))
    return outcomes


def validate_report(report, studio, platform, version, installers):
    check(report['versie'] == version and report['programma'] == studio['programma'], 'Report app/version mismatch')
    check(report['platform'] == platform.lower(), 'Report platform mismatch')
    check(len(report['pakketten']) == len(FORMS[platform]), 'Report package count mismatch')
    names = set()
    for package in report['pakketten']:
        name = package['naam'].replace(' ', '.')
        expected = {f"{studio['naam'].replace(' ', '.')}_{version}_{suffix}" for suffix in FORMS[platform]}
        check(name in expected and name not in names, 'Report unexpected/duplicate package')
        names.add(name)
        actual = installers[name]
        check(package['sha256'] == actual['sha256'] and package['bytes'] == actual['bytes'], 'Report actual-byte hash/size mismatch')


def run(request_path, app_path, output_path):
    request = json.loads(request_path.read_text(encoding='utf-8-sig'))
    check(request.get('frozen') is True and request.get('publication') is False, 'An explicit frozen, nonpublishing request is required')
    source, tree, version, run_id = [request[k] for k in ('source', 'tree', 'version', 'run')]
    check(len(source) == 40 and len(tree) == 40 and all(c in '0123456789abcdef' for c in source + tree), 'Full source/tree identities required')
    check(subprocess.check_output(['git', '-C', str(app_path), 'rev-parse', 'HEAD'], text=True).strip() == source, 'Actual checkout differs from candidate')
    check(subprocess.check_output(['git', '-C', str(app_path), 'rev-parse', 'HEAD^{tree}'], text=True).strip() == tree, 'Actual checkout tree differs')
    check(json.loads((app_path/'package.json').read_text())['version'] == version, 'Actual source version differs')
    studios = json.loads((app_path/'assets/studios.json').read_text())
    check(len(studios) == 7 and len({s['identifier'] for s in studios}) == 7, 'Seven distinct studio products required')
    # This candidate has no configured updater. Do not silently discard extra
    # updater payloads if a later source enables them: its manifest needs review.
    config = json.loads((app_path/'src-tauri/tauri.conf.json').read_text())
    check(config['bundle']['createUpdaterArtifacts'] is False and not config['plugins']['updater']['pubkey'], 'Updater-enabled candidate requires explicit additional manifest coverage')
    original_attempts = {b['runAttempt'] for b in request['platforms'].values() if b.get('producerRun', run_id) == run_id}
    check(len(original_attempts) == 1, 'One explicit original producer attempt required')
    original_attempt = original_attempts.pop()
    producer = api(f'actions/runs/{run_id}/attempts/{original_attempt}')
    validate_producer_origin(producer, run_id, source, False)
    check(set(request['platforms']) == set(FORMS), 'All three platform artifact bindings required')
    producers, artifacts_by_run, jobs_by_attempt, selected = {(run_id, original_attempt):producer}, {}, {}, {}
    for platform, binding in request['platforms'].items():
        platform_run, platform_head, separate_mac = producer_spec(request, platform, binding)
        attempt = binding['runAttempt']
        producer_key = (platform_run, attempt)
        if producer_key not in producers:
            producers[producer_key] = api(f'actions/runs/{platform_run}/attempts/{attempt}')
        platform_producer = producers[producer_key]
        validate_producer_origin(platform_producer, platform_run, platform_head, separate_mac)
        if platform_run not in artifacts_by_run:
            artifacts_by_run[platform_run] = {a['id']:a for a in api(f'actions/runs/{platform_run}/artifacts?per_page=100')['artifacts']}
        check(type(attempt) is int and attempt == platform_producer['run_attempt'], 'Invalid explicit producer attempt')
        key = (platform_run, attempt)
        if key not in jobs_by_attempt:
            jobs_by_attempt[key] = {j['id']:j for j in api(f'actions/runs/{platform_run}/attempts/{attempt}/jobs?per_page=100')['jobs']}
        job, artifact = jobs_by_attempt[key][binding['jobId']], artifacts_by_run[platform_run][binding['artifactId']]
        validate_artifact_binding(platform_producer, binding, job, artifact, platform, (SOURCE_GATE, 'Ondertekening beschikbaar') if separate_mac else ())
        check(artifact['name'] == 'uitgave-'+platform and not artifact['expired'], 'Unexpected/expired platform artifact')
        check(artifact['digest'] == 'sha256:'+binding['archiveSha256'], 'Expected archive binding differs from API')
        selected[platform] = job, artifact, platform_producer, separate_mac
    original_mac_failure = None
    if selected['macOS'][3]:
        old = jobs_by_attempt[(P5_RUN, 1)][137703365843]
        check((old['run_id'], old['run_attempt'], old['head_sha'], old['status'], old['conclusion']) == (P5_RUN, 1, P5_SOURCE, 'completed', 'failure'), 'Original failed P5 Mac job identity/status must be retained')
        original_mac_failure = {'run':P5_RUN, 'attempt':1, 'job':old['id'], 'source':old['head_sha'], 'status':old['status'], 'conclusion':old['conclusion'], 'completedAt':old['completed_at'], 'steps':old['steps']}
    check(not output_path.exists(), 'Output directory must be fresh')
    output_path.mkdir(parents=True)
    checksums, installers, reports, archives, linux_signatures = {}, {}, [], [], []
    private_key = os.environ.pop('OPENAEC_GPG_PRIVATE_KEY', '')
    passphrase = os.environ.pop('OPENAEC_GPG_PASSPHRASE', '')
    check(bool(private_key), 'OpenAEC signing key unavailable')
    with tempfile.TemporaryDirectory(prefix='oos-candidate-') as temporary:
        temporary = Path(temporary)
        signing_home, verify_home = temporary/'signing', temporary/'public-only'
        signing_home.mkdir(mode=0o700)
        verify_home.mkdir(mode=0o700)
        archive = temporary/'parent.zip'
        def download(platform):
            artifact = selected[platform][1]
            check(shutil.disk_usage(temporary).free > artifact['size_in_bytes']+2_500_000_000, 'Insufficient space for one verified archive and one package')
            with archive.open('xb') as f:
                subprocess.run(['gh','api',f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"],stdout=f,check=True)
            check(archive.stat().st_size == artifact['size_in_bytes'] and sha_file(archive) == request['platforms'][platform]['archiveSha256'], 'Downloaded parent archive size/digest mismatch')
        mac_witness = None
        if selected['macOS'][3]:
            # Inspect the required exception witness BEFORE importing any key.
            # Keep this one archive and consume it first; no duplicate download.
            download('macOS')
            with zipfile.ZipFile(archive) as z:
                mac_witness = read_mac_witness(z, archive_members(z), request['platforms']['macOS'])
        def gpg(home, *args, data=None):
            return subprocess.run(['gpg', '--homedir', str(home), '--batch', *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
        def verify(signature, payload):
            status = gpg(verify_home, '--status-fd', '1', '--verify', str(signature), str(payload)).decode()
            valid = [line.split() for line in status.splitlines() if line.startswith('[GNUPG:] VALIDSIG ')]
            check(len(valid) == 1 and KEY in (valid[0][2], valid[0][-1]), 'Signature primary fingerprint differs')
        def sign(payload, signature):
            gpg(signing_home, '--yes', '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--local-user', KEY, '--armor', '--output', str(signature), '--detach-sign', str(payload), data=passphrase.encode())
            verify(signature, payload)
        try:
            gpg(signing_home, '--import', data=private_key.encode())
            del private_key
            public_key = output_path/'openaec-signing-public-key.asc'
            public_key.write_bytes(gpg(signing_home, '--armor', '--export', KEY))
            check(public_key.stat().st_size > 0, 'Expected signing key absent')
            gpg(verify_home, '--import', data=public_key.read_bytes())
            (output_path/'openaec-signing-fingerprint.txt').write_text(KEY+'\n')
            for platform in (('macOS', 'Windows', 'Linux') if mac_witness else ('Windows', 'macOS', 'Linux')):
                binding = request['platforms'][platform]
                job, artifact, platform_producer, separate_mac = selected[platform]
                if not (platform == 'macOS' and mac_witness):
                    download(platform)
                with zipfile.ZipFile(archive) as z:
                    members = archive_members(z)
                    expected = {f"{s['naam'].replace(' ', '.')}_{version}_{suffix}" for s in studios for suffix in FORMS[platform]}
                    expected_reports = {report_name(s,platform) for s in studios} if platform != 'macOS' else set()
                    extra = {PurePosixPath(MAC_WITNESS).name} if separate_mac else set()
                    check(set(members) == expected | expected_reports | extra, 'Missing or unexpected platform archive members: '+platform)
                    if separate_mac:
                        check(read_mac_witness(z, members, binding) == mac_witness, 'Mac source witness changed after preflight')
                    for name in sorted(expected):
                        info = members[name]
                        check(info.file_size > 1_000_000, 'Installer incomplete: '+name)
                        h, count = hashlib.sha256(), 0
                        package = temporary/'current-package'
                        with z.open(info) as src:
                            with package.open('wb') if platform == 'Linux' else open(os.devnull,'wb') as dest:
                                while chunk := src.read(1024*1024):
                                    h.update(chunk); count += len(chunk)
                                    if platform == 'Linux': dest.write(chunk)
                        check(count == info.file_size, 'Installer length differs')
                        checksums[name] = h.hexdigest()
                        installers[name] = {'sha256':h.hexdigest(),'bytes':count,'platform':platform,'artifactId':artifact['id'],'member':info.filename}
                        if platform == 'Linux':
                            signature = output_path/(name+'.asc')
                            sign(package, signature)
                            linux_signatures.append({'name':signature.name,'payload':name,'primaryFingerprint':KEY,'publicOnlyVerification':True})
                            package.unlink()
                    for studio in studios if platform != 'macOS' else []:
                        name = report_name(studio,platform)
                        check(members[name].file_size < 2_000_000, 'Unexpected report size')
                        raw = z.read(members[name])
                        validate_report(json.loads(raw.decode('utf-8-sig')),studio,platform,version,installers)
                        canonical = name.replace('pakketcontrole-', 'package-verification-').replace('Database-', 'database-')
                        (output_path/canonical).write_bytes(raw)
                        reports.append({'name':canonical,'platform':platform,'studio':studio['sleutel'],'artifactId':artifact['id'],'member':members[name].filename})
                archives.append({'platform':platform,'producerRun':platform_producer['id'],'producerCommit':platform_producer['head_sha'],'producerSelectedAttemptAtAudit':platform_producer['run_attempt'],'producerConclusionAtAudit':platform_producer['conclusion'],'producerAttempt':binding['runAttempt'],'producerJobId':job['id'],'producerJobStartedAt':job['started_at'],'producerJobCompletedAt':job['completed_at'],'producerAttemptEndpoint':f"actions/runs/{platform_producer['id']}/attempts/{binding['runAttempt']}",'verifiedProducerSteps':job['steps'],'artifactId':artifact['id'],'artifactCreatedAt':artifact['created_at'],'archiveSha256':binding['archiveSha256'],'applicationSourceWitness':mac_witness if separate_mac else None})
                archive.unlink()
            check(len(installers)==28 and len(reports)==14 and len(linux_signatures)==14, 'Incomplete release set')
            for p in output_path.iterdir():
                checksums[p.name] = sha_file(p)
            sums = output_path/'SHA256SUMS'
            check(len(checksums) == 58, 'Expected 28 installers + 14 reports + 14 signatures + two public-key files')
            sums.write_text(''.join(f'{digest}  {name}\n' for name,digest in sorted(checksums.items())))
            sign(sums, output_path/'SHA256SUMS.asc')
        finally:
            cleanup = stop_gpg_agents((signing_home,verify_home))
    check(not temporary.exists(), 'Temporary signing-key/payload tree remains')
    receipt = {'kind':'Verified existing installer bytes and prepared signatures; NOT published/native acceptance', 'source':source,'tree':tree,'version':version,'producerRun':run_id,'producerSelectedAttemptAtAudit':producer['run_attempt'],'producerSelectedConclusionAtAudit':producer['conclusion'],'archives':archives,'installers':installers,'reports':reports,'linuxSignatures':linux_signatures,'releasePayloadChecksums':checksums,'cleanup':{'scopedGpgconfTermination':cleanup,'temporaryKeyAndPayloadTreeRemoved':True,'scopeLimit':'Scoped termination command outcomes and private-directory removal; no global process-inventory claim.'},'publication':False,'mainOrTagWrite':False,'nativeAcceptance':False}
    receipt['originalMacFailure'] = original_mac_failure
    (output_path/'verification-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'verifiedInstallers':28,'verifiedReports':14,'signedLinuxPackages':14,'publication':False}))


if __name__ == '__main__':
    run(*map(Path, sys.argv[1:4]))
