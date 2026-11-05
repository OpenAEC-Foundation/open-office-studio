"""Herstel uitsluitend vensterfocus binnen een eigen Xvfb-proef zonder vensterbeheer."""
from pathlib import Path
import os,sys,json,hashlib
from Xlib import display,X
ui=int(sys.argv[1]);doel=int(sys.argv[2]);rapport=Path(sys.argv[3]);w=Path.cwd()/'.local/controle-2026-10-31'
assert rapport.resolve().is_relative_to(w.resolve()) and not rapport.exists()
def omgeving(pid):return dict(s.split(b'=',1) for s in (Path('/proc')/str(pid)/'environ').read_bytes().split(b'\0') if b'=' in s)
e=omgeving(ui);daar=omgeving(doel);cmd=(Path('/proc')/str(ui)/'cmdline').read_bytes()
assert b'/.local/controle-2026-10-31/native-alpha' in cmd and b'-vast/open-office-studio-native' in cmd
assert e[b'DISPLAY']!=b':0' and e[b'DISPLAY']==daar[b'DISPLAY']
assert e[b'DBUS_SESSION_BUS_ADDRESS']==daar[b'DBUS_SESSION_BUS_ADDRESS']
os.environ['XAUTHORITY']=e[b'XAUTHORITY'].decode();d=display.Display(e[b'DISPLAY'].decode());vv=[]
for v in d.screen().root.query_tree().children:
 if v.get_attributes().map_state!=X.IsViewable:continue
 p=v.get_full_property(d.intern_atom('_NET_WM_PID'),X.AnyPropertyType)
 if p is not None and int(p.value[0])==doel:vv.append(v)
assert len(vv)==1;v=vv[0];v.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();assert d.get_input_focus().focus.id==v.id
r={'reden':'Eigen Xvfb zonder vensterbeheer; uitsluitend eigen systeemdialoog of applicatievenster focussen. Geen teksteditorfocusoperatie.','programma_pid':ui,'venster_pid':doel,'venster_id':v.id,'scherm':e[b'DISPLAY'].decode(),'klasse':v.get_wm_class(),'naam':v.get_wm_name(),'dezelfde_eigen_sessiebus':True,'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};rapport.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');d.close();print(json.dumps(r,ensure_ascii=False))
