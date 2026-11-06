"""Voeg echte correcties toe aan de ongewijzigde vertraagde selectie-/bewaarproef."""
from pathlib import Path
import json,os,subprocess,sys
from voorbereiden import REPO,UIT,sha
from broncontrole import controleer
referentie=sys.argv[1:]==['--referentie'];batch=sys.argv[1:]==['--batch'];assert not sys.argv[1:] or referentie or batch
controleer();m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
versie='2026.45.52';naam='correctie-batch' if batch else 'correctie'
if referentie:
    exe=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';versie='2026.45.49';naam='correctie-ref';assert sha(exe)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
template=REPO/'scripts/test-writer-rust-tekst-native.py';s=template.read_text().replace('REPO = Path(__file__).resolve().parents[1]',f'REPO = Path({str(REPO)!r})')
a='                await p.begin_foutbewaking()';assert s.count(a)==1
b='''                await p.begin_foutbewaking()
                # Geen flush voor de correctie: echte toetsen en natuurlijke rust.
                await p.ev("window._correctieVoor=api().getEditorRef().getYrsSession().paragraphs('body').map(p=>p.text).join('');api().focus();true")
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+End'], check=True)
                for invoer,verwacht in [(' TWee ', ' Twee '), ('. volgende ', '. Volgende ')]:
                    subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', invoer], check=True)
                    await p.run("let eind=performance.now()+30000;while(api().getEditorRef().getYrsSession().paragraphs('body').map(p=>p.text).join('')!==_correctieVoor+"+json.dumps(verwacht)+"){if(performance.now()>eind)throw Error('Autocorrectie niet zichtbaar');await new Promise(r=>setTimeout(r,50))}window._correctieVoor+="+json.dumps(verwacht)+";return true;", t=35)
                    r['stappen'].append('Autocorrectie met echte toetsen: '+invoer+' → '+verwacht)
                beeld('autocorrectie-zonder-flush')'''
if batch:
    oud="[(' TWee ', ' Twee '), ('. volgende ', '. Volgende ')]"
    nieuw="[(' TWee HOofdletters ', ' Twee Hoofdletters '), (' eigelijk HOofdletters ', ' eigenlijk Hoofdletters '), (' HOofdletters eigelijk ', ' Hoofdletters eigenlijk ')]"
    assert b.count(oud)==1;b=b.replace(oud,nieuw)
s=s.replace(a,b);helper=UIT/(naam+'proef.py');assert not helper.exists();helper.write_text(s)
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--programma',str(exe),'--versie',versie,'--uitvoer',str(UIT/naam)]
with (UIT/(naam+'.log')).open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/(naam+'.json')).write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'script_sha256':sha(helper),'template_sha256':sha(template),'opdracht':cmd},indent=2)+'\n');print('Correctieproef',p.returncode,flush=True);raise SystemExit(p.returncode)
