"""Gerichte Spreadsheet-vensterproef op een vastgezette release, met eigen bron."""
from pathlib import Path
import os,sys,time,subprocess,json,hashlib,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';archief=w/'bron-alpha26';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-rekenblad.xlsx';origineel=(archief/'native/crates/office-core/tests/fixtures/spreadsheet.xlsx').read_bytes();bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.26 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':'7a0ad58d53d6a4c273f23088f44194793d49f793','proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster, X11-muis/toetsen en systeemklembord, in eigen Xvfb en vooraf geïsoleerde sessie-D-Bus/XDG-profielen. Geen fysieke hardware, andere platforms, volledige suite, IME-compositie of systeemdialoog.','stappen':stappen}
S={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def xd(*a):
 if a[:2]==('mousemove','--sync'):
  pos=d.screen().root.query_pointer()
  if (pos.root_x,pos.root_y)==(int(a[-2]),int(a[-1])):a=(a[0],*a[2:])
 return subprocess.check_output(['xdotool',*map(str,a)],env=e,text=True,stderr=log,timeout=10).strip()
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
 assert celwaarde('B4') in [None,''] and celwaarde('C4') in [None,'']
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
 xd('mousemove','--sync',134,273);xd('mousedown',1);time.sleep(.3);xd('mousemove','--sync',262,311);time.sleep(.5);xd('mouseup',1);time.sleep(.5)
 assert adres('B2:D4')=='B2:D4';assert bron.read_bytes()==origineel
 stappen.append({'stap':'Echte muissleep selecteert B2:D4; adresveld via systeemklembord bevestigd','beeld':beeld('spreadsheet-bereik')})
 klik(335,109);bewaar_tot(opmaak)
 stappen.append({'stap':'Lintopmaak en bewaren: alle negen cellen vet, oorspronkelijke formules behouden','beeld':beeld('spreadsheet-bereik-opmaak')})
 bewerkt=bron.read_bytes()
 klik(262,311);xd('key','--clearmodifiers','--delay','0','shift+Left','shift+Up');time.sleep(.5);assert adres('C3:D4')=='C3:D4'
 # Herstel rasterfocus met Shift+klik op de bestaande actieve doelcel.
 xd('keydown','Shift');klik(198,292);xd('keyup','Shift');time.sleep(.3)
 # Het anker is nog D4. Daarna volgt de extra stap naar links.
 xd('key','--clearmodifiers','--delay','0','shift+Left');time.sleep(.5);assert adres('B3:D4')=='B3:D4';assert bron.read_bytes()==bewerkt
 stappen.append({'stap':'Snelle Shift-pijlen, Shift-klik en extra uitbreiding bewaren het oorspronkelijke anker D4'})
 klik(134,273);toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Bereikopmaak met één undo bronexact hersteld'})
 klik(134,273)
 # Geen kunstmatige pauzes tussen de relatieve pijl, tekens en bevestiging.
 xd('key','--clearmodifiers','--delay','0','Down')
 xd('type','--clearmodifiers','--delay','0','78')
 xd('key','--clearmodifiers','--delay','0','Return')
 # Bewaren wordt pas daarna gecontroleerd en zo nodig herhaald. Dit bewijst
 # geen ononderbroken plak/Enter/bewaarwachtrij in alpha 26.
 bewaar_tot(lambda:celwaarde('B2')=='3' and celwaarde('B3')=='78')
 assert adres('B4')=='B4'
 stappen.append({'stap':'Snelle Down/78/Enter zonder onderlinge pauzes bereikt B4; na bewaren B2=3 en B3=78','beeld':beeld('spreadsheet-snelle-invoer')})
 klik(134,292);toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Snelle celinvoer met één undo bronexact hersteld'})
 klik(454,425);toets('F2')
 subprocess.run(['xclip','-selection','clipboard','-target','UTF8_STRING','-in'],input='café 🏠'.encode(),env=e,stdout=subprocess.DEVNULL,stderr=log,check=True,timeout=10)
 toets('ctrl+v');toets('Return');bewaar_tot(lambda:celwaarde('G10')=='café 🏠')
 stappen.append({'stap':'Unicode-systeemklembord in cel G10, afzonderlijk bevestigd en bewaard; XML-waarde klopt','beeld':beeld('spreadsheet-unicode')})
 bewaard=uit/'Bewaard-symbool.xlsx';bewaard.write_bytes(bron.read_bytes());bewaard_hash=hashlib.sha256(bewaard.read_bytes()).hexdigest()
 toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Celbewerking met één undo bronexact hersteld'})
 klik(42,45);beeld('spreadsheet-bestand');toets('Escape');assert bron.read_bytes()==origineel
 stappen.append({'stap':'Bestand geopend en gesloten met behoud van de oorspronkelijke bron'})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Eigen venster schoon gesloten','procescode':p.returncode})
 p=subprocess.Popen([str(programma),str(bewaard)],env=e,stdout=log,stderr=subprocess.STDOUT);venster=None
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
 stappen.append({'stap':'Bewaarde Unicode-bron opnieuw in een nieuw echt venster geopend','bron_sha256':bewaard_hash,'beeld':beeld('spreadsheet-unicode-heropend')})
 klik(134,273)
 # Geen kunstmatige pauzes tussen de relatieve pijl, tekens en bevestiging.
 xd('key','--clearmodifiers','--delay','0','Down')
 xd('type','--clearmodifiers','--delay','0','78')
 xd('key','--clearmodifiers','--delay','0','Return')
 # Bewaren wordt pas daarna gecontroleerd en zo nodig herhaald. Dit bewijst
 # geen ononderbroken plak/Enter/bewaarwachtrij in alpha 26.
 bewaar_tot(lambda:celwaarde('B2')=='3' and celwaarde('B3')=='78')
 assert adres('B4')=='B4'
 stappen.append({'stap':'Snelle Down/78/Enter zonder onderlinge pauzes bereikt B4; na bewaren B2=3 en B3=78','beeld':beeld('spreadsheet-snelle-invoer')})
 klik(134,292);toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Snelle celinvoer met één undo bronexact hersteld'})
 klik(454,425);toets('F2');toets('ctrl+a');toets('ctrl+c')
 tekst=None
 for _ in range(100):
  v=subprocess.run(['xclip','-selection','clipboard','-out'],env=e,text=True,capture_output=True,timeout=5)
  if v.returncode==0 and v.stdout=='café 🏠':tekst=v.stdout;break
  time.sleep(.1)
 assert tekst=='café 🏠',repr(tekst)
 toets('Escape');assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash
 stappen.append({'stap':'Heropende cel via F2 en systeemklembord exact gecontroleerd, Escape behoudt bron','beeld':beeld('spreadsheet-unicode-heropend-gecontroleerd')})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Ook het heropende eigen venster schoon gesloten','procescode':p.returncode});rapport['geslaagd']=True

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
