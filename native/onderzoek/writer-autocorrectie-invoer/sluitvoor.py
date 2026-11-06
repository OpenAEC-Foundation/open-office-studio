"""Lees de sluitvoorwaarden vóór Ctrl+W; behoud de bestaande tiensecondenpoort."""
from pathlib import Path
import json,os,subprocess
from voorbereiden import REPO,UIT,sha
m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
s=(UIT/'sluitdiagnose.py').read_text();a="                await toets(p, 'ctrl+w', leeg=False)";assert s.count(a)==1
b='''                r['voor_sluiten'] = await p.ev("""(()=>{
                  let el=document.querySelector('.office-werkvlak'),uit=[];
                  for(let f=el?.[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return){
                    let slots=[];
                    for(let h=f.memoizedState,n=0;h&&n<500;n++,h=h.next){const v=h.memoizedState,c=v?.current;
                      if(typeof v==='boolean')slots.push({n,staat:v});if(typeof c==='boolean')slots.push({n,ref:c});
                      if(c&&typeof c.sluit==='function'&&'opStart'in c)slots.push({n,sneltoets:{uit:!!c.uit,opStart:c.opStart,actief:c.actief?.type}});
                    }if(slots.length)uit.push({component:f.type?.name,slots});
                  }return uit;
                })()""")
                await toets(p, 'ctrl+w', leeg=False)'''
s=s.replace(a,b);helper=UIT/'sluitvoor.py';assert not helper.exists();helper.write_text(s)
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--programma',str(exe),'--versie','2026.45.52','--uitvoer',str(UIT/'sluitvoor')]
with (UIT/'sluitvoor.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'sluitvoor.json').write_text(json.dumps({'code':p.returncode,'helper_sha256':sha(helper),'programma_sha256':sha(exe),'opdracht':cmd},indent=2)+'\n');print('Voor-sluitcode',p.returncode,flush=True);raise SystemExit(p.returncode)
