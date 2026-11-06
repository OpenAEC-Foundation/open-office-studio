"""Herhaal dezelfde afkeuring met uitsluitend extra metadata na de oorspronkelijke fout."""
from pathlib import Path
import json,os,subprocess
from voorbereiden import REPO,UIT,sha
m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
s=(UIT/'correctieproef.py').read_text();a="        r['fout'] = repr(fout)";assert s.count(a)==1
b='''        r['fout'] = repr(fout)
        try:
            r['sluitdiagnose'] = await p.ev("""(()=>{
              let el=document.querySelector('.office-werkvlak'),uit=[];
              for(let f=el?.[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return){
                let slots=[];
                for(let h=f.memoizedState,n=0;h&&n<500;n++,h=h.next){
                  const v=h.memoizedState,c=v?.current;
                  if(typeof v==='boolean')slots.push({n,staat:v});
                  if(typeof c==='boolean')slots.push({n,ref:c});
                  if(c&&typeof c.sluit==='function'&&'opStart'in c){window._sluitOpties=c;slots.push({n,sneltoets:{uit:!!c.uit,opStart:c.opStart,actief:c.actief?.type}})}
                }
                if(slots.length)uit.push({component:f.type?.name,slots});
              }
              return {uit,focus:document.activeElement?.outerHTML?.slice(0,400),dialogen:[...document.querySelectorAll('[role=dialog]')].map(x=>x.textContent.slice(0,300))};
            })()""")
            await p.ev('window._sluitOpties?.sluit();true')
            await asyncio.sleep(1)
            r['na_rechtstreekse_sluitvraag'] = await p.ev("({dialoog:!!document.querySelector('.office-dialoogacties'),editor:!!document.querySelector('.office-tekst')})")
        except Exception as diagnosefout:
            r['extra_diagnosefout']=str(diagnosefout)'''
s=s.replace(a,b);helper=UIT/'sluitdiagnose.py';assert not helper.exists();helper.write_text(s)
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--programma',str(exe),'--versie','2026.45.52','--uitvoer',str(UIT/'sluitdiagnose')]
with (UIT/'sluitdiagnose.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'sluitdiagnose.json').write_text(json.dumps({'code':p.returncode,'helper_sha256':sha(helper),'programma_sha256':sha(exe),'opdracht':cmd},indent=2)+'\n');print('Diagnosecode',p.returncode,flush=True);raise SystemExit(p.returncode)
