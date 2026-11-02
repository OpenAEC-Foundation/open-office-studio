from pathlib import Path
import json,os,sys,re
from Xlib import display,X
r=Path.cwd();w=r/'.local/controle-2026-10-31';regels=(w/'native-alpha43-aanmaakdatum-na-venster.log').read_text().splitlines();begin=next(json.loads(s) for s in regels if s.startswith('{"actie": "open"'));pid=begin['programma_pid'];exe=Path('/proc')/str(pid)/'exe';assert exe.resolve()==(w/'native-alpha43-debug-vast/open-office-studio-native').resolve()
env={}
for b in (exe.parent/'environ').read_bytes().split(b'\0'):
 if b'=' in b:
  k,v=b.split(b'=',1)
  if k in [b'DISPLAY',b'XAUTHORITY',b'XDG_RUNTIME_DIR']:env[k.decode()]=v.decode()
assert env['XDG_RUNTIME_DIR'].startswith('/tmp/office-note43-na-');os.environ['DISPLAY']=env['DISPLAY'];os.environ['XAUTHORITY']=env['XAUTHORITY'];d=display.Display()
def focus():
 f=d.get_input_focus().focus
 return {'id':f.id,'naam':f.get_wm_name()} if hasattr(f,'id') else {'id':f,'naam':None}
doel,label=sys.argv[1:];assert doel in ['app','dialoog'] and re.fullmatch('[a-z0-9-]+',label)
v=[v for v in d.screen().root.query_tree().children if v.get_attributes().map_state==X.IsViewable and ((doel=='app' and v.get_wm_name()=='Open Office Studio') or (doel=='dialoog' and 'xdg-desktop-portal-gtk' in (v.get_wm_class() or [])))];assert len(v)==1;voor=focus();v[0].set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();na=focus();assert na['id']==v[0].id
rapport={'programma_pid':pid,'eigen_display':env['DISPLAY'],'focusdoel':doel,'label':label,'focus_voor':voor,'focus_na':na,'omvang':'Eigen Xvfb zonder windowmanager na sluiten van de GTK-bestandsdialoog. Expliciete focus op het gecontroleerde eigen venster of de eigen GTK-dialoog voor de vervolgrondgang; geen bewijs voor automatisch focusherstel in een normaal venstersysteem.'};(w/('gui-alpha43-aanmaakdatum-na/focus-'+label+'.json')).write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rapport,ensure_ascii=False));d.close()
