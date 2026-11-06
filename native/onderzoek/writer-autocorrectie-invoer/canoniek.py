"""Dezelfde actuele canonieke fontproef op referentie en kandidaat; geen appherbouw."""
from pathlib import Path
import json,os,subprocess,time
from voorbereiden import REPO,UIT,sha
m=json.loads((UIT/'gebouwd.json').read_text());script=REPO/'scripts/test-writer-lang-native.py';env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
resultaten=[]
for naam,exe,versie in [('canoniek-ref',REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting','2026.45.49'),('canoniek-invoer',Path(m['programma']),'2026.45.52')]:
    assert sha(exe)==('e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'if naam=='canoniek-ref'else m['programma_sha256']);assert not (UIT/naam).exists()
    cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(script),'--programma',str(exe),'--versie',versie,'--uitvoer',str(UIT/naam),'--verwacht-rust-tekst','--verwacht-incrementele-bron','--verwacht-worker-layout','--verwacht-worker-lettertypen','--lettertypebewijs','--verwacht-native-base64','--framebasis'];print('START',naam,flush=True);begin=time.monotonic()
    with (UIT/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    resultaten.append({'naam':naam,'code':p.returncode,'programma_sha256':sha(exe),'script_sha256':sha(script),'js_sha256':sha(REPO/'scripts/gui/lettertype_bewijs.js'),'opdracht':cmd,'seconden':time.monotonic()-begin});(UIT/'canoniek.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
