"""Gerichte native Writer-vensterproef in een afzonderlijke Xvfb-sessie."""
from pathlib import Path
import os,sys,time,subprocess,json,shutil,hashlib,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
root=Path.cwd();werk=root/'.local/controle-2026-10-31';uit=werk/sys.argv[2];uit.mkdir()
programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-vensterproef.docx'
origineel=(root/'native/crates/office-core/tests/fixtures/writer-structuur.docx').read_bytes();bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip()
assert versie=='Open Office Studio 2026.44.9-alpha.17 (native)',versie
env=os.environ.copy()
for sleutel,mapnaam in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache')]:
 env[sleutel]=str(uit/mapnaam);Path(env[sleutel]).mkdir()
env['WINIT_UNIX_BACKEND']='x11'
log=(uit/'programma.log').open('w');p=None;metingen=[];d=None
bronpaden=sorted((root/'native/crates').rglob('*.rs'))+[root/'native/Cargo.toml',root/'native/Cargo.lock']
bronhashes={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in bronpaden}
rapport={'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'bronbestanden':bronhashes,'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'bouwprofiel':'debug','omvang':'Echt native Linux-venster, X11-invoer, systeemklembord en bewaren in een eigen Xvfb- en D-Bus-sessie. Eigen synthetische bron, geen fysieke hardware, andere platforms, IME-compositie of systeemdialoogproef.','geslaagd':False,'stappen':metingen}
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+NS['w']+'}'
def alineas():
 with zipfile.ZipFile(bron) as z:r=ET.fromstring(z.read('word/document.xml'))
 return r.findall('w:body/w:p',NS)
def tekst(p):return ''.join(n.text or '' for n in p.iter(W+'t'))
def xd(*args):return subprocess.check_output(['xdotool',*map(str,args)],env=env,text=True,stderr=log,timeout=10).strip()
def klik(x,y):xd('mousemove','--sync',x,y);time.sleep(.3);xd('click',1);time.sleep(.5)
def toets(*args):xd('key','--clearmodifiers',*args);time.sleep(.5)
def beeld(naam):
 scherm=d.screen();raw=scherm.root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff)
 pad=uit/(naam+'.png');Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX').save(pad)
 return {'bestand':pad.name,'sha256':hashlib.sha256(pad.read_bytes()).hexdigest()}
def bewaar_tot(goed):
 eind=time.monotonic()+40
 while time.monotonic()<eind:
  assert p.poll() is None,'Het programma is afgesloten'
  toets('ctrl+s')
  try:
   if goed():return
  except (OSError,zipfile.BadZipFile,ET.ParseError):pass
  time.sleep(.3)
 raise AssertionError('Verwachte opgeslagen bron niet bereikt')
def opmaak_rijk():
 para=alineas()[1];letters=[]
 for run in para.findall('w:r',NS):
  def actief(naam):
   n=run.find('w:rPr/w:'+naam,NS)
   return n is not None and n.get(W+'val','1') not in ['0','false','off']
  letters.extend((c,actief('b'),actief('i')) for c in tekst(run))
 assert ''.join(c for c,_,_ in letters)=='?Links 🏠 café rechts!'
 assert all(b and not i for _,b,i in letters[1:9])
 assert all(not b and i for _,b,i in letters[9:20])
 return True
def framepixel(x,y):
 raw=d.screen().root.get_image(x,y,1,1,X.ZPixmap,0xffffffff)
 return Image.frombytes('RGB',(1,1),raw.data,'raw','BGRX').getpixel((0,0))
def oranje(kleur):
 r,g,b=kleur;return r>170 and 40<g<180 and b<120 and r>g+40
def focus_editor():
 klik(1220,298)
 for _ in range(150):
  if oranje(framepixel(1154,300)):return
  time.sleep(.1)
 raise AssertionError('De aangeklikte eigen teksteditor krijgt geen zichtbare focus')
def wacht_kopie(verwacht):
 toets('ctrl+c');laatste=''
 for _ in range(150):
  r=subprocess.run(['xclip','-selection','clipboard','-target','UTF8_STRING','-out'],env=env,text=True,capture_output=True,timeout=5)
  laatste=r.stdout
  if r.returncode==0 and laatste==verwacht:return laatste
  time.sleep(.1)
 raise AssertionError('Systeemklembord wordt niet de geselecteerde tekst: '+repr(laatste))
def bevestig():
 for _ in range(150):
  if oranje(framepixel(1255,486)):break
  time.sleep(.1)
 else:raise AssertionError('Toepassen wordt niet actief na de echte invoer')
 klik(1208,486)
 for _ in range(150):
  if not oranje(framepixel(1255,486)):return
  time.sleep(.1)
 raise AssertionError('De aangeklikte Toepassen-knop verwerkt de invoer niet')
try:
 p=subprocess.Popen([str(programma),str(bron)],env=env,stdout=log,stderr=subprocess.STDOUT)
 d=display.Display();venster=None
 for i in range(300):
  assert p.poll() is None,'Geen blijvend native proces'
  kandidaten=[w for w in d.screen().root.query_tree().children if w.get_wm_name()=='Open Office Studio' and w.get_attributes().map_state==X.IsViewable]
  if kandidaten:venster=kandidaten[0];break
  time.sleep(.2)
 assert venster is not None,'Geen native venster gevonden'
 assert (d.screen().width_in_pixels,d.screen().height_in_pixels)==(1440,900)
 time.sleep(3);venster.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();time.sleep(.2)
 assert d.get_input_focus().focus.id==venster.id,'Het eigen venster heeft geen invoerfocus'
 # Wacht op het werkelijk opgebouwde document en de eigen editor; geen vaste
 # vertraging die onder gelijktijdige bouwbelasting te vroeg kan aflopen.
 start=time.monotonic()
 for _ in range(480):
  assert p.poll() is None,'Proces eindigde tijdens openen'
  raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff)
  frame=Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX')
  if all(220<c<250 for c in frame.getpixel((1140,300))) and all(c>225 for c in frame.getpixel((1200,486))) and all(90<c<190 for c in frame.getpixel((1154,550))):break
  time.sleep(.25)
 else:raise AssertionError('Document/editor binnen 120 seconden niet gereed')
 rapport['openen_onder_testbelasting_seconden']=round(time.monotonic()-start,3)
 beginrand=frame.getpixel((1140,300))
 metingen.append({'stap':'Openen eigen DOCX','beeld':beeld('writer-open')})
 # Kies de rijke alinea op de echte pagina en wijzig beide uiteinden.
 klik(440,370);time.sleep(1);focus_editor();toets('ctrl+a');
 rapport['clipboard_eigenaar_na_kopieren']=getattr(d.get_selection_owner(d.intern_atom('CLIPBOARD')),'id',None)
 metingen.append({'stap':'Diagnostische selectie vóór invoegen','beeld':beeld('writer-selectie')})
 gekozen=wacht_kopie('Links 🏠 café rechts')
 assert gekozen=='Links 🏠 café rechts',repr(gekozen)
 toets('ctrl+End');xd('type','--clearmodifiers','--','!');toets('ctrl+Home');xd('type','--clearmodifiers','--','?');bevestig()
 bewaar_tot(lambda:tekst(alineas()[1])=='?Links 🏠 café rechts!');opmaak_rijk()
 metingen.append({'stap':'Twee invoegingen en toepassen/bewaren; vette en cursieve middentekst onafhankelijk via XML gecontroleerd','bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'beeld':beeld('writer-reeks')})
 # Lees de echte X11-clipboard na Ctrl+C en plak vervolgens eigen Unicode-tekst.
 klik(1220,550);time.sleep(4);focus_editor();toets('ctrl+a')
 kopie=wacht_kopie('Voor de rijke alinea')
 assert kopie=='Voor de rijke alinea',repr(kopie)
 nieuw='Eigen klembord 🏠 café'
 subprocess.run(['xclip','-selection','clipboard','-target','UTF8_STRING','-in'],input=nieuw.encode(),env=env,stdout=subprocess.DEVNULL,stderr=log,check=True,timeout=10)
 toets('ctrl+v');bevestig()
 bewaar_tot(lambda:tekst(alineas()[0])==nieuw);opmaak_rijk()
 metingen.append({'stap':'Systeemklembord kopiëren/plakken en bewaren','gekopieerde_tekst':kopie,'bewaarde_tekst':nieuw,'beeld':beeld('writer-klembord')})
 toets('ctrl+z');bewaar_tot(lambda:tekst(alineas()[0])=='Voor de rijke alinea');opmaak_rijk()
 toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 metingen.append({'stap':'Twee afzonderlijke undo-stappen en bewaren herstellen exact de oorspronkelijke bronbytes','bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest()})
 klik(42,45)
 for _ in range(100):
  raw=d.screen().root.get_image(0,0,1440,900,X.ZPixmap,0xffffffff)
  frame=Image.frombytes('RGB',(1440,900),raw.data,'raw','BGRX')
  if all(frame.getpixel(p)==(255,255,255) for p in [(1140,300),(190,250),(455,76)]):break
  time.sleep(.1)
 else:raise AssertionError('Bestand-werkvlak is na de klik niet zichtbaar; ribbon/document blijven in beeld')
 metingen.append({'stap':'Bestand-werkvlak na muisklik zichtbaar; document en ribbon afwezig','beeld':beeld('writer-bestand')})
 toets('Escape')
 for _ in range(100):
  raw=d.screen().root.get_image(1140,300,1,1,X.ZPixmap,0xffffffff)
  if Image.frombytes('RGB',(1,1),raw.data,'raw','BGRX').getpixel((0,0))==beginrand:break
  time.sleep(.1)
 else:raise AssertionError('Documentwerkvlak keert niet terug na Escape')
 # Eigen venster sluiten met de echte vensterknop; er is niets onbewaard.
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0,p.returncode
 metingen.append({'stap':'Eigen venster via sluitknop gesloten','procescode':p.returncode})
 assert bronhashes=={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in bronpaden},'Rust-bron wijzigde tijdens de vensterproef'
 rapport['geslaagd']=True
except Exception as e:
 rapport['fout']=str(e)
 if d is not None:
  try:rapport['foutbeeld']=beeld('writer-fout')
  except Exception:pass
 raise
finally:
 if p is not None and p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
 (uit/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'geslaagd':rapport['geslaagd'],'uitvoer':str(uit)},ensure_ascii=False),flush=True)
