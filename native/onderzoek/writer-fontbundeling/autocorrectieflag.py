"""Isoleer één eigen profielvoorkeur op de ongewijzigde referentie; geen featurefix."""
from pathlib import Path
import os,subprocess,json,hashlib
from voorbereiden import REPO,UIT,sha
uit=UIT/'autocorrectie-uit';uit.mkdir(exist_ok=False)
template=REPO/'native/onderzoek/writer-desktopcache/meten.py';s=template.read_text().replace('REPO = Path(__file__).resolve().parents[3]',f'REPO = Path({str(REPO)!r})')
a="{'taal': 'en', 'thema': 'forge', 'updates':";b="{'taal': 'en', 'thema': 'forge', 'spelling': {'autocorrectie': False}, 'updates':";assert s.count(a)==1;s=s.replace(a,b)
helper=uit/'fysieke-proef.py';helper.write_text(s)
exe=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';assert sha(exe)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--zonder-profiel','--programma',str(exe),'--versie','2026.45.49','--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(uit/'gui')]
with (uit/'proef.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(uit/'manifest.json').write_text(json.dumps({'code':p.returncode,'opdracht':cmd,'programma_sha256':sha(exe),'helper_sha256':sha(helper),'template_sha256':sha(template),'grens':'Eén voorkeur uitsluitend in eigen XDG-testprofiel uitgeschakeld; diagnose, geen appfix of behoud van autocorrectie bewezen.'},indent=2)+'\n');print(p.returncode,flush=True);raise SystemExit(p.returncode)
