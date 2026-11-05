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
module=sys.argv[1];naam={'writer':'Ontwerpnotitie.docx','spreadsheet':'Materiaaloverzicht.xlsx','presentation':'Ontwerpvisie.pptx','notition':'Notitieboek.json'}[module];bron=uit/naam;bron.write_bytes(subprocess.check_output(['git','show',('4cb1ddc:docs/voorbeelden/'+naam if module=='notition' else 'v2026.44.8:docs/voorbeelden/'+naam)]));origineel=bron.read_bytes()
e=os.environ.copy();e['APPDIR']=str(appdir);e['APPIMAGE']=str(w/'legacy-release-v44.8/Open.Office.Studio_2026.44.8_amd64.AppImage');e['GDK_BACKEND']='x11';e['XDG_SESSION_TYPE']='x11';e['GTK_THEME']='Adwaita:dark';e['WEBKIT_DISABLE_DMABUF_RENDERER']='1';e['WEBKIT_DISABLE_COMPOSITING_MODE']='1'
programma=appdir/'AppRun';log=(uit/'programma.log').open('w');d=None;p=None;metingen=[]
def xd(*a):
 if a[:2]==('mousemove','--sync'):
  positie=d.screen().root.query_pointer()
  if (positie.root_x,positie.root_y)==(int(a[-2]),int(a[-1])):a=(a[0],*a[2:])
 subprocess.run(['xdotool',*map(str,a)],env=e,stdout=log,stderr=log,check=True,timeout=10)
def scherm(naam):
 raw=d.screen().root.get_image(0,0,1058,892,X.ZPixmap,0xffffffff);im=Image.frombytes('RGB',(1058,892),raw.data,'raw','BGRX');im.save(uit/(naam+'.png'));return im
rapport={'geslaagd':False,'referentie_goedgekeurd':False,'omvang':'Aanvullende oorspronkelijke Linux-desktopopname; geen vervanging van bestaande webreferenties of goedkeuring van native pixelpariteit. Eigen XDG-mappen vóór eigen sessie-D-Bus ingesteld; afzonderlijk Xvfb. Het uitgepakte geverifieerde AppImage via zijn eigen AppRun gestart.','weergaveomgeving':{'WEBKIT_DISABLE_DMABUF_RENDERER':'1','WEBKIT_DISABLE_COMPOSITING_MODE':'1'},'voorkeuren':voorkeuren,'appimage':json.loads((w/'legacy-release-v44.8/herkomst.json').read_text()),'programma_sha256':hashlib.sha256((appdir/'usr/bin/open-office-studio').read_bytes()).hexdigest(),'acties':metingen}
try:
 p=subprocess.Popen([str(programma)]+([] if module=='notition' else [str(bron)]),env=e,cwd=appdir,stdout=log,stderr=subprocess.STDOUT);d=display.Display();venster=None
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
 time.sleep(8);scherm(module+'-voor-bediening');(uit/'gereed.json').write_text(json.dumps({'fase':'geopend','pid':p.pid}))
 rapport['module']=module;rapport['omvang']='Aanvullende oorspronkelijke Linux-desktopbeelden in eigen Xvfb/D-Bus/XDG-sessie. Waargenomen GUI bediend met X11; geen vervanging van de vaste webreferenties of native pixelgoedkeuring.'
 klaar=False;gezien=set();einde=time.monotonic()+1200
 while not klaar:
  assert p.poll() is None;assert time.monotonic()<einde
  for opdracht in sorted(uit.glob('*.actie.json')):
   if opdracht.name in gezien:continue
   actie=json.loads(opdracht.read_text());gezien.add(opdracht.name)
   for args in actie.get('x11',[]):xd(*args)
   time.sleep(actie.get('wacht',2));scherm(module+'-'+opdracht.stem)
   if actie.get('afronden'):
    xd('mousemove','--sync',0,0);time.sleep(2)
    for _ in range(8):
     a=scherm(module+'-kandidaat');time.sleep(1.2);b=scherm(module+'-kandidaat-herhaald')
     if a.tobytes()==b.tobytes():break
     time.sleep(1)
    rapport.update({'geslaagd':True,'opnamen_identiek':a.tobytes()==b.tobytes(),'bron_ongewijzigd':bron.read_bytes()==origineel,'bron_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'voorkeuren_na_start':json.loads((config/'voorkeuren.json').read_text()),'beelden':{n.name:hashlib.sha256(n.read_bytes()).hexdigest() for n in sorted(uit.glob('*.png'))}})
    assert bron.read_bytes()==origineel and a.tobytes()==b.tobytes();klaar=True
   metingen.append({'opdracht':opdracht.name,**actie});(uit/'gereed.json').write_text(json.dumps({'fase':'afgehandeld','opdracht':opdracht.name}))
  time.sleep(.2)
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
