"""Bestaande fysieke proef met uitsluitend extra transportmetadata; geen snelheidsacceptatie."""
from pathlib import Path
import hashlib,json,os,subprocess
REPO=Path(__file__).resolve().parents[3]
ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/bronhergebruik'

def main():
    UIT.mkdir(parents=True,exist_ok=False)
    template=REPO/'native/onderzoek/writer-desktopcache/meten.py'
    js=(ROOT/'transport.js').read_text()
    s=template.read_text().replace('REPO = Path(__file__).resolve().parents[3]',f'REPO = Path({str(REPO)!r})')
    anker='            begin = time.monotonic()\n'
    assert s.count(anker)==1
    s=s.replace(anker,'            await p.ev('+repr(js+'\nwindow._bronmeting=plaatsBronmeting(window);true')+')\n'+anker)
    anker="            r['invoer_en_inspectie_ms'] ="
    assert s.count(anker)==1
    s=s.replace(anker,"            r['bronhergebruik'] = await p.ev('(()=>{const r=_bronmeting.lees();_bronmeting.stop();return r})()')\n"+anker)
    helper=UIT/'fysieke-proef.py';helper.write_text(s)
    tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
    env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
    oud=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting'
    nieuw=REPO/'.local/doorwerk-2026-11-05/desktopcache/afgekeurd/open-office-studio-45.50-cache'
    manifest={'template_sha256':hashlib.sha256(template.read_bytes()).hexdigest(),'transport_sha256':hashlib.sha256(js.encode()).hexdigest(),'helper_sha256':hashlib.sha256(helper.read_bytes()).hexdigest(),'ronden':[]}
    for naam,exe,versie,digest in [('referentie',oud,'2026.45.49','e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'),('afgekeurde-cache',nieuw,'2026.45.50','49da87a4df5ff2f209a583aaf92963cd0a9863055c5b21de68408adff0b1f611')]:
        assert hashlib.sha256(exe.read_bytes()).hexdigest()==digest
        cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--zonder-profiel','--programma',str(exe),'--versie',versie,'--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(UIT/naam)]
        print('START',naam,flush=True)
        with (UIT/(naam+'.log')).open('w') as log:r=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
        manifest['ronden'].append({'naam':naam,'code':r.returncode,'programma_sha256':digest,'opdracht':cmd})
        (UIT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print('EINDE',naam,r.returncode,flush=True)
        if r.returncode:raise SystemExit(r.returncode)
if __name__=='__main__':main()
