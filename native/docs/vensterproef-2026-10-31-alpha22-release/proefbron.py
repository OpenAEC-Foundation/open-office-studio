"""Gerichte native Writer-vensterproef in een afzonderlijke Xvfb-sessie."""
from pathlib import Path
import os,sys,time,subprocess,json,shutil,hashlib,zipfile,xml.etree.ElementTree as ET
from Xlib import display,X
from PIL import Image
root=Path("/home/aia01/Documenten/GitHub/Open-Office-Studio/.local/controle-2026-10-31/bron-alpha22");werk=Path.cwd()/'.local/controle-2026-10-31';uit=werk/sys.argv[2];uit.mkdir()
programma=Path(sys.argv[1]).resolve();bron=uit/'Eigen-vensterproef.docx'
origineel=(root/'native/crates/office-core/tests/fixtures/writer-cachepaginas.docx').read_bytes();bron.write_bytes(origineel)
versie=subprocess.check_output([str(programma),'--version'],text=True).strip()
assert versie=='Open Office Studio 2026.44.9-alpha.22 (native)',versie
env=os.environ.copy()
env['WINIT_UNIX_BACKEND']='x11'
log=(uit/'programma.log').open('w');p=None;metingen=[];d=None
bronpaden=sorted((root/'native/crates').rglob('*.rs'))+[root/'native/Cargo.toml',root/'native/Cargo.lock']
bronhashes={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in bronpaden}
rapport={'proefbron_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'bronbestanden':bronhashes,'versie':versie,'programma_sha256':hashlib.sha256(programma.read_bytes()).hexdigest(),'bouwprofiel':'release','omvang':'Echt native Linux-venster, X11-invoer, systeemklembord en bewaren in een eigen Xvfb- en D-Bus-sessie. Eigen synthetische bron, geen fysieke hardware, andere platforms, IME-compositie of systeemdialoogproef.','geslaagd':False,'stappen':metingen}
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
  if all(220<c<250 for c in frame.getpixel((1140,300))) and all(c>245 for c in frame.getpixel((650,500))):break
  time.sleep(.25)
 else:raise AssertionError('Document/editor binnen 120 seconden niet gereed')
 rapport['openen_onder_testbelasting_seconden']=round(time.monotonic()-start,3)
 metingen.append({'stap':'Zespagina-bron geopend in eigen native venster','beeld':beeld('writer-open')})
 klik(445,336)
 def controleer(n):
  xd('key','--clearmodifiers','--delay','0','Home','shift+End');time.sleep(.3)
  verwacht=f'Eigen cachepagina {n} met café en 🏠.'
  assert wacht_kopie(verwacht)==verwacht
  assert bron.read_bytes()==origineel
  metingen.append({'stap':f'Werkelijke pagina {n+1}, Home/Shift+End en Unicode-systeemklembord','tekst':verwacht})
 controleer(0)
 for n in range(1,6):
  toets('Down');controleer(n)
 metingen[-1]['beeld']=beeld('writer-zesde-pagina')
 for n in range(4,-1,-1):
  toets('Up');controleer(n)
 # De volgende toetsen worden vóór herberekening als één X11-reeks verstuurd.
 xd('key','--clearmodifiers','--delay','0','Down','Down','Down');controleer(3)
 xd('key','--clearmodifiers','--delay','0','Up','Up');controleer(1)
 # Typen na navigatie bereikt uitsluitend het getoonde brondoel.
 xd('key','--clearmodifiers','--delay','0','End');xd('type','--clearmodifiers','--delay','0','!')
 verwacht='Eigen cachepagina 1 met café en 🏠.!'
 bewaar_tot(lambda:tekst(alineas()[1])==verwacht)
 for n,paar in enumerate(alineas()):
  assert tekst(paar)==(verwacht if n==1 else f'Eigen cachepagina {n} met café en 🏠.')
 metingen.append({'stap':'End en onmiddellijke invoer na snelle paginanavigatie bereiken uitsluitend alinea 2; bewaren via XML gecontroleerd','tekst':verwacht,'beeld':beeld('writer-navigatie-invoer')})
 toets('ctrl+z');bewaar_tot(lambda:bron.read_bytes()==origineel)
 metingen.append({'stap':'Undo herstelt de exacte oorspronkelijke DOCX-bron','bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest()})
 klik(42,45)
 for _ in range(100):
  if all(all(c>240 for c in framepixel(x,y)) for x,y in [(1140,300),(190,250),(455,76)]):break
  time.sleep(.1)
 else:raise AssertionError('Bestand dekt het document niet af')
 metingen.append({'stap':'Bestand staat boven de documentbediening','beeld':beeld('writer-bestand')})
 toets('Escape');assert bron.read_bytes()==origineel
 klik(1420,16);p.wait(timeout=15);assert p.returncode==0,p.returncode
 metingen.append({'stap':'Bron intact en eigen venster schoon gesloten','procescode':p.returncode})
 assert bronhashes=={q.relative_to(root).as_posix():hashlib.sha256(q.read_bytes()).hexdigest() for q in bronpaden}
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
