"""One user-approved DERIVED Suite build; never dispatches another job."""
from pathlib import Path
import argparse,json,os,platform,shutil,subprocess,sys
from contract import *
from ops import Commands,verify_bundle,mount_package,remove_owned,seal_index


def main():
    parser=argparse.ArgumentParser();parser.add_argument('approval');parser.add_argument('app');parser.add_argument('out');args=parser.parse_args()
    a=json.loads(Path(args.approval).read_bytes());root=Path(os.environ['PRODUCER_ROOT']).resolve()
    p=validate_approval(a,'build',root,os.environ)
    require(sys.platform=='darwin' and platform.machine()=='arm64','Ordinary ARM64 Mac required')
    app=Path(args.app).resolve();validate_source(app,p)
    out=Path(args.out).resolve();out.mkdir(exist_ok=False)
    commands=Commands(out/'commands')
    require(not any(k.startswith('APPLE_') for k in os.environ),'Signing secrets must not reach dependency/compiler steps')
    for args in (['node','--version'],['pnpm','--version'],['rustc','--version'],['cargo','--version'],['sw_vers']):commands.run(args,timeout=20)
    commands.run(['node','scripts/haal-lettertypen.mjs'],cwd=app,timeout=600)
    commands.run(['node','scripts/haal-woordenboeken.mjs'],cwd=app,timeout=600)
    commands.run(['node','scripts/voorbereiden-kantoorruntime.mjs'],cwd=app,timeout=1800)
    commands.run(['node','scripts/kopieer-assets.mjs'],cwd=app,timeout=300)
    commands.run(['pnpm','exec','tsc','--noEmit'],cwd=app,timeout=600)
    for features in ([],['--features','qa-save-trace']):
        commands.run(['cargo','check','--manifest-path','src-tauri/Cargo.toml','--locked','--no-default-features',*features],cwd=app,timeout=1200)
    write_json(out/'compile-success.json',{'featureOff':True,'featureOn':True,'typescriptNoEmit':True,'appCommit':p['appCommit']})
    return 0


def package(approval,app,out):
    a=json.loads(Path(approval).read_bytes());root=Path(os.environ['PRODUCER_ROOT']).resolve();p=validate_approval(a,'build',root,os.environ)
    require(sys.platform=='darwin' and platform.machine()=='arm64','Ordinary ARM64 Mac required')
    app=Path(app).resolve();out=Path(out).resolve();commands=Commands(out/'package-commands')
    require(json.loads((out/'compile-success.json').read_bytes())=={'featureOff':True,'featureOn':True,'typescriptNoEmit':True,'appCommit':p['appCommit']},'Actual compiler gates missing')
    env=dict(os.environ,VITE_OOS_QA_SAVE_TRACE='DERIVED_P5_SYNTHETIC_ONLY')
    for key in ('TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD'):env.pop(key,None)
    for key in ('APPLE_CERTIFICATE','APPLE_CERTIFICATE_PASSWORD','APPLE_SIGNING_IDENTITY','APPLE_API_ISSUER','APPLE_API_KEY','APPLE_API_KEY_CONTENT','APPLE_TEAM_ID'):
        require(bool(env.get(key)),'Required Apple signing secret missing: '+key)
    temp=Path(os.environ['RUNNER_TEMP']).resolve();own=under(temp/('mac-save-signing-'+a['nonce']),temp);own.mkdir(exist_ok=False)
    write_json(own/'owner.json',{'nonce':a['nonce'],'scopeSha256':SCOPE_SHA,'producerCommit':a['producerCommit']})
    key=own/'apple-api-key.p8'
    try:
        key.write_bytes(env.pop('APPLE_API_KEY_CONTENT').encode());key.chmod(0o600)
        env['APPLE_API_KEY_PATH']=str(key)
        commands.run(['pnpm','desktop:build','--bundles','dmg','--features','qa-save-trace','--config',str(app/p['overlayPath'])],cwd=app,env=env,timeout=4800)
    finally:
        remove_owned(own,temp)


def verify(approval,app,out):
    a=json.loads(Path(approval).read_bytes());root=Path(os.environ['PRODUCER_ROOT']).resolve();p=validate_approval(a,'build',root,os.environ)
    require(sys.platform=='darwin' and platform.machine()=='arm64','Ordinary ARM64 Mac required')
    out=Path(out).resolve();commands=Commands(out/'verify-commands');app=Path(app).resolve()
    dmgs=list((app/'src-tauri/target/release/bundle/dmg').glob('*.dmg'));require(len(dmgs)==1,'Exactly one research DMG required')
    dmg=dmgs[0];temp=Path(os.environ['RUNNER_TEMP']).resolve();own=under(temp/('mac-save-verify-'+a['nonce']),temp);own.mkdir(exist_ok=False);mount=None
    write_json(own/'owner.json',{'nonce':a['nonce'],'scopeSha256':SCOPE_SHA,'producerCommit':a['producerCommit']})
    try:
        mount=mount_package(dmg,own,commands);apps=list(mount.glob('*.app'));require(len(apps)==1,'Exactly one app in DMG')
        identity,_=verify_bundle(apps[0],commands)
        packageout=out/'package';packageout.mkdir(exist_ok=False)
        shutil.copyfile(dmg,packageout/'research.dmg')
        witness={'derived':True,'baseCommit':BASE,'baseTree':BASE_TREE,'baseVersion':'2026.48.1',
            'appCommit':p['appCommit'],'appTree':p['appTree'],'patchSha256':p['patchSha256'],'overlaySha256':p['overlaySha256'],
            'producerCommit':a['producerCommit'],'producerTree':a['producerTree'],'workflowSha256':a['workflowSha256'],
            'filesManifestSha256':a['filesManifestSha256'],'runId':int(os.environ['GITHUB_RUN_ID']),'attempt':1,'job':'build',
            'requestSha256':sha(Path(approval).read_bytes()),'nonce':a['nonce'],'identifier':QA_ID,'version':QA_VERSION,
            'dmgSha256':digest(packageout/'research.dmg'),'dmgBytes':dmg.stat().st_size,'bundle':identity,'nativeAccepted':False}
        write_json(packageout/'witness.json',witness)
    finally:
        commands.deadline=None
        if mount:
            row,_,_=commands.run(['hdiutil','detach',mount],check=False,timeout=90)
            require(row['exitCode']==0,'Own build DMG mount cleanup failed');mount=None
        remove_owned(own,temp)


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1] in ('package','verify'):
        mode=sys.argv.pop(1);globals()[mode](*sys.argv[1:])
    else:raise SystemExit(main())
