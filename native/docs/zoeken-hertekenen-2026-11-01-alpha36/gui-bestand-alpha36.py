"""Werkelijke Writer-alineatoetsen op een vastgezette release met uitsluitend eigen bestanden."""
from pathlib import Path
import os,sys,time,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-tekst.docx';origineel=subprocess.check_output(['git','show',sys.argv[3]+':native/crates/office-core/tests/fixtures/writer-structuur.docx']);bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.36 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':sys.argv[3],'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster in eigen Xvfb/D-Bus/XDG-sessie, X11-toetsen/muis en systeemklembord. Eigen DOCX met twee secties, tabel en rijke runs. Geen fysieke hardware, andere platforms, IME, schermlezer of volledige suite-/pixelpariteit.','stappen':stappen}
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
 for _ in range(450):
  assert p.poll() is None
  raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff)
  im=Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX')
  # Startkaarten en een laadscherm bevatten ook donkere tekst. Vraag de
  # witte documentpagina, eigen koptekst én rijke alinea tegelijk.
  donker=lambda vak:sum(max(c)<160 for c in im.crop(vak).getdata())
  if im.getpixel((700,600))==(255,255,255) and donker((385,279,520,299))>20 and donker((385,355,560,380))>30:
   return
  time.sleep(.1)
 raise AssertionError('Geen werkelijk getekende documentpagina met eigen koptekst en rijke alinea')

def naar_splits():
 sleutel('Home',*(['Right']*8),'Return','ctrl+s');wacht(lambda:klopt('Links 🏠 ','café rechts'))
def herstel_samenvoeging(soort):
 sleutel('ctrl+z','ctrl+s');wacht(lambda:klopt('Links 🏠 ','café rechts'))
 stappen.append({'stap':soort+' met één undo en één bewaren terug naar de gesplitste bron'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Alineasplitsing daarna met één undo en één bewaren bronexact hersteld'})
def lege_na_rijke_alinea():
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 body=root.find('w:body',ns);kinderen=list(body)
 for i,a in enumerate(kinderen[:-1]):
  if a.tag==uri+'p' and ''.join(a.itertext())=='Links 🏠 café rechts':
   b=kinderen[i+1]
   return b.tag==uri+'p' and not ''.join(b.itertext()) and b.find('w:pPr/w:sectPr',ns) is None
 return False
def opgemaakte_negen():
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 for a in root.findall('w:body/w:p',ns):
  if ''.join(a.itertext())=='9':
   runs=a.findall('w:r',ns)
   return bool(runs) and all(n.find('w:rPr/w:b',ns) is not None and n.find('w:rPr/w:i',ns) is not None for n in runs if ''.join(n.itertext()))
 return False
try:
 rapport['omvang']='Eigen native Linux-releasevenster in Xvfb/D-Bus/XDG. Writer-bestandsscherm openen, volledige beelden vóór/tijdens/na, Escape en daadwerkelijk systeemklembord. De zichtbaarheid van ribbon/bestandsscherm wordt afzonderlijk visueel beoordeeld; geen systeemdialoog of volledige suitegoedkeuring.'
 d=display.Display();open_venster(bron)
 stappen.append({'stap':'Eigen Writer-document geladen','beeld':beeld('bestand-voor')})
 klik(42,45);xd('mousemove','--sync',600,220);time.sleep(1)
 stappen.append({'stap':'Bestand eenmaal aangeklikt; volledig beeld voor afzonderlijke visuele beoordeling','beeld':beeld('bestand-open')})
 assert (uit/'bestand-open.png').read_bytes()!=(uit/'bestand-voor.png').read_bytes()
 sleutel('Escape');time.sleep(1)
 assert bron.read_bytes()==origineel
 stappen.append({'stap':'Escape uitgevoerd; volledige terugkeeropname en ongewijzigde bron','beeld':beeld('bestand-terug')})
 klik(430,367);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 café rechts')
 assert bron.read_bytes()==origineel
 stappen.append({'stap':'De herstelde documentpagina levert haar volledige rijke alineatekst aan het echte systeemklembord'})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Eigen venster schoon gesloten'});rapport['geslaagd']=True

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
