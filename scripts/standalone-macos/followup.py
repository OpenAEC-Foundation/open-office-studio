"""Source-bound Spreadsheet addon routing; never promote a reused core into host acceptance."""
import json,subprocess,zipfile
from pathlib import Path
from contracts import P5_APP_SOURCE,digest,verify_source_witness_record

BASELINE={
    'run':45351696628,'qaCommit':'03477b0199daeb50ae7b20d552b111630c3271ce',
    'artifact':14902855598,'name':'standalone-native-spreadsheet-03477b0199daeb50ae7b20d552b111630c3271ce',
    'archiveSHA256':'faee1109a0741c686e81c8c111cfcd23f69bb13f40dcc31fcb342137934939b4',
    'archiveBytes':15464799,'member':'spreadsheet/core-receipt.json',
    'sha256':'1c9be0c276c4a3a8a1de15eb4afad4c1842f8ba68dc9c6b8d89e7cd125dd4591'}
CORE_FLAGS=('identityVerified','installedSignatureGatesVerified','suiteAbsent','freshProfileVerified',
    'ownCwdEnvironmentVerified','nativeFocusVerified','nativeSaveVerified','outputOraclePassed',
    'fullQuitVerified','newPidReopenVerified','ownConverterChildObserved','functionalCaseCompleted')


def validate_followup(q):
    route=q.get('spreadsheetFollowup')
    if route is None:return False
    if (not isinstance(route,dict) or set(route) not in ({'formats','coreBaseline'},{'formats','coreBaseline','readback'})
            or route['coreBaseline']!=BASELINE or q.get('source')!=P5_APP_SOURCE or q.get('executeApps')!=['spreadsheet']):
        raise ValueError('Only the exact P5 Spreadsheet child and functional baseline may route addons')
    if 'readback' in route:
        from readback import READBACK
        if route['readback']!=READBACK or route['formats']!=['xlsb'] or q.get('reuseTransfersFromRun')!=READBACK['run']:
            raise ValueError('Only the frozen previously saved XLSB output may enter readback-only mode')
    elif q.get('reuseTransfersFromRun')!=BASELINE['run']:
        raise ValueError('Exact original functional-core transfer run required')
    formats=route['formats']
    if (not isinstance(formats,list) or not formats
            or any(not isinstance(f,str) or f not in ('gnm','gnumeric','xlsb') for f in formats)
            or len(set(formats))!=len(formats)):
        raise ValueError('Only unique explicitly requested Spreadsheet addons allowed')
    return True


def matrix(q):
    if validate_followup(q):return {'app':['spreadsheet'],'format':q['spreadsheetFollowup']['formats']}
    from contracts import APPS
    return {'app':q.get('executeApps',list(APPS))}


def load_baseline(q,proof,folder):
    if not validate_followup(q):raise ValueError('Supplemental baseline not authorized')
    path=Path(folder)/'core-baseline.json'
    if path.is_symlink() or digest(path)!=BASELINE['sha256']:raise ValueError('Frozen original core receipt bytes differ')
    core=json.loads(path.read_text(encoding='utf-8'))
    if (core.get('app')!='spreadsheet' or core.get('source')!=q['source'] or core.get('failure')
            or any(core.get(k) is not True for k in CORE_FLAGS)
            or core.get('provenance',{}).get('parentArtifact')!=q['parentArtifact']
            or core['provenance'].get('package')!=proof.get('package')):
        raise ValueError('Functional baseline source/parent/actual DMG or core results differ')
    verify_source_witness_record(q,core['provenance'])
    return {'source':core['source'],'sha256':BASELINE['sha256'],'qaRun':BASELINE['run'],
        'functionalCorePreviouslyVerified':True,'originalHostFinalCleanupVerified':False,
        'scope':'Reused ordinary functional core only; every addon host must perform its own native preflight and cleanup.'}


def prepare_baseline(q,output,api):
    if not validate_followup(q):return
    existing=Path(output)/'spreadsheet/core-baseline.json'
    if existing.is_file():
        proof=json.loads((existing.parent/'provenance.json').read_text());load_baseline(q,proof,existing.parent)
        return  # The selected child already contains the exact authenticated baseline.
    meta=api('/actions/artifacts/'+str(BASELINE['artifact']))
    if (meta.get('id')!=BASELINE['artifact'] or meta.get('name')!=BASELINE['name'] or meta.get('expired') is not False
            or meta.get('digest')!='sha256:'+BASELINE['archiveSHA256'] or meta.get('size_in_bytes')!=BASELINE['archiveBytes']
            or meta.get('workflow_run',{}).get('id')!=BASELINE['run']
            or meta['workflow_run'].get('head_sha')!=BASELINE['qaCommit']):
        raise ValueError('Official original partial-proof artifact identity/hash differs')
    archive=Path(output).parent/'frozen-spreadsheet-core-proof.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh','api','repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/'+str(BASELINE['artifact'])+'/zip'],stdout=stream,check=True)
    if archive.stat().st_size!=BASELINE['archiveBytes'] or digest(archive)!=BASELINE['archiveSHA256']:
        raise ValueError('Original core-proof archive bytes differ')
    folder=Path(output)/'spreadsheet'
    with zipfile.ZipFile(archive) as z:
        if z.namelist().count(BASELINE['member'])!=1:raise ValueError('One original core receipt required')
        entry=z.getinfo(BASELINE['member'])
        if entry.is_dir() or (entry.external_attr>>16)&0o170000==0o120000 or not 0<entry.file_size<=131072:
            raise ValueError('Core receipt must be a bounded original regular member')
        (folder/'core-baseline.json').write_bytes(z.read(entry))
    proof=json.loads((folder/'provenance.json').read_text());binding=load_baseline(q,proof,folder)
    (folder/'baseline-binding.json').write_text(json.dumps({'binding':binding,'officialArtifact':meta},indent=2)+'\n')
