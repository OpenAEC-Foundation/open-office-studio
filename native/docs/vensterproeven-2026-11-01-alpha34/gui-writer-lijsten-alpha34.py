"""Werkelijke Writer-lijsten op een vastgezette release met uitsluitend eigen bestanden."""
from pathlib import Path
import os,sys,time,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-tekst.docx';origineel=subprocess.check_output(['git','show',sys.argv[3]+':native/crates/office-core/tests/fixtures/writer-structuur.docx']);bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.34 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':sys.argv[3],'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster in eigen Xvfb/D-Bus/XDG-sessie, X11-toetsen/muis en systeemklembord. Eigen DOCX met twee secties, tabel en rijke runs. Opsomming/nummering met directe vervolginvoer, Enter, lijst beëindigen, bewaren, afzonderlijke undo en heropenen. Geen fysieke hardware, andere platforms, IME, schermlezer of volledige suite-/pixelpariteit.','stappen':stappen}
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


def alinea(tekst):
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 return next((a for a in root.findall('w:body/w:p',ns) if ''.join(a.itertext())==tekst),None)
def lijst(tekst,soort):
 a=alinea(tekst)
 if a is None:return False
 n=a.find('w:pPr/w:numPr/w:numId',ns)
 if soort is None:return n is not None and n.get(uri+'val')=='0'
 if n is None or n.get(uri+'val')=='0':return False
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/numbering.xml'))
 num=next((v for v in root.findall('w:num',ns) if v.get(uri+'numId')==n.get(uri+'val')),None)
 if num is None:return False
 abstract=num.find('w:abstractNumId',ns).get(uri+'val')
 a=next(v for v in root.findall('w:abstractNum',ns) if v.get(uri+'abstractNumId')==abstract)
 return a.find('w:lvl/w:numFmt',ns).get(uri+'val')==soort and klopt(tekst,'Andere sectie')
def aansluitend(tekst,soort):
 with zipfile.ZipFile(bron) as z:root=ET.fromstring(z.read('word/document.xml'))
 kinderen=list(root.find('w:body',ns))
 for i,a in enumerate(kinderen[:-2]):
  if a.tag==uri+'p' and ''.join(a.itertext())=='Links 🏠 café rechts':
   b,c=kinderen[i+1:i+3]
   return b.tag==uri+'p' and ''.join(b.itertext())==tekst and c.tag==uri+'tbl' and lijst(tekst,soort)
 return False

def zet_cursor():
 klik(430,367);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 café rechts')
 sleutel('Home',*(['Right']*8),'shift+Home','ctrl+c');klembord('Links 🏠 ');sleutel('Right')

def noteer(tekst,naam=None):
 st={'stap':tekst}
 if naam:st['beeld']=beeld(naam)
 stappen.append(st)

try:
 d=display.Display();open_venster(bron)
 noteer('Eigen document geopend','lijsten-open')
 zet_cursor();assert bron.read_bytes()==origineel
 for naam,x,soort in [('opsomming',462,'bullet'),('nummering',491,'decimal')]:
  xd('mousemove','--sync',x,105);xd('click',1);xd('type','--clearmodifiers','--delay','0','9');sleutel('ctrl+s')
  wacht(lambda:lijst('Links 🏠 9café rechts',soort))
  (uit/(naam+'-direct.docx')).write_bytes(bron.read_bytes())
  noteer('Echte '+naam+'klik, directe 9 en één bewaren','lijsten-'+naam)
  sleutel('ctrl+z','ctrl+s');wacht(lambda:lijst('Links 🏠 café rechts',soort))
  noteer('Eén undo verwijdert alleen de 9; '+naam+' blijft')
  sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
  noteer('Volgende undo herstelt de oorspronkelijke bron exact')
  zet_cursor()
 # Start een nummering; vervolg de bestaande alineacursor met Enter/9 zonder
 # tussentijdse refocus, tweede bewaarpoging of synthetische toepassingsopdracht.
 xd('mousemove','--sync',491,105);xd('click',1);sleutel('End','Return');xd('type','--clearmodifiers','--delay','0','9');sleutel('ctrl+s')
 wacht(lambda:lijst('Links 🏠 café rechts','decimal') and aansluitend('9','decimal'))
 (uit/'nummering-enter-negen.docx').write_bytes(bron.read_bytes());noteer('Nummering, directe End/Enter/9 en één bewaren maken een volgend lijstitem','lijsten-enter-negen')
 sleutel('ctrl+z','ctrl+s');wacht(lambda:aansluitend('','decimal'));leeg=bron.read_bytes()
 noteer('Eén undo laat een leeg tweede lijstitem staan')
 sleutel('Return','ctrl+s');wacht(lambda:aansluitend('',None))
 (uit/'nummering-beeindigd.docx').write_bytes(bron.read_bytes());noteer('Enter beëindigt het lege tweede item zonder extra alinea','lijsten-beeindigd')
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==leeg);noteer('Eén undo herstelt de lege lijstbron exact')
 sleutel('ctrl+z','ctrl+s');wacht(lambda:lijst('Links 🏠 café rechts','decimal') and alinea('9') is None and not aansluitend('','decimal'))
 noteer('Volgende undo verwijdert uitsluitend het nieuwe lijstitem')
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel);noteer('Volgende undo herstelt het volledige oorspronkelijke document exact')
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0;noteer('Eigen bronvenster schoon gesloten')
 bewaard=uit/'nummering-direct.docx';bewaard_hash=hashlib.sha256(bewaard.read_bytes()).hexdigest()
 open_venster(bewaard);klik(490,367);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 9café rechts')
 assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash;noteer('Bewaarde nummering heropend; volledige tekst via systeemklembord bevestigd')
 for i in range(3):
  time.sleep(4 if i==0 else 2)
  assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash
  noteer('Afzonderlijk rustig heropenbeeld '+str(i+1),'lijsten-rustig-'+str(i+1))
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0;noteer('Heropend venster schoon gesloten');rapport['geslaagd']=True

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
