"""Verify existing release-build bytes and prepare signatures; never publish.

One verified parent ZIP is retained at a time. All payloads are hashed from
the archive; only the current Linux package is extracted for OpenPGP signing.
The output contains receipts/signatures/reports, never duplicate installers.
"""
import hashlib
import json
import os
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
    steps = {s['name']:s for s in job['steps']}
    check(all(name in steps and steps[name]['status']=='completed' and steps[name]['conclusion']=='success' for name in required), 'Required package/signature gate did not pass: '+platform)


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
    producer = api(f'actions/runs/{run_id}')
    check(producer['head_sha'] == source and producer['head_repository']['full_name'] == REPO, 'Producer source/repository mismatch')
    check(producer['path'] == '.github/workflows/release.yml', 'Expected existing release build workflow')
    jobs = api(f'actions/runs/{run_id}/jobs?per_page=100')['jobs']
    jobs = {j['id']: j for j in jobs}
    artifacts = api(f'actions/runs/{run_id}/artifacts?per_page=100')['artifacts']
    artifacts = {a['id']: a for a in artifacts}
    check(set(request['platforms']) == set(FORMS), 'All three platform artifact bindings required')
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
            for platform in ('Windows', 'macOS', 'Linux'):
                binding = request['platforms'][platform]
                job, artifact = jobs[binding['jobId']], artifacts[binding['artifactId']]
                validate_platform_job(job, platform)
                check(artifact['name'] == 'uitgave-'+platform and not artifact['expired'], 'Unexpected/expired platform artifact')
                check(artifact['digest'] == 'sha256:'+binding['archiveSha256'], 'Expected archive binding differs from API')
                check(shutil.disk_usage(temporary).free > artifact['size_in_bytes']+2_500_000_000, 'Insufficient space for one verified archive and one package')
                archive = temporary/'parent.zip'
                with archive.open('wb') as f:
                    subprocess.run(['gh','api',f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"],stdout=f,check=True)
                check(sha_file(archive) == binding['archiveSha256'], 'Downloaded parent archive digest mismatch')
                with zipfile.ZipFile(archive) as z:
                    members = archive_members(z)
                    expected = {f"{s['naam'].replace(' ', '.')}_{version}_{suffix}" for s in studios for suffix in FORMS[platform]}
                    expected_reports = {report_name(s,platform) for s in studios} if platform != 'macOS' else set()
                    check(set(members) == expected | expected_reports, 'Missing or unexpected platform archive members: '+platform)
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
                archives.append({'platform':platform,'producerJobId':job['id'],'artifactId':artifact['id'],'archiveSha256':binding['archiveSha256']})
                archive.unlink()
            check(len(installers)==28 and len(reports)==14 and len(linux_signatures)==14, 'Incomplete release set')
            for p in output_path.iterdir():
                checksums[p.name] = sha_file(p)
            sums = output_path/'SHA256SUMS'
            check(len(checksums) == 58, 'Expected 28 installers + 14 reports + 14 signatures + two public-key files')
            sums.write_text(''.join(f'{digest}  {name}\n' for name,digest in sorted(checksums.items())))
            sign(sums, output_path/'SHA256SUMS.asc')
        finally:
            for home in (signing_home,verify_home):
                subprocess.run(['gpgconf','--homedir',str(home),'--kill','gpg-agent'],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    receipt = {'kind':'Verified existing installer bytes and prepared signatures; NOT published/native acceptance', 'source':source,'tree':tree,'version':version,'producerRun':run_id,'archives':archives,'installers':installers,'reports':reports,'linuxSignatures':linux_signatures,'releasePayloadChecksums':checksums,'publication':False,'mainOrTagWrite':False,'nativeAcceptance':False}
    (output_path/'verification-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'verifiedInstallers':28,'verifiedReports':14,'signedLinuxPackages':14,'publication':False}))


if __name__ == '__main__':
    run(*map(Path, sys.argv[1:4]))
