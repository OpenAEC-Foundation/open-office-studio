"""Fysieke Writer-proef met begrensde wachtrij-/transport-/bronmetadata."""
from pathlib import Path
import hashlib,json,os,subprocess
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/wachtrijmeting'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    UIT.mkdir(parents=True,exist_ok=False)
    template=REPO/'native/onderzoek/writer-desktopcache/meten.py';js=(ROOT/'meting.js').read_text()
    s=template.read_text().replace('REPO = Path(__file__).resolve().parents[3]',f'REPO = Path({str(REPO)!r})')
    mark='            begin = time.monotonic()\n';assert s.count(mark)==1
    s=s.replace(mark,'            await p.ev('+repr(js+'\nwindow._wachtrijmeting=plaatsWachtrijmeting(window,zoekEigenInvoerrij(window),api().getEditorRef().getYrsSession());true')+')\n'+mark)
    mark="            r['invoer_en_inspectie_ms'] =";assert s.count(mark)==1
    s=s.replace(mark,"            r['wachtrijmeting'] = await p.ev('_wachtrijmeting.stop()')\n"+mark)
    mark="                    if time.monotonic()>einde:\n";assert s.count(mark)==1
    s=s.replace(mark,"                    if pogingen == 150:\n                        r['tussenmeting'] = await p.ev('_wachtrijmeting.lees()')\n                        r['tussenfouten'] = await p.fouten()\n                        (a.uitvoer/'tussenmeting.json').write_text(json.dumps({'meting':r['tussenmeting'],'fouten':r['tussenfouten']})+'\\n')\n"+mark)
    mark="                        raise AssertionError('Getypte alinea binnen 90 seconden niet gelijk getekend')";assert s.count(mark)==1
    s=s.replace(mark,"                        r['wachtrijmeting'] = await p.ev('_wachtrijmeting.stop()')\n                        r['fouten_bij_afkeuring'] = await p.fouten()\n"+mark)
    helper=UIT/'fysieke-proef.py';helper.write_text(s)
    exe=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';assert sha(exe)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
    tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
    env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
    cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--zonder-profiel','--programma',str(exe),'--versie','2026.45.49','--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(UIT/'gui')]
    with (UIT/'meten.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    (UIT/'manifest.json').write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'template_sha256':sha(template),'helper_sha256':sha(helper),'meting_sha256':sha(ROOT/'meting.js'),'opdracht':cmd},indent=2)+'\n');print('Wachtrijproef',p.returncode,flush=True);raise SystemExit(p.returncode)
if __name__=='__main__':main()
