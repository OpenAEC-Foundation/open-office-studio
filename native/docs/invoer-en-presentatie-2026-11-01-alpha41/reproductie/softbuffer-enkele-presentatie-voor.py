from pathlib import Path
from Xlib import display,X
from PIL import Image
import subprocess,sys,time,json,select,hashlib
r=Path.cwd();w=r/'.local/controle-2026-10-31';out=w/'softbuffer-enkele-presentatie-voor-uitvoer';out.mkdir();subprocess.run(['dbus-update-activation-environment','DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'],check=True);log=(out/'programma.log').open('wb');p=subprocess.Popen([str(w/'softbuffer-enkele-presentatie-voor')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True);d=None
try:
 assert select.select([p.stdout],[],[],10)[0];regel=p.stdout.readline().strip();assert regel.startswith('gepresenteerd '),regel;id=int(regel.split()[1]);d=display.Display();v=d.create_resource_object('window',id)
 def beeld(naam):
  time.sleep(1);raw=v.get_image(0,0,120,80,X.ZPixmap,0xffffffff);im=Image.frombytes('RGB',(120,80),raw.data,'raw','BGRX');pad=out/(naam+'.png');im.save(pad);return {'bestand':pad.name,'sha256':hashlib.sha256(pad.read_bytes()).hexdigest(),'middenpixel':list(im.getpixel((60,40))),'alle_pixels_verwacht':len(set(im.getdata()))==1 and im.getpixel((60,40))==(255,0,128)}
 eerste=beeld('na-een-presentatie');p.stdin.write('\n');p.stdin.flush();assert select.select([p.stdout],[],[],10)[0];assert p.stdout.readline().strip()=='verzonden';tweede=beeld('na-uitsluitend-verzenden');assert tweede['alle_pixels_verwacht'];p.stdin.write('\n');p.stdin.flush();code=p.wait(timeout=10);assert code==0
 rapport={'omvang':'Afzonderlijke X11-/softbufferdiagnose buiten de suite. Eigen apart scherm; één vlakke kleur wordt één keer gepresenteerd. De tweede stap verstuurt uitsluitend de reeds bestaande XCB-verzoeken: geen nieuwe tekenronde of invoer. Geen gewone werkruimtetest of suitegoedkeuring.','verwachte_kleur':[255,0,128],'eerste_presentatie_geslaagd':eerste['alle_pixels_verwacht'],'eerste':eerste,'na_explicit_flush':tweede,'programma_eindcode':code};(out/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rapport,ensure_ascii=False),flush=True)
finally:
 if p.poll() is None:p.kill();p.wait()
 if d:d.close()
 log.close()
raise SystemExit(0 if eerste['alle_pixels_verwacht'] else 1)
