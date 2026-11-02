from pathlib import Path
import hashlib,json,gzip,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';u=r/'native/docs/vensterbalk-2026-11-02-alpha44';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((w/'native-alpha44-hertest-testbron.json').read_text());st=json.loads((w/'native-alpha44-hertest-stapstatus.json').read_text());te=json.loads((w/'native-alpha44-hertest-terminalstatus.json').read_text());assert te['exitcode']==0 and st['inhoudelijk_afgerond'] and len(st['stappen'])==9 and all(s['exitcode']==0 for s in st['stappen']);assert len(m)==733
for n,h in m.items():assert sha(r/n)==h and hashlib.sha256(subprocess.check_output(['git','show',':'+n])).hexdigest()==h,n
assert json.loads((r/'native/docs/schermen-2026-11-02-alpha44.json').read_text())['reguliere_tests']==436
u.mkdir();items=[]
def kopie(p,rel):
 raw=p.read_bytes();q=u/rel;gz=p.suffix in ['.log','.patch'];q=q.with_name(q.name+'.gz') if gz else q;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(gzip.compress(raw,mtime=0) if gz else raw);assert (gzip.decompress(q.read_bytes()) if gz else q.read_bytes())==raw;items.append({'bron':p.relative_to(r).as_posix(),'bestand':q.relative_to(u).as_posix(),'bron_sha256':hashlib.sha256(raw).hexdigest(),'opgeslagen_sha256':sha(q)})
for p in sorted(w.glob('native-alpha44-*')):
 if p.is_file() and p.suffix in ['.json','.patch','.log']:kopie(p,Path('ruw')/p.name)
for n in ['start-alpha44-hertest.py','controle-alpha44-hertest.py','bevries-alpha44-debug.py','finaliseer-alpha44-hertest.py','controleer-alpha44-venster.py','controleer-alpha44-venster-eerste.py','publiceer-alpha44-controle.py','werk-alpha44-documentatie-bij.py','ruim-oude-eigen-cache-alpha44-venster.py','opruiming-oude-eigen-cache-voor-alpha44-venster.json']:
 kopie(w/n,Path('proefcode')/n)
for n in ['gui-alpha44-vensterbalk','gui-alpha44-vensterbalk-v2','gui-alpha44-vensterbalk-v3']:
 for p in sorted((w/n).iterdir()):
  if p.is_file():kopie(p,Path('vensters')/n/p.name)
for n in ['gui-alpha44-vensterbalk.py','gui-alpha44-vensterbalk-v2.py','gui-alpha44-vensterbalk-v3.py','venster-alpha44-vensterbalk.py','venster-alpha44-vensterbalk-v2.py','venster-alpha44-vensterbalk-v3.py']:
 kopie(w/n,Path('proefcode')/n)
kopie(w/'native-alpha44-debug-vast/herkomst.json',Path('debugprogramma-herkomst.json'))
(u/'bewijskopieen.json').write_text(json.dumps({'omvang':'Volledige lokale alpha44-ronde en eigen gerichte Linux-debugvensterproef; 436 reguliere Rust-tests, 183 UI-tests, zes afzonderlijke runtimeproeven en zeven Python-tests. Alle 733 bronbestanden bytegelijk hersteld en vergeleken. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd.','kopieen':items},ensure_ascii=False,indent=2)+'\n')
(u/'LEESMIJ.md').write_text('''# Vensterbalk en documenttabbladen alpha44

De vensterbalk gebruikt het oorspronkelijke OpenAEC-beeldmerk en de Office-maten uit de bestaande interface. Opslaan, Openen, Opslaan als, Panelen, thema, instellingen en vensterbediening gebruiken aangesloten opdrachten. De titel toont bestandsnaam, wijzigingsstip en module. De titel blijft gecentreerd op twee gecontroleerde vensterbreedten. Sleepgebieden sluiten de knoppen uit. Weergaveopslag is expliciet aan het eigen instellingenbestand gebonden.

Sluiten van een inactief tabblad behoudt het actieve document en zijn waarschuwing. Sluiten van het actieve tabblad kiest zijn buur en diens metadata. Na het laatste document staat Gereed. Drie nieuwe regressies falen eerst op de oorspronkelijke productiecode; de zes nieuwe UI-proeven slagen vervolgens. De volledige lokale ronde sluit alle negen fasen af met 436 reguliere Rust-tests (183 UI), zes afzonderlijk uitgevoerde runtimeproeven en zeven Python-tests. Alle 733 bronbestanden zijn vanuit de volledige patch hersteld en in werkboom en Git-index gecontroleerd.

De echte Linux-debugproef bevat 58 vastgelegde stappen: thema en instellingen, werkelijk bewaren/heropenen via GTK, snelle opslag, drie documenten, het middelste document behouden bij sluiten links, eigen Writer-metadata, panelen en sluiten tot het startscherm. De opgeslagen notitie en beide bronkopieën blijven bytegelijk. Sommige onmiddellijke opnamen tonen nog het vorige frame; de afzonderlijke wachtopnamen tonen de afgeronde toestand. Dit is geen algemene snelheidsgarantie.

Twee eerste vensterproeven zijn geen productafkeuring: de eerste had geen interactieve stdin; de tweede telde een GTK-tooltip als tweede dialoogvenster. De gecorrigeerde helper kiest uitsluitend een groot eigen dialoogvenster. Een eerste onafhankelijke controle gebruikte daarnaast een onjuiste tijdstempelsleutel. De oorspronkelijke rapporten en proefcode blijven ongewijzigd behouden. Focus is na systeemdialogen expliciet op het eigen venster gezet; automatisch focusherstel onder een normale windowmanager is niet bewezen.

Alle acht volledige oorspronkelijke browser-/desktopvergelijkingen blijven afgekeurd, zonder maskers, herschaling of kleurtolerantie. Onder meer het venstermenu, de Start-route van het beeldmerk, gemaximaliseerde vensterstatus, responsieve bediening, volledige linten en tabbladen zijn nog niet gelijkwaardig. Alpha44-platform- en geoptimaliseerde releasevenstercontroles zijn nog open. Een achtergrondantwoord kan in andere routes bovendien nog een vreemde statusmelding tonen; dit krijgt aanvullende regressies. Alle dertig migratieacceptaties blijven false.

[Alle verliesloze bewijzen](bewijskopieen.json)
''');print({'verliesloze_bewijzen':len(items),'bronbestanden':733,'reguliere_tests':436,'ui_tests':183,'vensterstappen':58})
