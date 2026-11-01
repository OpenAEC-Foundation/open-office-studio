"""Verken uitsluitend het eigen native notitievenster met volledige ruwe beelden."""
from pathlib import Path
from Xlib import display,X
from PIL import Image
import os,sys,json,time,subprocess,hashlib,re
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/'gui-alpha36-notition-verkenning-ci';uit.mkdir();exe=Path(sys.argv[1]);commit=sys.argv[2];bron=uit/'Eigen-notities.openaec-notities';data=subprocess.check_output(['git','show',commit+':docs/voorbeelden/Notitieboek.json']);bron.write_bytes(data);log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'broncommit':commit,'programma_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'omvang':'Verkennend eigen Linux-venster in aparte Xvfb/D-Bus/XDG. Eigen voorbeeldkopie, geen volledige functie-/pixelgoedkeuring.','begindata_sha256':hashlib.sha256(data).hexdigest(),'stappen':stappen}
def xd(*a):return subprocess.check_output(['xdotool',*map(str,a)],text=True,stderr=log,timeout=10).strip()
def beeld(n):
 assert re.fullmatch('[a-z0-9-]+',n);raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff);f=uit/(n+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(f);return {'bestand':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
try:
 d=display.Display();p=subprocess.Popen([str(exe),str(bron)],stdout=log,stderr=subprocess.STDOUT)
 for _ in range(300):
  assert p.poll() is None
  vv=[v for v in d.screen().root.query_tree().children if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio']
  if vv:vv[0].set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();break
  time.sleep(.2)
 else:raise AssertionError('Eigen notitievenster ontbreekt')
 time.sleep(3);stappen.append({'actie':'open','beeld':beeld('notities-open')});print(json.dumps(stappen[-1]),flush=True)
 for regel in sys.stdin:
  a=json.loads(regel);assert p.poll() is None
  if a['actie']=='stop':break
  if a['actie']=='klik':
   x,y=a['x'],a['y'];assert 0<=x<1440 and 0<=y<900;xd('mousemove',x,y);xd('click',1)
  elif a['actie']=='toets':xd('key','--clearmodifiers','--delay','0',*a['toetsen'])
  elif a['actie']=='tekst':xd('type','--clearmodifiers','--delay','0',a['tekst'])
  elif a['actie']=='wacht':assert 0<=a['seconden']<=15;time.sleep(a['seconden'])
  elif a['actie']!='beeld':raise AssertionError('Onbekende proefactie')
  time.sleep(.6);stappen.append({**a,'beeld':beeld(a['beeldnaam']),'bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest()});print(json.dumps(stappen[-1],ensure_ascii=False),flush=True)
finally:
 if p is not None and p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 if d is not None:d.close()
 log.close();rapport['einddata_sha256']=hashlib.sha256(bron.read_bytes()).hexdigest();(uit/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
