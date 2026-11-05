"""Werkelijke Writer-alineatoetsen op een vastgezette release met uitsluitend eigen bestanden."""
from pathlib import Path
import os,sys,time,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/sys.argv[2];uit.mkdir();programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-tekst.docx';origineel=(w/'bron-alpha30/native/crates/office-core/tests/fixtures/writer-structuur.docx').read_bytes();bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.30 (native)'
e=os.environ.copy();e['WINIT_UNIX_BACKEND']='x11';log=(uit/'programma.log').open('w');p=None;d=None;stappen=[]
rapport={'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'broncommit':'c752341ab177ad4685dcd29abe71e687dcaf1292','proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'geslaagd':False,'omvang':'Echt native Linux-venster in eigen Xvfb/D-Bus/XDG-sessie, X11-toetsen/muis en systeemklembord. Eigen DOCX met twee secties, tabel en rijke runs. Geen fysieke hardware, andere platforms, IME, schermlezer of volledige suite-/pixelpariteit.','stappen':stappen}
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
def naar_splits():
 sleutel('Home',*(['Right']*8),'Return','ctrl+s');wacht(lambda:klopt('Links 🏠 ','café rechts'))
def herstel_samenvoeging(soort):
 sleutel('ctrl+z','ctrl+s');wacht(lambda:klopt('Links 🏠 ','café rechts'))
 stappen.append({'stap':soort+' met één undo en één bewaren terug naar de gesplitste bron'})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Alineasplitsing daarna met één undo en één bewaren bronexact hersteld'})
try:
 d=display.Display();open_venster(bron)
 stappen.append({'stap':'Eigen rijke DOCX met tabel en twee secties in het echte native venster geopend','beeld':beeld('writer-open')})
 klik(430,367);sleutel('Home','ctrl+a','ctrl+c');klembord('Links 🏠 café rechts');assert bron.read_bytes()==origineel
 stappen.append({'stap':'Echte paginaklik en systeemklembord bevestigen de bedoelde Unicode-alinea'})
 sleutel('Home',*(['Right']*8),'Return');xd('type','--clearmodifiers','--delay','0','7');sleutel('ctrl+s')
 wacht(lambda:klopt('Links 🏠 ','7café rechts'));time.sleep(.5)
 bewaard=uit/'Bewaarde-alinea.docx';bewaard.write_bytes(bron.read_bytes());bewaard_hash=hashlib.sha256(bewaard.read_bytes()).hexdigest()
 stappen.append({'stap':'Home/acht pijlen/Enter/7 en één bewaren zonder tussenpauzes maken een echte alinea met directe vervolgtekst','beeld':beeld('writer-enter-invoer')})
 sleutel('shift+Home','ctrl+c');klembord('7')
 stappen.append({'stap':'Shift+Home en systeemklembord bevestigen de cursor direct na 7 in de nieuwe alinea'})
 sleutel('ctrl+z','ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Twee directe undo-opdrachten en één bewaren herstellen de oorspronkelijke bronbytes'})
 naar_splits();stappen.append({'stap':'Nieuwe splitsing met één bewaren vastgelegd vóór Backspace'})
 sleutel('BackSpace','ctrl+s');wacht(lambda:inhoud()[0].count('Links 🏠 café rechts')==1)
 sleutel('shift+Home','ctrl+c');klembord('Links 🏠 ')
 stappen.append({'stap':'Backspace aan begin nieuwe alinea voegt werkelijk samen; klembord bevestigt cursor op de oorspronkelijke Unicode-grens','beeld':beeld('writer-backspace')})
 herstel_samenvoeging('Samenvoegen met Backspace')
 naar_splits();stappen.append({'stap':'Nieuwe splitsing met één bewaren vastgelegd vóór Delete'})
 sleutel('Up','End','Delete','ctrl+s');wacht(lambda:inhoud()[0].count('Links 🏠 café rechts')==1)
 sleutel('shift+Home','ctrl+c');klembord('Links 🏠 ')
 stappen.append({'stap':'Omhoog/End/Delete en één bewaren voegen de volgende alinea samen en behouden de oorspronkelijke grens','beeld':beeld('writer-delete')})
 herstel_samenvoeging('Samenvoegen met Delete')
 sleutel('Home',*(['Right']*8),'shift+Return','ctrl+s');wacht(lambda:'Links 🏠 \ncafé rechts' in inhoud()[0])
 stappen.append({'stap':'Shift+Enter blijft een zachte regelovergang binnen dezelfde alinea','beeld':beeld('writer-zachte-regel')})
 sleutel('ctrl+z','ctrl+s');wacht(lambda:bron.read_bytes()==origineel)
 stappen.append({'stap':'Zachte regelovergang met één undo en één bewaren bronexact hersteld'})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Eigen bronvenster schoon gesloten','procescode':p.returncode})
 open_venster(bewaard);klik(415,401);sleutel('Home','ctrl+a','ctrl+c');klembord('7café rechts')
 assert hashlib.sha256(bewaard.read_bytes()).hexdigest()==bewaard_hash
 stappen.append({'stap':'Bewaarde nieuwe alinea in een nieuw werkelijk venster opnieuw geopend en via systeemklembord exact gecontroleerd','beeld':beeld('writer-heropend')})
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0
 stappen.append({'stap':'Ook het heropende eigen venster schoon gesloten','procescode':p.returncode});rapport['geslaagd']=True
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
