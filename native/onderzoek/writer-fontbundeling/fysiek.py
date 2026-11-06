"""Passieve ABBA-rasterproef op de behouden referentie en eigen fontkandidaat."""
from pathlib import Path
import os,subprocess,json,time
from voorbereiden import REPO,ROOT,UIT,sha
from broncontrole import controleer
controleer();m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
poorten=json.loads((UIT/'bouwen.json').read_text());assert len(poorten)==6 and all(x['code']==0 for x in poorten)
oud=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';assert sha(oud)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
uit=UIT/'gui';uit.mkdir(exist_ok=False)
tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH'];resultaten=[]
for naam,programma,versie in [('referentie-a',oud,'2026.45.49'),('font-a',exe,'2026.45.51'),('font-b',exe,'2026.45.51'),('referentie-b',oud,'2026.45.49')]:
    druk=[]
    for p in Path('/proc').glob('[0-9]*/comm'):
        try:
            n=p.read_text().strip()
            if n in ['cargo','rustc','rust-lld','ld.lld','cc']or n.startswith('node (vitest'):druk.append(n)
        except OSError:pass
    assert not druk,druk
    cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(REPO/'native/onderzoek/writer-desktopcache/meten.py'),'--zonder-profiel','--programma',str(programma),'--versie',versie,'--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(uit/naam)]
    print('START',naam,flush=True);begin=time.monotonic()
    with (uit/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    resultaten.append({'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'programma_sha256':sha(programma)});(uit/'rapport.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
    if p.returncode:raise SystemExit(p.returncode)
