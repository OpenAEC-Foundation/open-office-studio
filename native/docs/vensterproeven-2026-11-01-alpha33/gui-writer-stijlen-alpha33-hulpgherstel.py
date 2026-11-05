"""Werkelijke Writer-alineastijlen op een vastgezette release met uitsluitend eigen bestanden."""
from pathlib import Path
import os,sys,time,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-tekst.docx';origineel=subprocess.check_output(['git','show',sys.argv[3]+':native/crates/office-core/tests/fixtures/writer-stijlen.docx']);bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.33 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':sys.argv[3],'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster in eigen Xvfb/D-Bus/XDG-sessie, X11-toetsen/muis en systeemklembord. Eigen DOCX met twee alineastijlen, een tekenstijl, twee secties, tabel en rijke runs. Stijlkeuze met directe vervolginvoer, bewaren, undo en heropenen. Geen fysieke hardware, andere platforms, IME, schermlezer of volledige suite-/pixelpariteit.','stappen':stappen}
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};uri='{'+ns['w']+'}'
def xd(*a):
 if a[:2]==('mousemove','--sync'):
  q=d.screen().root.query_pointer()
  if (q.root_x,q.root_y)==(int(a[-2]),int(a[-1])):a=(a[0],*a[2:])
 return subprocess.check_output(['xdotool',*map(str,a)],env=e,text=True,stderr=log,timeout=10).strip()

def sleutel(*a):xd('key','--clearmodifiers','--delay','0',*a)

def klik(x,y):xd('mousemove','--sync',x,y);xd('click',1);time.sleep(.4)

def beeld(naam):
 raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff);f=uit/(naam+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(f);return {'bestand':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}

def inhoud():
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 body=root.find('w:body',ns)
 def tekst(p):return ''.join(n.text or '' if n.tag==uri+'t' else '\n' if n.tag==uri+'br' else '\t' if n.tag==uri+'tab' else '' for n in p.iter())
 return [tekst(p) for p in body.findall('.//w:p',ns)],len(body.findall('.//w:tbl',ns)),len(body.findall('.//w:sectPr',ns))

def klopt(links,rechts):
 teksten,tabellen,secties=inhoud();return links in teksten and rechts in teksten and tabellen==1 and secties==2 and 'Cel één' in teksten and 'Cel twee' in teksten

def wacht(goed):
 einde=time.monotonic()+45
 while time.monotonic()<einde:
  assert p.poll() is None
  try:
   if goed():return
  except (OSError,zipfile.BadZipFile,ET.ParseError):pass
  time.sleep(.1)
 raise AssertionError('De ene bewaaropdracht leverde niet de verwachte bron op')

def klembord(verwacht):
 for _ in range(150):
  v=subprocess.run(['xclip','-selection','clipboard','-out'],env=e,text=True,capture_output=True,timeout=5)
  if v.returncode==0 and v.stdout==verwacht:return
  time.sleep(.1)
 raise AssertionError('Klembord '+repr(v.stdout)+'; verwacht '+repr(verwacht))

def open_venster(pad):
 global p
 p=subprocess.Popen([str(programma),str(pad)],env=e,stdout=log,stderr=subprocess.STDOUT);venster=None
 for _ in range(300):
  assert p.poll() is None
  for v in d.screen().root.query_tree().children:
   if v.get_attributes().map_state==X.IsViewable and v.get_wm_name()=='Open Office Studio':venster=v;break
  if venster is not None:break
  time.sleep(.2)
 assert venster is not None
 venster.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();time.sleep(3)
 for _ in range(200):
  raw=d.screen().root.get_image(380,350,270,40,X.ZPixmap,0xffffffff);im=Image.frombytes('RGB',(270,40),raw.data,'raw','BGRX')
  if sum(1 for c in im.getdata() if max(c)<160)>20:return
  time.sleep(.1)
 raise AssertionError('Geen geladen documenttekst op de verwachte pagina')

def lege_na_rijke_alinea():
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 body=root.find('w:body',ns);kinderen=list(body)
 for i,a in enumerate(kinderen[:-1]):
  if a.tag==uri+'p' and ''.join(a.itertext())=='Links 🏠 café rechts':
   b=kinderen[i+1]
   return b.tag==uri+'p' and not ''.join(b.itertext()) and b.find('w:pPr/w:sectPr',ns) is None
 return False


def alinea_stijl(a):
 n=a.find('w:pPr/w:pStyle',ns)
 return n.attrib.get(uri+'val') if n is not None else None
def rijke_stijl(tekst):
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 a=next((a for a in root.findall('w:body/w:p',ns) if ''.join(a.itertext())==tekst),None)
 return a is not None and alinea_stijl(a)=='EigenKop' and klopt(tekst,'Andere sectie')
def leeg_en_negen():
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 kinderen=list(root.find('w:body',ns))
 for i,a in enumerate(kinderen[:-2]):
  if a.tag==uri+'p' and ''.join(a.itertext())=='Links 🏠 café rechts':
   links,rechts=kinderen[i+1:i+3]
   return links.tag==uri+'p' and rechts.tag==uri+'p' and not ''.join(links.itertext()) and ''.join(rechts.itertext())=='9' and alinea_stijl(links)==alinea_stijl(rechts)=='EigenKop' and klopt('Links 🏠 café rechts','9')
 return False
def lege_stijlrij(aantal):
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 kinderen=list(root.find('w:body',ns))
 for i,a in enumerate(kinderen):
  if a.tag==uri+'p' and ''.join(a.itertext())=='Links 🏠 café rechts':
   rij=kinderen[i+1:i+1+aantal]
   return len(rij)==aantal and all(n.tag==uri+'p' and not ''.join(n.itertext()) and n.find('w:pPr/w:sectPr',ns) is None and alinea_stijl(n)=='EigenKop' for n in rij) and i+1+aantal<len(kinderen) and kinderen[i+1+aantal].tag==uri+'tbl'
 return False
keuzes=0
def gereed_beeld(goed,omschrijving):
 einde=time.monotonic()+30;stabiel=0
 while time.monotonic()<einde:
  assert p.poll() is None
  raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff)
  im=Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX')
  if goed(im):
   stabiel+=1
   if stabiel>=4:return
  else:stabiel=0
  time.sleep(.1)
 raise AssertionError('GUI-voorwaarde niet bereikt: '+omschrijving)
def kies_kop():
 global keuzes
 # Alleen beschikbaarheid herkennen; alle bewaarde beelden blijven volledige
 # ruwe opnamen en deze detectie is geen pixelpariteitscontrole.
 gereed_beeld(lambda im:sum(1 for c in im.crop((717,119,727,128)).getdata() if max(c)<180)>4,'keuzelijst heeft haar werkelijke pijl')
 keuzes+=1
 stappen.append({'stap':'Beschikbare stijlkeuze vóór openen','beeld':beeld('stijl-beschikbaar-'+str(keuzes))})
 klik(650,123)
 gereed_beeld(lambda im:sum(1 for c in im.crop((579,149,700,182)).getdata() if max(c)<160)>25,'menu staat werkelijk boven de documenttabstrook')
 stappen.append({'stap':'Stijlkeuzelijst zichtbaar geopend','beeld':beeld('stijl-lijst-'+str(keuzes))})
 xd('mousemove','--sync',650,174);xd('click',1)

try:
 d=display.Display();open_venster(bron)
 stappen.append({'stap':'Eigen stijlproef geopend','beeld':beeld('stijl-open')})
 klik(430,351);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 café rechts');assert bron.read_bytes()==origineel;sleutel('Home',*(['Right']*8),'shift+Home','ctrl+c');klembord('Links 🏠 ');sleutel('Right')
 kies_kop();xd('type','--clearmodifiers','--delay','0','9');sleutel('ctrl+s');wacht(lambda:rijke_stijl('Links 🏠 9café rechts'))
 bewaard=uit/'Bewaarde-alineastijl.docx';bewaard.write_bytes(bron.read_bytes());bewaard_hash=hashlib.sha256(bewaard.read_bytes()).hexdigest()
 stappen.append({'stap':'Echte stijlkeuze Kop 1 en directe 9 met één bewaren','beeld':beeld('stijl-direct')})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:rijke_stijl('Links 🏠 café rechts'))
 stappen.append({'stap':'Eén undo en bewaren verwijderen alleen de 9; Kop 1 blijft'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Volgende undo en bewaren herstellen de oorspronkelijke bron exact'})
 klik(430,351);sleutel('End','Return','ctrl+s');wacht(lege_na_rijke_alinea);leeg=bron.read_bytes();(uit/'Leeg-na-splitsen.docx').write_bytes(leeg)
 stappen.append({'stap':'Nieuwe lege alinea direct vóór de tabel met één bewaren'})
 kies_kop();sleutel('Return');xd('type','--clearmodifiers','--delay','0','9');sleutel('ctrl+s');wacht(leeg_en_negen)
 (uit/'Stijl-enter-negen.docx').write_bytes(bron.read_bytes())
 stappen.append({'stap':'Kop 1 kiezen, direct Enter/9 en één bewaren maken twee echte alinea’s met dezelfde stijl','beeld':beeld('stijl-enter')})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:lege_stijlrij(2) and '9' not in inhoud()[0])
 stappen.append({'stap':'Eén undo en bewaren verwijderen de laatste 9'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:lege_stijlrij(1) and bron.read_bytes()!=leeg)
 stappen.append({'stap':'Volgende undo en bewaren verwijderen alleen de tweede splitsing'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==leeg)
 stappen.append({'stap':'Volgende undo en bewaren herstellen de eerste splitsbron exact'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Volgende undo en bewaren herstellen de oorspronkelijke bron exact'})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Eigen bronvenster schoon gesloten','procescode':p.returncode})
 open_venster(bewaard);klik(490,363);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 9café rechts')
 assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash
 stappen.append({'stap':'Bewaarde Kop 1 heropend en volledige alineatekst via systeemklembord bevestigd zonder bronwijziging'})
 for i in range(3):
  time.sleep(4 if i==0 else 2)
  assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash
  stappen.append({'stap':'Afzonderlijk rustig heropenbeeld '+str(i+1),'beeld':beeld('stijl-rustig-'+str(i+1))})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Heropend eigen venster schoon gesloten','procescode':p.returncode});rapport['geslaagd']=True

except Exception as ex:
 rapport['fout']=str(ex)
 if d is not None:
  try:rapport['foutbeeld']=beeld('writer-fout')
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
