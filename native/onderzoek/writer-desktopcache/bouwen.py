"""Controleer en bouw uitsluitend de afzonderlijke desktopkandidaat."""
from pathlib import Path
import os,subprocess,json,time,shutil,hashlib,sys
from voorbereiden import bereid,REPO,LOKAAL
bereid();bron=LOKAAL/'bron';env=os.environ.copy()
env['PATH']=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+str(Path.home()/'.cargo/bin')+':'+env['PATH']
env['CARGO_TARGET_DIR']=str(LOKAAL/'target')
nr=1
while (LOKAAL/('controles' if nr==1 else 'controles-'+str(nr))).exists():nr+=1
uit=LOKAAL/('controles' if nr==1 else 'controles-'+str(nr));uit.mkdir();resultaten=[]
hergebruik=None
if sys.argv[1:]==['--hervat-bouwpoorten']:
    vorig=LOKAAL/'controles-3';eerder=json.loads((vorig/'rapport.json').read_text())[:5]
    assert [r['naam']for r in eerder]==['frontend','typescript','engines','opdrachten','weekversie'] and all(r['code']==0 for r in eerder)
    subprocess.run([sys.executable,str(Path(__file__).with_name('broncontrole.py'))],cwd=REPO,check=True)
    for r in eerder:
        shutil.copy2(vorig/(r['naam']+'.log'),uit/(r['naam']+'.log'));resultaten.append({**r,'hergebruikt_uit':str(vorig)})
    hergebruik={r['naam']for r in eerder}
elif sys.argv[1:]:raise RuntimeError('Onbekende hervatopdracht')
def voer(naam,cmd,cwd=bron):
    print('START',naam,flush=True);begin=time.monotonic()
    with (uit/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
    resultaten.append({'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'werkmap':str(cwd)})
    (uit/'rapport.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
for naam,cmd in [
 ('frontend',[str(bron/'node_modules/.bin/vitest'),'run']),
 ('typescript',[str(bron/'node_modules/.bin/tsc'),'--noEmit']),
 ('engines',['node','scripts/test-kantoor-engines.mjs']),
 ('opdrachten',['node','scripts/test-opdrachten.mjs']),
 ('weekversie',['node','scripts/controleer-weekversie.mjs']),
 ('rust-kern',['cargo','test','--release','--locked','--manifest-path',str(bron/'native/Cargo.toml'),'-p','office-writer-plakken','--lib']),
 ('desktop',[str(bron/'node_modules/.bin/tauri'),'build','--no-bundle']),
]:
    if hergebruik and naam in hergebruik:continue
    voer(naam,cmd)
voer('python-referenties',['python3','-m','unittest','discover','-s','tests','-v'],REPO)
p=LOKAAL/'target/release/open-office-studio';doel=LOKAAL/'open-office-studio-45.50-cache';assert not doel.exists();shutil.copy2(p,doel)
m=json.loads((LOKAAL/'bronnen.json').read_text());m.update(programma=str(doel),programma_sha256=hashlib.sha256(doel.read_bytes()).hexdigest());(LOKAAL/'gebouwd.json').write_text(json.dumps(m,indent=2)+'\n')
print('Desktopkandidaat gebouwd; nog geen GUI-acceptatie.',flush=True)
