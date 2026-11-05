"""Voer alle bestaande kernproeven ongewijzigd uit, plus de cacheboekhouding."""
from pathlib import Path
import json
import os
import subprocess
import shutil
import time
from voorbereiden import bereid,LOKAAL,REFERENTIE
bereid()
uit=LOKAAL/'regressies';uit.mkdir(exist_ok=False)
env=os.environ.copy();env['PATH']=str(Path.home()/'.cargo/bin')+':'+env['PATH']
referentiedoel=LOKAAL/'referentie-target'
if not referentiedoel.exists():shutil.copytree(REFERENTIE/'.local/target',referentiedoel)
r={'schema':1,'geslaagd':False,'varianten':{}}
try:
    for naam,manifest,target,aantal in [
        ('referentie',REFERENTIE/'.local/gemeten/Cargo.toml',referentiedoel,28),
        ('replicacache',LOKAAL/'gemeten/Cargo.toml',LOKAAL/'target',29),
    ]:
        env['CARGO_TARGET_DIR']=str(target);begin=time.monotonic()
        with (uit/(naam+'.log')).open('w')as log:
            p=subprocess.run(['cargo','test','--release','--locked','--manifest-path',str(manifest),'-p','office-writer-plakken','--lib'],env=env,stdout=log,stderr=subprocess.STDOUT)
        tekst=(uit/(naam+'.log')).read_text()
        goed=p.returncode==0 and f'{aantal} passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'in tekst
        r['varianten'][naam]={'code':p.returncode,'seconden':time.monotonic()-begin,'verwacht':aantal,'volledig_ongefilterd_geslaagd':goed}
        print(naam,r['varianten'][naam],flush=True)
        if not goed:raise RuntimeError('Onvolledige of afgekeurde kernregressies: '+naam)
    r['geslaagd']=True
except Exception as e:r['fout']=repr(e)
finally:(uit/'rapport.json').write_text(json.dumps(r,indent=2)+'\n')
if not r['geslaagd']:raise SystemExit(1)
