"""Bevestig in de echte kandidaat dat de bestaande font-API minder werk krijgt."""
from pathlib import Path
import os,subprocess,json
from voorbereiden import REPO,ROOT,UIT,sha
from broncontrole import controleer
controleer();m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
uit=UIT/'tijdlijn';uit.mkdir(exist_ok=False)
template=REPO/'native/onderzoek/writer-desktopcache/meten.py';meting=REPO/'native/onderzoek/writer-wachtrijmeting/meting.js';s=template.read_text().replace('REPO = Path(__file__).resolve().parents[3]',f'REPO = Path({str(REPO)!r})')
a='            begin = time.monotonic()\n';assert s.count(a)==1;s=s.replace(a,'            await p.ev('+repr(meting.read_text()+'\nwindow._wachtrijmeting=plaatsWachtrijmeting(window,zoekEigenInvoerrij(window),api().getEditorRef().getYrsSession());true')+')\n'+a)
a="            r['invoer_en_inspectie_ms'] =";assert s.count(a)==1;s=s.replace(a,"            r['wachtrijmeting'] = await p.ev('_wachtrijmeting.stop()')\n"+a)
helper=uit/'fysieke-proef.py';helper.write_text(s)
tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--zonder-profiel','--programma',str(exe),'--versie','2026.45.51','--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(uit/'gui')]
with (uit/'meten.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(uit/'manifest.json').write_text(json.dumps({'code':p.returncode,'opdracht':cmd,'programma_sha256':sha(exe),'helper_sha256':sha(helper),'observator_sha256':sha(meting),'template_sha256':sha(template)},indent=2)+'\n');print(p.returncode,flush=True);raise SystemExit(p.returncode)
