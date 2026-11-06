"""Getoetste frontendkopie met eigen Cargo-target; geen installatie of publicatie."""
from pathlib import Path
import os,subprocess,json,time,shutil,sys
from voorbereiden import REPO,ROOT,UIT,sha
bron=UIT/'bron';m=json.loads((UIT/'bronnen.json').read_text())
assert sha(bron/'node_modules/@betteroffice/docx-react/dist/index.mjs')==m['sdk_kandidaat_sha256']
assert sha(ROOT/'poort.js')==m['poort_sha256']
for n,h in m['bestanden'].items():assert sha(bron/n)==h
from broncontrole import controleer
controleer()
if sys.argv[1:]==['--hervat']:
    assert (UIT/'target/release').is_dir()
elif not sys.argv[1:]:
    assert not (UIT/'target').exists();(UIT/'target').mkdir()
    print('Eigen warme Cargo-cache kopiëren',flush=True)
    shutil.copytree(REPO/'src-tauri/target/release',UIT/'target/release')
else:raise RuntimeError('Onbekende bouwoptie')
env=os.environ.copy();env['PATH']=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+str(Path.home()/'.cargo/bin')+':'+env['PATH'];env['CARGO_TARGET_DIR']=str(UIT/'target')
rapport=[]
for naam,cmd in [
 ('frontend',[str(bron/'node_modules/.bin/vitest'),'run','--maxWorkers=2','--minWorkers=1']),
 ('typescript',[str(bron/'node_modules/.bin/tsc'),'--noEmit']),
 ('engines',['node','scripts/test-kantoor-engines.mjs']),
 ('opdrachten',['node','scripts/test-opdrachten.mjs']),
 ('weekversie',['node','scripts/controleer-weekversie.mjs']),
 ('desktop',[str(bron/'node_modules/.bin/tauri'),'build','--no-bundle']),
]:
    print('START',naam,flush=True);begin=time.monotonic()
    with (UIT/(naam+'.log')).open('w')as log:
        p=subprocess.Popen(cmd,cwd=bron,env=env,stdout=log,stderr=subprocess.STDOUT)
        volgend=time.monotonic()+30
        while p.poll()is None:
            time.sleep(5)
            if time.monotonic()>=volgend:print('LOOPT',naam,round(time.monotonic()-begin),'s',flush=True);volgend=time.monotonic()+30
    rapport.append({'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd});(UIT/'bouwen.json').write_text(json.dumps(rapport,indent=2)+'\n')
    print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
controleer()
exe=UIT/'open-office-studio-45.51-font';assert not exe.exists();shutil.copy2(UIT/'target/release/open-office-studio',exe)
(UIT/'gebouwd.json').write_text(json.dumps({'programma':str(exe),'programma_sha256':sha(exe),'versie':'2026.45.51','sdk_sha256':m['sdk_kandidaat_sha256'],'poort_sha256':m['poort_sha256']},indent=2)+'\n');print('Afzonderlijke kandidaat gebouwd; nog geen GUI-acceptatie.',flush=True)
