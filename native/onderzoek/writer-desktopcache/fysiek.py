"""Fysieke ABBA-invoer en gesamplede RSS; uitsluitend eigen proefprocessen."""
from pathlib import Path
import os,subprocess,json,time,hashlib
from voorbereiden import bereid,REPO,ROOT,LOKAAL

def procesboom(pid):
    todo=[pid];gezien=set();rij=[]
    while todo:
        p=todo.pop()
        if p in gezien:continue
        gezien.add(p)
        try:
            proc=Path('/proc')/str(p)
            todo += [int(n)for n in (proc/'task'/str(p)/'children').read_text().split()]
            status=dict(l.split(':',1)for l in (proc/'status').read_text().splitlines()if ':'in l)
            exe=(proc/'exe').resolve()
            rij.append({'pid':p,'naam':status['Name'].strip(),'exe':str(exe),'rss_kib':int(status.get('VmRSS','0 kB').split()[0])})
        except (OSError,ValueError):continue
    return rij

def main():
    bereid();assert json.loads((LOKAAL/'bouwacceptatie.json').read_text())['geslaagd'];m=json.loads((LOKAAL/'gebouwd.json').read_text());nieuw=Path(m['programma']);oud=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting'
    assert hashlib.sha256(nieuw.read_bytes()).hexdigest()==m['programma_sha256']
    assert hashlib.sha256(oud.read_bytes()).hexdigest()==m['referentie_sha256']
    tekst=json.loads((REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/doortypen-38-zonder-profiel/profiel.json').read_text())['invoertekst']
    uit=LOKAAL/'gui';uit.mkdir(exist_ok=False)
    env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
    python=REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python';resultaten=[]
    for naam,programma,versie in [('referentie-a',oud,'2026.45.49'),('cache-a',nieuw,'2026.45.50'),('cache-b',nieuw,'2026.45.50'),('referentie-b',oud,'2026.45.49')]:
        # Een drukke compiler-/testfase is geen geschikte start voor een snelheidsproef.
        druk=[]
        for p in Path('/proc').glob('[0-9]*/comm'):
            try:
                n=p.read_text().strip()
                if n in ['cargo','rustc','rust-lld','ld.lld','cc']or n.startswith('node (vitest'):druk.append(n)
            except OSError:pass
        assert not druk,druk
        cmd=[str(python),str(ROOT/'meten.py'),'--zonder-profiel','--programma',str(programma),'--versie',versie,'--bron',str(REPO/'docs/tests/writer-doortypen/bron.docx'),'--paginas','129','--tekst',tekst,'--uitvoer',str(uit/naam)]
        print('START',naam,flush=True);begin=time.monotonic();samples=[]
        with (uit/(naam+'.log')).open('w')as log:
            p=subprocess.Popen(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
            while p.poll()is None:
                rij=procesboom(p.pid);native=[v for v in rij if v['exe']==str(programma)]
                samples.append({'sinds_start_s':time.monotonic()-begin,'host_loadavg':os.getloadavg(),'native_rss_kib':sum(v['rss_kib']for v in native),'boomsom_rss_kib':sum(v['rss_kib']for v in rij),'processen':rij});time.sleep(.5)
        (uit/(naam+'-rss.json')).write_text(json.dumps({'grens':'Gesamplede RSS per eigen procesboom, inclusief testomgeving; boomsom telt gedeelde paginas dubbel. Geen PSS, harde geheugenlimiet of lekbewijs.','samples':samples},indent=2)+'\n')
        r={'naam':naam,'code':p.returncode,'seconden':time.monotonic()-begin,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'native_piek_rss_kib':max((s['native_rss_kib']for s in samples),default=0),'opdracht':cmd};resultaten.append(r)
        (uit/'uitkomsten.json').write_text(json.dumps(resultaten,indent=2)+'\n');print('EINDE',naam,p.returncode,flush=True)
        if p.returncode:raise SystemExit(p.returncode)
if __name__=='__main__':main()
