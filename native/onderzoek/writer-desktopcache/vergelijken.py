"""Vergelijk getekende tekst, broninhoud, beperkte documentpixels en RSS."""
import json
from PIL import Image,ImageChops
from voorbereiden import LOKAAL
namen=['referentie-a','cache-a','cache-b','referentie-b'];roi=(320,210,1140,950);cursor=(491,347,496,366);ref=None;metingen=[]
m=json.loads((LOKAAL/'gebouwd.json').read_text())
for naam in namen:
    root=LOKAAL/'gui'/naam;d=json.loads((root/'profiel.json').read_text())
    assert d['geslaagd']and d['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
    assert d['programma_sha256']==(m['referentie_sha256']if naam.startswith('referentie')else m['programma_sha256'])
    assert not any(d['fouten_voor'].values())and not any(d['fouten_na'].values())
    im=Image.open(root/'profiel.png').convert('RGB').crop(roi)
    im.paste((0,0,0),(cursor[0]-roi[0],cursor[1]-roi[1],cursor[2]-roi[0],cursor[3]-roi[1]));ref=ref if ref is not None else im.copy()
    diff=ImageChops.difference(ref,im);aantal=sum(p!=(0,0,0)for p in diff.getdata())
    rss=json.loads((LOKAAL/'gui'/(naam+'-rss.json')).read_text());native=[s['native_rss_kib']for s in rss['samples']if s['native_rss_kib']>0];assert native,'Geen native RSS gemeten'
    metingen.append({'naam':naam,'getekend_ms':d['getekende_tekst_ms'],'broncontrole':d['broncontrole'],'documentpixels':{'roi':roi,'alleen_cursor_uitgesloten':cursor,'afwijkend':aantal,'bbox':diff.getbbox()},'native_piek_rss_kib':max(native),'native_laatste_rss_kib':native[-1]})
oud=(metingen[0]['getekend_ms']+metingen[3]['getekend_ms'])/2;nieuw=(metingen[1]['getekend_ms']+metingen[2]['getekend_ms'])/2
r={'schema':1,'metingen':metingen,'gemiddeld_referentie_ms':oud,'gemiddeld_cache_ms':nieuw,'ratio':nieuw/oud,'alle_documentpixels_exact':all(x['documentpixels']['afwijkend']==0 for x in metingen),'grenzen':['Eén eigen bron/pc, vier fysieke ronden; geen algemene responsiviteits-/FPS-/suiteacceptatie.','Geen volledige UI-pixelpariteit: alleen de vastgelegde documentuitsnede, met uitsluitend de bekende cursorzone uitgesloten.','RSS is gesampled procesresident geheugen; geen PSS, harde cache-RAM-grens of lekbewijs.']}
(LOKAAL/'gui-vergelijking.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
assert r['alle_documentpixels_exact'],'Documentpixelverschil niet geaccepteerd'
