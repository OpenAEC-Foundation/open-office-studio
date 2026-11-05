from pathlib import Path
import os,json
from Xlib import display,X,protocol
r=Path.cwd();w=r/'.local/controle-2026-10-31';profiel=json.loads((w/'notities-alpha40-debug-profiel-v2.json').read_text())['profiel'];kandidaten=[]
for p in Path('/proc').glob('[0-9]*'):
 try:
  a=(p/'cmdline').read_bytes().split(b'\0')
  if len(a)>1 and a[1].decode()==str(w/'gui-notities-debug-alpha40.py'):kandidaten.append(p)
 except OSError:pass
assert len(kandidaten)==1
p=kandidaten[0];e=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\0') if b'=' in x);assert e[b'XDG_RUNTIME_DIR'].decode()==profiel+'/runtime';os.environ['XAUTHORITY']=e[b'XAUTHORITY'].decode();naam=e[b'DISPLAY'].decode();assert naam.startswith(':')
d=display.Display(naam);vensters=[v for v in d.screen().root.query_tree().children if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio'];assert len(vensters)==1;v=vensters[0];v.send_event(protocol.event.Expose(window=v.id,x=0,y=0,width=1440,height=900,count=0),event_mask=X.ExposureMask);d.sync();d.close();(w/'gui-alpha40-notition-debug-lokaal/herteken-diagnose.json').write_text(json.dumps({'eigen_helper_pid':int(p.name),'eigen_testscherm':naam,'eigen_profiel':profiel,'venster_id':v.id,'actie':'Eén Expose-gebeurtenis aan uitsluitend het eigen geïsoleerde testvenster; geen documentopdracht of geslaagde klikproef.'},ensure_ascii=False,indent=2)+'\n');print('Eigen testvenster om één hertekening gevraagd.')
