"""Bestaande echte selectie-/bewaar-/font-DOCX-poorten op de eigen kandidaat."""
from pathlib import Path
import os,subprocess,json,time
from voorbereiden import REPO,UIT,sha
from broncontrole import controleer
controleer();m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH'];resultaten=[]
for naam,script,opties in [('selectie','test-writer-rust-tekst-native.py',[]),('lang-font','test-writer-lang-native.py',['--verwacht-rust-tekst','--verwacht-incrementele-bron','--verwacht-worker-layout','--verwacht-worker-lettertypen','--lettertypebewijs','--verwacht-native-base64','--framebasis'])]:
    assert not (UIT/naam).exists()
    cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(REPO/'scripts'/script),'--programma',str(exe),'--versie','2026.45.51','--uitvoer',str(UIT/naam),*opties];print('START',naam,flush=True);begin=time.monotonic()
    with (UIT/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    resultaten.append({'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'script_sha256':sha(REPO/'scripts'/script)});(UIT/'functioneel.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
