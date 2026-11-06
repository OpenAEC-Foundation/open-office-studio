"""Maak een bronvaste frontendkandidaat; geen productiebron of oude target wijzigen."""
from pathlib import Path
import hashlib,json,subprocess,tarfile,io,shutil,shlex
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/fontbundeling';COMMIT='8e34482d9650174c1883d63a72a0e6d4ca3a9bb9'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def vervang(s,a,b):
    if s.count(a)!=1:raise RuntimeError('Bronanker gewijzigd: '+a[:80])
    return s.replace(a,b,1)
def patch(s,poort):
    s=vervang(s,'cr=useCallback(ce=>{','cr=useCallback(ce=>{'+poort+'\n')
    a='dn===void 0?ne.current?.(n$1,We):null'
    b='dn===void 0?(!Ft(n$1)&&Z(n$1)?.holdsWorkerState()!==true&&B.current?.canSyncHostUpdates?.(n$1)===true?(()=>{let openaecVersie=dt();return openaecLaatsteHostFont(K,n$1,()=>Ce===K.current&&Re.current===n$1&&dt()===openaecVersie,()=>ne.current?.(n$1,We))})():ne.current?.(n$1,We)):null'
    return vervang(s,a,b)
def main():
    UIT.mkdir(parents=True,exist_ok=False);bron=UIT/'bron'
    data=subprocess.run(['git','archive',COMMIT],cwd=REPO,check=True,capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(data))as t:t.extractall(bron,filter='data')
    modules=bron/'node_modules';modules.mkdir()
    # Deel alleen ongewijzigde afhankelijkheden. De ene gewijzigde package is een eigen kopie.
    for p in (REPO/'node_modules').iterdir():
        if p.name=='@betteroffice'or p.name.startswith('.vite')or p.name=='.cache':continue
        (modules/p.name).symlink_to(p.resolve(),target_is_directory=p.is_dir())
    scope=modules/'@betteroffice';scope.mkdir()
    for p in (REPO/'node_modules/@betteroffice').iterdir():
        if p.name=='docx-react':shutil.copytree(p.resolve(),scope/p.name,symlinks=True)
        else:(scope/p.name).symlink_to(p.resolve(),target_is_directory=p.is_dir())
    oud=REPO/'node_modules/@betteroffice/docx-react/dist/index.mjs';nieuw=scope/'docx-react/dist/index.mjs'
    assert sha(oud)==sha(nieuw)
    (nieuw.parent.parent/'node_modules').symlink_to(oud.resolve().parents[3],target_is_directory=True)
    poort=(ROOT/'poort.js').read_text();nieuw.write_text(patch(nieuw.read_text(),poort))
    # Gebruik dezelfde weekversieroute, uitsluitend binnen de kandidaatkopie.
    node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    subprocess.run([str(node),'scripts/weekversie.mjs','2026-11-06','51'],cwd=bron,check=True)
    p=bron/'src-tauri/tauri.conf.json';m=json.loads(p.read_text());m['build']['beforeBuildCommand']='python3 '+shlex.quote(str(ROOT/'voorbouw.py'));p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    p=bron/'vite.config.ts';p.write_text(vervang(p.read_text(),'exclude: [...configDefaults.exclude, ".claude/**", ".local/**"],','// Afzonderlijke Node-/Python-onderzoeksproeven hebben hun eigen runner.\n    exclude: [...configDefaults.exclude, ".claude/**", ".local/**", "native/onderzoek/**"],'))
    # Vite/Vitest hebben de cwd van de kandidaat nodig; gedeelde bin-symlinks blijven uitvoerbaar.
    m={'commit':COMMIT,'sdk_referentie_sha256':sha(oud),'sdk_kandidaat_sha256':sha(nieuw),'poort_sha256':sha(ROOT/'poort.js'),'bestanden':{n:sha(bron/n)for n in ['vite.config.ts', 'package.json', 'versie.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'apps/database-studio/src-tauri/tauri.conf.json', 'apps/database-studio/src-tauri/Cargo.toml', 'apps/database-studio/src-tauri/Cargo.lock']}}
    (UIT/'bronnen.json').write_text(json.dumps(m,indent=2)+'\n');print('Afzonderlijke fontkandidaat voorbereid.',flush=True)
if __name__=='__main__':main()
