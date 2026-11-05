"""Verklaar de fysieke uitkomst met de bestaande optionele begrensde invoermeting."""
from pathlib import Path
import os,json,subprocess,time,hashlib
from voorbereiden import REPO,LOKAAL
m=json.loads((LOKAAL/'gebouwd.json').read_text());uit=LOKAAL/'fasen';uit.mkdir(exist_ok=False)
script=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/meet-invoerfasen49.py';python=REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'
tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
env=os.environ.copy();env['OFFICE_MEET_LEZERS']='1';env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH'];resultaten=[]
for naam,programma,versie in [('referentie',REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting','2026.45.49'),('cache',Path(m['programma']),'2026.45.50')]:
    cmd=[str(python),str(script),'--zonder-profiel','--programma',str(programma),'--versie',versie,'--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(uit/naam)]
    print('START',naam,flush=True);begin=time.monotonic()
    with (uit/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    resultaten.append({'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'script_sha256':hashlib.sha256(script.read_bytes()).hexdigest()});(uit/'rapport.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
