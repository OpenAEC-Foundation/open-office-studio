"""Gerichte Spreadsheet-vensterproef op een vastgezette release, met eigen bron."""
from pathlib import Path
import os,sys,time,subprocess,json,hashlib,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';archief=w/'bron-alpha24';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-rekenblad.xlsx';origineel=(archief/'native/crates/office-core/tests/fixtures/spreadsheet-beveiligd.xlsx').read_bytes();bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.24 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':'1155f3676bef9573b5d2d67fb7cb58149545a6e4','proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster, X11-muis/toetsen en systeemklembord, in eigen Xvfb en vooraf geïsoleerde sessie-D-Bus/XDG-profielen. Geen fysieke hardware, andere platforms, volledige suite, IME-compositie of systeemdialoog.','stappen':stappen}
S={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def xd(*a):return subprocess.check_output(['xdotool',*map(str,a)],env=e,text=True,stderr=log,timeout=10).strip()
def klik(x,y):xd('mousemove','--sync',x,y);xd('click',1);time.sleep(.4)
def toets(*a):xd('key','--clearmodifiers','--delay','0',*a);time.sleep(.4)
def beeld(naam):
 raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff);pad=uit/(naam+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(pad);return {'bestand':pad.name,'sha256':hashlib.sha256(pad.read_bytes()).hexdigest()}
def adres(verwacht):
 klik(50,201);toets('ctrl+a');toets('ctrl+c')
 for _ in range(100):
  v=subprocess.run(['xclip','-selection','clipboard','-out'],env=e,text=True,capture_output=True,timeout=5)
  if v.returncode==0 and v.stdout==verwacht:return v.stdout
  time.sleep(.1)
 raise AssertionError('Verkeerde zichtbare selectie: '+repr(v.stdout)+'; verwacht '+verwacht)
def inhoud():
 with zipfile.ZipFile(bron) as z:
  blad=ET.fromstring(z.read('xl/worksheets/sheet1.xml'));stijlen=ET.fromstring(z.read('xl/styles.xml'))
  ss=ET.fromstring(z.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in z.namelist() else None
 return blad,stijlen,ss
def celwaarde(ref):
 blad,_,ss=inhoud();c=blad.find('.//s:c[@r="'+ref+'"]',S)
 if c is None:return None
 if c.get('t')=='s':return ''.join(ss[int(c.find('s:v',S).text)].itertext())
 if c.get('t')=='inlineStr':return ''.join(c.find('s:is',S).itertext())
 return c.findtext('s:v',namespaces=S)
def opmaak():
 blad,styles,_=inhoud();fonts=styles.find('s:fonts',S);xfs=styles.find('s:cellXfs',S)
 for rij in range(2,5):
  for kolom in 'BCD':
   c=blad.find('.//s:c[@r="'+kolom+str(rij)+'"]',S)
   if c is None:return False
   xf=xfs[int(c.get('s','0'))];vet=fonts[int(xf.get('fontId','0'))].find('s:b',S)
   if vet is None or vet.get('val','1') in ['0','false']:return False
 assert blad.find('.//s:c[@r="D2"]/s:f',S).text=='B2*C2'
 assert blad.find('.//s:c[@r="D4"]/s:f',S).text=='SUM(D2:D3)'
 return True
def bewaar_tot(goed):
 eind=time.monotonic()+40
 while time.monotonic()<eind:
  assert p.poll() is None
  toets('ctrl+s')
  try:
   if goed():return
  except (OSError,zipfile.BadZipFile,ET.ParseError):pass
  time.sleep(.2)
 raise AssertionError('Verwachte bewaarde bron niet bereikt')
try:
 p=subprocess.Popen([str(programma),str(bron)],env=e,stdout=log,stderr=subprocess.STDOUT);d=display.Display();venster=None
 for _ in range(300):
  assert p.poll() is None
  for v in d.screen().root.query_tree().children:
   if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio':venster=v;break
  if venster is not None:break
  time.sleep(.2)
 assert venster is not None
 venster.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();time.sleep(3)
 # De adresbalk van het geladen raster moet als echt tekstveld bereikbaar zijn.
 for _ in range(240):
  raw=d.screen().root.get_image(134,234,1,1,X.ZPixmap,0xffffffff);kleur=Image.frombytes('RGB',(1,1),raw.data,'raw','BGRX').getpixel((0,0))
  if all(200<c<250 for c in kleur):break
  time.sleep(.25)
 else:raise AssertionError('Geen geladen werkbladraster')
 stappen.append({'stap':'Eigen XLSX geopend in het echte native venster','beeld':beeld('spreadsheet-open')})

 assert bron.read_bytes()==origineel
 klik(134,273);toets('F2');toets('7');toets('Return');toets('ctrl+s')
 assert bron.read_bytes()==origineel
 stappen.append({'stap':'F2, typen, Enter en bewaren wijzigen de beschermde werkmap niet','beeld':beeld('spreadsheet-beveiligd-invoer')})
 subprocess.run(['xclip','-selection','clipboard','-target','UTF8_STRING','-in'],input='7'.encode(),env=e,stdout=subprocess.DEVNULL,stderr=log,check=True,timeout=10)
 toets('ctrl+v');toets('Return');toets('ctrl+s');assert bron.read_bytes()==origineel
 stappen.append({'stap':'Systeemklembord plakken en bewaren wijzigen de beschermde werkmap niet'})
 xd('mousemove','--sync',134,273);xd('mousedown',1);time.sleep(.3);xd('mousemove','--sync',262,311);time.sleep(.5);xd('mouseup',1);time.sleep(.5)
 assert adres('B2:D4')=='B2:D4';assert bron.read_bytes()==origineel
 stappen.append({'stap':'Muissleep en bereikbaar adresveld blijven beschikbaar bij alleen-lezen','beeld':beeld('spreadsheet-beveiligd-bereik')})
 klik(335,109);toets('ctrl+s');assert bron.read_bytes()==origineel
 stappen.append({'stap':'Opmaakknop wijzigt de beschermde selectie niet'})
 klik(42,45);beeld('spreadsheet-beveiligd-bestand');toets('Escape');assert bron.read_bytes()==origineel
 stappen.append({'stap':'Bestand geopend en gesloten met exact bronbehoud'})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Eigen venster schoon gesloten','procescode':p.returncode});rapport['geslaagd']=True

except Exception as ex:
 rapport['fout']=str(ex)
 if d is not None:
  try:rapport['foutbeeld']=beeld('spreadsheet-fout')
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
