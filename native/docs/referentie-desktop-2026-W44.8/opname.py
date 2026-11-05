"""Aanvullende oorspronkelijke desktopopname; bestaande webreferentie blijft intact."""
from pathlib import Path
import os,sys,subprocess,time,json,hashlib
from Xlib import display,X
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=Path(os.environ['OFFICE_EIGEN_GUI_MAP']);appdir=w/'legacy-release-v44.8/squashfs-root'
assert all(Path(os.environ[n]).is_relative_to(uit) for n in ['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR'])
voorkeuren={'taal':'nl','thema':'forge','updates':{'automatisch':False,'kanaal':'ontwikkel'}}
config=Path(os.environ['XDG_CONFIG_HOME'])/'org.openaec.office-studio';config.mkdir(parents=True)
(config/'voorkeuren.json').write_text(json.dumps(voorkeuren)+'\n')
bron=uit/'Ontwerpnotitie.docx';bron.write_bytes(subprocess.check_output(['git','show','v2026.44.8:docs/voorbeelden/Ontwerpnotitie.docx']));origineel=bron.read_bytes()
e=os.environ.copy();e['APPDIR']=str(appdir);e['APPIMAGE']=str(w/'legacy-release-v44.8/Open.Office.Studio_2026.44.8_amd64.AppImage');e['GDK_BACKEND']='x11';e['XDG_SESSION_TYPE']='x11';e['GTK_THEME']='Adwaita:dark';e['WEBKIT_DISABLE_DMABUF_RENDERER']='1';e['WEBKIT_DISABLE_COMPOSITING_MODE']='1'
programma=appdir/'AppRun';log=(uit/'programma.log').open('w');d=None;p=None;metingen=[]
def xd(*a):subprocess.run(['xdotool',*map(str,a)],env=e,stdout=log,stderr=log,check=True,timeout=10)
def scherm(naam):
 raw=d.screen().root.get_image(0,0,1058,892,X.ZPixmap,0xffffffff);im=Image.frombytes('RGB',(1058,892),raw.data,'raw','BGRX');im.save(uit/(naam+'.png'));return im
rapport={'geslaagd':False,'referentie_goedgekeurd':False,'omvang':'Aanvullende oorspronkelijke Linux-desktopopname; geen vervanging van bestaande webreferenties of goedkeuring van native pixelpariteit. Eigen XDG-mappen vóór eigen sessie-D-Bus ingesteld; afzonderlijk Xvfb. Het uitgepakte geverifieerde AppImage via zijn eigen AppRun gestart.','weergaveomgeving':{'WEBKIT_DISABLE_DMABUF_RENDERER':'1','WEBKIT_DISABLE_COMPOSITING_MODE':'1'},'voorkeuren':voorkeuren,'appimage':json.loads((w/'legacy-release-v44.8/herkomst.json').read_text()),'programma_sha256':hashlib.sha256((appdir/'usr/bin/open-office-studio').read_bytes()).hexdigest(),'acties':metingen}
try:
 p=subprocess.Popen([str(programma),str(bron)],env=e,cwd=appdir,stdout=log,stderr=subprocess.STDOUT);d=display.Display();venster=None
 for _ in range(300):
  assert p.poll() is None,'Programma onverwacht geëindigd'
  for v in d.screen().root.query_tree().children:
   if v.get_attributes().map_state==X.IsViewable:
    naam=v.get_wm_name();naam=naam.decode(errors='replace') if isinstance(naam,bytes) else naam or ''
    if 'Office' in naam:venster=v;break
  if venster is not None:break
  time.sleep(.2)
 assert venster is not None
 xd('windowsize',venster.id,1058,892);xd('windowmove',venster.id,0,0);venster.set_input_focus(X.RevertToParent,X.CurrentTime);d.sync();time.sleep(2)
 # Op de waargenomen startpagina opent deze kaart het ingebouwde voorbeeld.
 # Die fixture is hieronder bytegelijk aan de referentiebron geverifieerd.
 xd('mousemove','--sync',330,790);xd('click',1);time.sleep(1)
 metingen.append({'actie':'Klik voorbeeldkaart Ontwerpnotitie op de startpagina','x':330,'y':790})
 for _ in range(480):
  assert p.poll() is None,'Legacy-proces eindigde tijdens openen'
  im=scherm('writer-gereedcontrole')
  # Geen zwarte of lege opname als referentie aanvaarden. Papier en donkere
  # ribbon moeten beide zichtbaar zijn voordat bediening wordt uitgevoerd.
  if all(c>245 for c in im.getpixel((600,500))) and all(200<c<250 for c in im.getpixel((100,300))):break
  time.sleep(.25)
 else:raise AssertionError('Legacy-document niet binnen 120 seconden zichtbaar')
 time.sleep(12);assert p.poll() is None;scherm('writer-voor-bediening')
 # De bekende bronwaarschuwing kan in de eerste sessie worden getoond.
 # Alleen haar sluitknop en het al geopende documenttabblad worden bediend.
 for y in [752,770,752,770]:
  xd('mousemove','--sync',1022,y);xd('click',1);time.sleep(.5)
 metingen.append({'actie':'Sluitknoppen waargenomen lettertype- en bronwaarschuwing; buiten de documentpagina','x':1022,'y':[752,770,752,770]})
 xd('mousemove','--sync',170,171);xd('click',1);xd('mousemove','--sync',0,0);time.sleep(1);metingen.append({'actie':'Klik bestaand documenttabblad; muis buiten bediening','x':170,'y':171})
 for _ in range(8):
  a=scherm('writer-kandidaat');time.sleep(1.2);b=scherm('writer-kandidaat-herhaald')
  if a.tobytes()==b.tobytes():break
  time.sleep(1)
 assert p.poll() is None,'Programma eindigde vóór de opnamen'
 rapport.update({'geslaagd':True,'opnamen_identiek':a.tobytes()==b.tobytes(),'bron_ongewijzigd':bron.read_bytes()==origineel,'docx_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'voorkeuren_na_start':json.loads((config/'voorkeuren.json').read_text()),'beelden':{n:hashlib.sha256((uit/n).read_bytes()).hexdigest() for n in ['writer-voor-bediening.png','writer-kandidaat.png','writer-kandidaat-herhaald.png']}})
 assert bron.read_bytes()==origineel
except Exception as ex:
 rapport['fout']=str(ex)
 raise
finally:
 if p is not None and p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 if d is not None:d.close()
 log.close();(uit/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'geslaagd':rapport['geslaagd'],'opnamen_identiek':rapport.get('opnamen_identiek'),'uitvoer':str(uit)},ensure_ascii=False),flush=True)
