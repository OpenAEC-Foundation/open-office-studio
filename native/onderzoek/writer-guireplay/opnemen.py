"""Leg uitsluitend de bron en IPC van de eigen fysieke proef vast voor kernherhaling."""
from pathlib import Path
import hashlib,json,os,subprocess
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/guireplay'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    UIT.mkdir(parents=True,exist_ok=False)
    template=REPO/'native/onderzoek/writer-desktopcache/meten.py';js=(ROOT/'opnemen.js').read_text()
    s=template.read_text().replace('REPO = Path(__file__).resolve().parents[3]',f'REPO = Path({str(REPO)!r})')
    a='            begin = time.monotonic()\n';assert s.count(a)==1
    s=s.replace(a,'            await p.ev('+repr(js+'\nwindow._eigenOpname=plaatsOpname(window);true')+')\n'+a)
    a="            r['invoer_en_inspectie_ms'] =";assert s.count(a)==1
    s=s.replace(a,"            opname = await p.ev('_eigenOpname.stop()')\n            (a.uitvoer/'opname.json').write_text(json.dumps(opname,ensure_ascii=False)+'\\n')\n"+a)
    helper=UIT/'fysieke-proef.py';helper.write_text(s)
    exe=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';assert sha(exe)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
    tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
    env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
    cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--zonder-profiel','--programma',str(exe),'--versie','2026.45.49','--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(UIT/'gui')]
    with (UIT/'opnemen.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
    (UIT/'opnemen.json').write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'template_sha256':sha(template),'helper_sha256':sha(helper),'opnemer_sha256':sha(ROOT/'opnemen.js'),'opdracht':cmd},indent=2)+'\n')
    print('Opname',p.returncode,flush=True);raise SystemExit(p.returncode)
if __name__=='__main__':main()
