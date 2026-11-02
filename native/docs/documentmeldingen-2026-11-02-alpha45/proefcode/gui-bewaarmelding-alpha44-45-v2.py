"""Verken uitsluitend het eigen native notitievenster met volledige ruwe beelden."""
from pathlib import Path
from Xlib import display,X
from PIL import Image
import os,sys,json,time,subprocess,hashlib,re,datetime
r=Path.cwd();w=r/'.local/controle-2026-10-31';nummer=sys.argv[3];assert nummer in ['44','45'];uit=w/f'gui-alpha{nummer}-bewaarmelding-v2';uit.mkdir();exe=Path(sys.argv[1]);commit=sys.argv[2];bron=uit/'Bewaarde-notitie.json';data=(w/'gui-alpha43-aanmaakdatum-na/Nieuw-notitieboek.json').read_bytes();bron.write_bytes(data);log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
aux=uit/'Eigen-derde-document.docx';aux.write_bytes((r/'docs/voorbeelden/Ontwerpnotitie.docx').read_bytes());auxhash=hashlib.sha256(aux.read_bytes()).hexdigest()
rapport={'systeem_lokaal_start':datetime.datetime.now().astimezone().isoformat(),'systeem_utc_start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'programmasource_basiscommit':commit,'voorbeeldbron':'Eigen eerder via GTK bewaarde notitie; de bronkopie blijft bytegelijk','programmabron':json.loads((exe.parent/'herkomst.json').read_text()),'programma_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'omvang':'Verkennend eigen Linux-venster in aparte Xvfb/D-Bus/XDG. Eigen voorbeeldkopie, geen volledige functie-/pixelgoedkeuring.','begindata_sha256':hashlib.sha256(data).hexdigest(),'stappen':stappen,'expliciet_gestopt':False,'programma_eindcode':None}
def xd(*a):return subprocess.check_output(['xdotool',*map(str,a)],text=True,stderr=log,timeout=10).strip()
def vensterlijst():
 resultaat=[]
 for v in d.screen().root.query_tree().children:
  try:
   if v.get_attributes().map_state==X.IsViewable:resultaat.append({'id':v.id,'naam':v.get_wm_name(),'klasse':list(v.get_wm_class() or [])})
  except Exception:pass
 return resultaat

def beeld(n):
 inhoud=bron.read_bytes();h=hashlib.sha256(inhoud).hexdigest();moment=uit/('bron-'+h+bron.suffix)
 if not moment.exists():moment.write_bytes(inhoud);moment.chmod(0o444)
 assert re.fullmatch('[a-z0-9-]+',n);raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff);f=uit/(n+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(f);return {'bestand':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'vensters':vensterlijst()}
try:
 subprocess.run(['dbus-update-activation-environment','DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'],check=True,stdout=log,stderr=log)
 rapport['testscherm']=os.environ['DISPLAY'];rapport['eigen_sessiebus']=os.environ['DBUS_SESSION_BUS_ADDRESS']
 d=display.Display();p=subprocess.Popen([str(exe),str(bron)],stdout=log,stderr=subprocess.STDOUT,cwd=uit)
 for _ in range(300):
  assert p.poll() is None
  vv=[v for v in d.screen().root.query_tree().children if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio']
  if vv:vv[0].set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();break
  time.sleep(.2)
 else:raise AssertionError('Eigen notitievenster ontbreekt')
 time.sleep(3);stappen.append({'actie':'open','programma_pid':p.pid,'beeld':beeld('notities-open'),'afgerond_monotonic':time.monotonic()});print(json.dumps(stappen[-1]),flush=True)
 for regel in sys.stdin:
  a=json.loads(regel);a['ontvangen_monotonic']=time.monotonic();assert p.poll() is None
  if a['actie']=='stop':
   rapport['expliciet_gestopt']=True;stappen.append({**a,'beeld':beeld('notities-expliciet-gestopt'),'bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'afgerond_monotonic':time.monotonic()});print(json.dumps(stappen[-1],ensure_ascii=False),flush=True);break
  if a['actie']=='klik':
   x,y=a['x'],a['y'];assert 0<=x<1440 and 0<=y<900;xd('mousemove',x,y);xd('click',1)
  elif a['actie']=='dubbelklik':
   x,y=a['x'],a['y'];assert 0<=x<1440 and 0<=y<900;xd('mousemove',x,y);xd('click','--repeat',2,'--delay',100,1)
  elif a['actie']=='sleep':
   x,y=a['van'];u,v=a['naar'];assert all(isinstance(k,int) for k in [x,y,u,v]) and 0<=x<1440 and 0<=u<1440 and 0<=y<900 and 0<=v<900;pauze=a.get('pauze',0);assert 0<=pauze<=2;xd('mousemove',x,y);xd('mousedown',1);time.sleep(pauze);xd('mousemove','--sync',u,v);time.sleep(pauze);xd('mouseup',1)
  elif a['actie']=='toets':xd('key','--clearmodifiers','--delay','0',*a['toetsen'])
  elif a['actie']=='focus':
   doel=a['doel'];assert doel in ['app','dialoog'];v=[v for v in d.screen().root.query_tree().children if v.get_attributes().map_state==X.IsViewable and ((doel=='app' and v.get_wm_name()=='Open Office Studio') or (doel=='dialoog' and 'xdg-desktop-portal-gtk' in (v.get_wm_class() or []) and v.get_geometry().width>300 and v.get_geometry().height>300))];assert len(v)==1;a['focus_voor']=str(d.get_input_focus().focus);v[0].set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();a['focus_na']=d.get_input_focus().focus.id;assert a['focus_na']==v[0].id
  elif a['actie']=='extern':
   assert 'extern_sha256' not in rapport;voor=hashlib.sha256(bron.read_bytes()).hexdigest();assert voor==rapport['begindata_sha256'];v=json.loads(bron.read_text());v['bron_proef_extern']='Eigen afzonderlijke bewaarconflictproef';bron.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');rapport['extern_sha256']=hashlib.sha256(bron.read_bytes()).hexdigest();a['extern_voor_sha256']=voor;a['extern_na_sha256']=rapport['extern_sha256']
  elif a['actie']=='toetsklik':
   x,y=a['x'],a['y'];assert 0<=x<1440 and 0<=y<900;xd('key','--clearmodifiers','ctrl+s','mousemove',x,y,'click',1)
  elif a['actie']=='tekst':xd('type','--clearmodifiers','--delay','0',a['tekst'])
  elif a['actie']=='wacht':assert 0<=a['seconden']<=15;time.sleep(a['seconden'])
  elif a['actie']!='beeld':raise AssertionError('Onbekende proefactie')
  time.sleep(.6);stappen.append({**a,'beeld':beeld(a['beeldnaam']),'bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'afgerond_monotonic':time.monotonic()});print(json.dumps(stappen[-1],ensure_ascii=False),flush=True)
finally:
 if p is not None and p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 if p is not None:rapport['programma_eindcode']=p.poll()
 if d is not None:d.close()
 rapport['systeem_utc_eind']=datetime.datetime.now(datetime.timezone.utc).isoformat();rapport['systeem_lokaal_eind']=datetime.datetime.now().astimezone().isoformat();log.close();rapport['einddata_sha256']=hashlib.sha256(bron.read_bytes()).hexdigest();(uit/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')

assert hashlib.sha256(aux.read_bytes()).hexdigest()==auxhash
assert rapport['expliciet_gestopt'], 'Geen expliciete geslaagde afronding van de vensterproef'
