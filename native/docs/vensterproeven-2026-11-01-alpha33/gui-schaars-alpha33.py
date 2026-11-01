"""Echte rasterinvoer in een nieuwe modelwerkmap met bijna een miljoen verborgen rijen."""
from pathlib import Path
import os,sys,time,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve()
origineel=subprocess.check_output(['git','show',sys.argv[3]+':native/crates/office-core/tests/fixtures/spreadsheet-schaars.xlsx']);bron=uit/'Eigen-schaars.xlsx';bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.33 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':sys.argv[3],'geslaagd':False,'omvang':'Echt native Linux-venster, eigen X11/D-Bus/XDG, model-XLSX met zeroHeight en zichtbare rijen 1/1000000. Geen fysieke hardware, andere platforms, IME, volledige matrix- of pixelpariteit.','stappen':stappen}
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def xd(*a):
 if a[:2]==('mousemove','--sync'):
  q=d.screen().root.query_pointer()
  if (q.root_x,q.root_y)==(int(a[-2]),int(a[-1])):a=(a[0],*a[2:])
 return subprocess.check_output(['xdotool',*map(str,a)],env=e,text=True,stderr=log,timeout=10).strip()
def sleutel(*a):xd('key','--clearmodifiers','--delay','0',*a)
def beeld(n):
 raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff);f=uit/(n+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(f);return {'bestand':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
def inhoud(pad):
 with zipfile.ZipFile(pad) as z:
  a=ET.fromstring(z.read('xl/worksheets/sheet1.xml'));tweede=z.read('xl/worksheets/sheet2.xml')
  f=a.find('s:sheetFormatPr',ns);assert f is not None and f.get('zeroHeight')=='1' and float(f.get('defaultRowHeight'))==15
  rijen=a.findall('s:sheetData/s:row',ns);assert {int(n.get('r')) for n in rijen}=={1,1000000}
  assert all(float(n.get('ht'))==15 for n in rijen)
  assert b'Bewaar ook dit blad' in tweede
  c=a.findall('s:sheetData/s:row/s:c',ns)
  return {n.get('r'):n.findtext('s:v',namespaces=ns) for n in c}
def wacht(goed):
 einde=time.monotonic()+45
 while time.monotonic()<einde:
  assert p.poll() is None
  try:
   if goed():return
  except (OSError,zipfile.BadZipFile,ET.ParseError,AssertionError):pass
  time.sleep(.1)
 raise AssertionError('Eén bewaaropdracht leverde niet de bedoelde bron op')
def open_venster(pad):
 global p
 p=subprocess.Popen([str(programma),str(pad)],env=e,stdout=log,stderr=subprocess.STDOUT);venster=None
 for _ in range(300):
  assert p.poll() is None
  for v in d.screen().root.query_tree().children:
   if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio':venster=v;break
  if venster is not None:break
  time.sleep(.2)
 assert venster is not None;venster.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();time.sleep(3)
def sluit():
 xd('mousemove','--sync',1420,16);xd('click',1);p.wait(timeout=15);assert p.returncode==0
try:
 assert inhoud(bron)=={}
 d=display.Display();open_venster(bron);stappen.append({'stap':'Nieuwe modelwerkmap met twee zichtbare hoogte-uitzonderingen geopend','beeld':beeld('schaars-open')})
 sleutel('Down');xd('type','--clearmodifiers','--delay','0','7');sleutel('ctrl+s')
 wacht(lambda:inhoud(bron)=={'A1000000':'7'})
 bewaard=uit/'Bewaard-schaars.xlsx';bewaard.write_bytes(bron.read_bytes());sha=hashlib.sha256(bewaard.read_bytes()).hexdigest()
 stappen.append({'stap':'Direct Omlaag/7/één bewaren schrijft uitsluitend A1000000 en bewaart zeroHeight, beide hoogten en tweede blad','beeld':beeld('schaars-invoer')})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Eén undo en één bewaren herstellen de oorspronkelijke modelbron exact'})
 sluit();stappen.append({'stap':'Eigen bronvenster schoon gesloten','procescode':0})
 open_venster(bewaard);sleutel('Down','ctrl+c')
 for _ in range(150):
  v=subprocess.run(['xclip','-selection','clipboard','-out'],env=e,text=True,capture_output=True,timeout=5)
  if v.returncode==0 and v.stdout=='7':break
  time.sleep(.1)
 else:raise AssertionError('De heropende verre rij levert niet de verwachte 7 aan het systeemklembord')
 assert inhoud(bewaard)=={'A1000000':'7'} and hashlib.sha256(bewaard.read_bytes()).hexdigest()==sha
 time.sleep(.5);stappen.append({'stap':'Na heropenen slaat Omlaag de verborgen rijen over; werkelijk systeemklembord bevestigt 7 zonder bronwijziging','beeld':beeld('schaars-heropend')})
 sluit();stappen.append({'stap':'Ook het heropende eigen venster schoon gesloten','procescode':0});rapport['geslaagd']=True
except Exception as ex:
 rapport['fout']=str(ex)
 if d is not None:
  try:rapport['foutbeeld']=beeld('schaars-fout')
  except Exception:pass
 raise
finally:
 if p is not None and p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 if d is not None:d.close()
 log.close();(uit/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'geslaagd':rapport['geslaagd'],'stappen':len(stappen),'uitvoer':str(uit)},ensure_ascii=False),flush=True)
