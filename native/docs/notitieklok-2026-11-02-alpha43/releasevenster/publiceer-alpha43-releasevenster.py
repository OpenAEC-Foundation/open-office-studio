from pathlib import Path
import hashlib,json,gzip
r=Path.cwd();w=r/'.local/controle-2026-10-31';g=w/'gui-alpha43-release-sluitsneltoets';v=json.loads((g/'bron-en-bedieningscontrole.json').read_text());assert v['stappen']==16 and v['brongegevens_bytegelijk'];u=r/'native/docs/notitieklok-2026-11-02-alpha43/releasevenster';u.mkdir();items=[]
def kopie(p,naam=None):
 raw=p.read_bytes();q=u/(naam or p.name);gz=p.suffix in ['.log','.patch'];q=q.with_name(q.name+'.gz') if gz else q;assert not q.exists();q.write_bytes(gzip.compress(raw,mtime=0) if gz else raw);assert (gzip.decompress(q.read_bytes()) if gz else q.read_bytes())==raw;items.append({'bron':str(p.relative_to(r)),'bestand':q.name,'bron_sha256':hashlib.sha256(raw).hexdigest(),'opgeslagen_sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
for p in sorted(g.iterdir()):
 if p.is_file():kopie(p)
for n in ['controleer-alpha43-release-sluitsneltoets.py','gui-alpha43-release-sluitsneltoets.py','venster-alpha43-release-sluitsneltoets.py','native-alpha43-release-sluitsneltoets-terminal.log','native-alpha43-ci-linux-freeze-eerste-afkeuring.json','publiceer-alpha43-releasevenster.py']:kopie(w/n)
kopie(w/'native-alpha43-ci-linux-vast/herkomst.json','releaseprogramma-herkomst.json')
(u/'bewijskopieen.json').write_text(json.dumps({'omvang':'Werkelijke geoptimaliseerde Linux-CI-build van alpha43, 16 gerichte vensterstappen. Bronnen en PNGs verliesloos overgenomen. De volledige platformronde is bij deze proef nog niet afgesloten. Geen volledige suite-/pixel-, fysieke platform- of installatiegoedkeuring.','kopieen':items},ensure_ascii=False,indent=2)+'\n')
(u/'LEESMIJ.md').write_text('''# Geoptimaliseerde Linux-releaseproef alpha43

De daadwerkelijke Linux-build uit CI-ronde 41378899366 voert zestien eigen vensterstappen uit. Ctrl+W sluit de opgeslagen notitie met focus in de titel. Een nieuwe notitie toont 2 november; de werkelijk getypte titel geeft een sluitvraag. Annuleren behoudt de invoer. Niet opslaan sluit uitsluitend het eigen proefconcept. De oorspronkelijke opgeslagen bron blijft bytegelijk.

GUI en helper zijn vóór gebruik afzonderlijk op versie en SHA-256 gecontroleerd en als onveranderlijke kopieën bewaard. Alle 730 verpakte bestanden uit het lokale geteste bronmanifest zijn exact gelijk. De CI-workflow zelf is bewust geen onderdeel van de pakketbron; een eerste controleopstelling verwachtte die ten onrechte wel en is als afkeuring bewaard. De volledige platformvergelijking is bij deze vensterproef nog niet afgesloten.

Het venster draait in eigen Xvfb, D-Bus en XDG-mappen. De bestaande statusbalkfout na het laatste document blijft zichtbaar in deze alpha43-build; alpha44 corrigeert die afzonderlijk. Dit is geen volledige functionaliteits-, pixel-, fysieke Windows/macOS- of installatiegoedkeuring.

Alle oorspronkelijke beelden, de ruwe terminaluitvoer en de exacte proefcode staan in [het verliesloze register](bewijskopieen.json).
''');print({'verliesloze_bewijzen':len(items),'stappen':16})
