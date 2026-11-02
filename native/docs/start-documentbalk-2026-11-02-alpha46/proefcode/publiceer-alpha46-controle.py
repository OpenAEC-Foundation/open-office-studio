from pathlib import Path
import json,hashlib,gzip,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';d=r/'native/docs';u=d/'start-documentbalk-2026-11-02-alpha46';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((w/'native-alpha46-hertest-testbron.json').read_text());st=json.loads((w/'native-alpha46-hertest-stapstatus.json').read_text());te=json.loads((w/'native-alpha46-hertest-hervatting-terminalstatus.json').read_text());assert json.loads((w/'native-alpha46-hertest-terminalstatus.json').read_text())['exitcode']==143
assert len(m)==736 and te['exitcode']==0 and st['inhoudelijk_afgerond'] and len(st['stappen'])==9 and all(s['exitcode']==0 for s in st['stappen'])
for n,h in m.items():assert sha(r/n)==hashlib.sha256(subprocess.check_output(['git','show',':'+n])).hexdigest()==h,n
beelden=json.loads((d/'schermen-2026-11-02-alpha46.json').read_text());assert beelden['versie']=='2026.45.0-alpha.46' and beelden['reguliere_tests']==447 and beelden['laatste_ui_tests']==194
assert json.loads((w/'native-alpha46-start-documentbalk-controle.json').read_text())['geslaagd']
assert json.loads((w/'native-alpha46-writer-menu-controle.json').read_text())['geslaagd']
assert json.loads((w/'native-alpha46-patchherstel.json').read_text())['alle_herstelde_bestanden_bytegelijk']
u.mkdir();items=[]
def kopie(p,rel):
 raw=p.read_bytes();q=u/rel;gz=p.suffix in ['.log','.patch'];q=q.with_name(q.name+'.gz') if gz else q;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(gzip.compress(raw,mtime=0) if gz else raw);assert (gzip.decompress(q.read_bytes()) if gz else q.read_bytes())==raw;items.append({'bron':p.relative_to(r).as_posix(),'bestand':q.relative_to(u).as_posix(),'bron_sha256':hashlib.sha256(raw).hexdigest(),'opgeslagen_sha256':sha(q)})
for p in sorted(w.glob('native-alpha46-*')):
 if p.is_file() and p.suffix in ['.json','.log','.patch'] and any(s in p.name for s in ['hertest-','hoofdvoorproef','geteste-bron','patchherstel','start-documentbalk-controle','writer-menu-controle']):kopie(p,Path('ruw')/p.name)
for n in ['start-alpha46-hertest.py','controle-alpha46-hertest.py','hervat-alpha46-runtime.py','bevries-alpha46-debug.py','finaliseer-alpha46-hertest.py','controleer-alpha46-start-documentbalk.py','gui-alpha46-start-documentbalk.py','venster-alpha46-start-documentbalk.py','publiceer-alpha46-controle.py','controleer-alpha46-writer-menu.py','gui-alpha46-writer-menu.py','venster-alpha46-writer-menu.py','ruim-oude-eigen-cache-alpha46-volledige-ronde.py','ruim-oude-eigen-cache-tijdens-alpha46-volledige-ronde.py','opruiming-eigen-cache-voor-alpha46-hoofdbouw.json','opruiming-oude-eigen-cache-voor-alpha46-volledige-ronde.json','opruiming-oude-eigen-cache-tijdens-alpha46-volledige-ronde.json']:
 kopie(w/n,Path('proefcode')/n)
for p in sorted((w/'gui-alpha46-start-documentbalk').iterdir()):
 if p.is_file():kopie(p,Path('venster')/p.name)
for p in sorted((w/'gui-alpha46-writer-menu').iterdir()):
 if p.is_file():kopie(p,Path('writer-menu')/p.name)
kopie(w/'native-alpha46-debug-vast/herkomst.json',Path('debugprogramma-herkomst.json'))
(u/'bewijskopieen.json').write_text(json.dumps({'omvang':'Volledige lokale alpha46-ronde en veertig gerichte stappen in een eigen Linux-debugvenster. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd. Afzonderlijke eerdere prototypes behoren niet tot deze definitieve hoofdbron.','kopieen':items},ensure_ascii=False,indent=2)+'\n')
(u/'LEESMIJ.md').write_text('''# Start en documentbalk, alpha46

De volledige native interface gebruikt bestaande Office-SVG’s met hun licentietekst. De documentbalk volgt de oorspronkelijke afmetingen, fonts, themakleuren en iconen. Lange namen worden met werkelijke lettermeting ingekort; de volledige naam blijft benoemd in de interne toegankelijkheidsboom. Start is bereikbaar via het tabblad, het merk linksboven en de plus. Een document blijft in geheugen met zijn eigen invoer en melding. Venstersluiten vanaf Start kiest het werkelijk gewijzigde document voor de bewaарvraag. De titelpositie volgt de gemeten oorspronkelijke vensterbalk op twee breedten.

De vijf nieuwe UI-proeven en drie bestaande vensterbalkproeven slagen. Alle negen lokale fasen sluiten af met 447 reguliere Rust-proeven (194 UI), zes afzonderlijke runtimeproeven en zeven Python-tests. Alle 736 bronbestanden zijn vastgelegd en bytegelijk tussen geteste werkboom, Git-index en basiscommit plus volledige herstelpatch. De eerste herstelopstelling archiveerde te weinig mappen en werd afgekeurd; de gecorrigeerde volledige bronherstelproef slaagt. De oorspronkelijke afkeuring blijft behouden. De eerste terminalsessie eindigde met status 143 tijdens runtime, na zeven groene fasen; de oorzaak is niet vastgesteld. De afzonderlijke hervatting controleert de twee resterende fasen op exact dezelfde bron. Beide terminalstatussen en de onvolledige oorspronkelijke runtime-uitvoer blijven behouden.

De echte Linux-debugproef omvat veertig stappen: titel invoeren, Start openen en terugkeren, sluiten vanaf Start en annuleren, tekst toepassen en werkelijk bewaren, een eigen Writer-kopie openen via de systeemdialoog, de inactieve notitie sluiten en Writer behouden. Terugkeer vanuit Start levert hetzelfde volledige Writer-frame. De bewaarde notitie verschilt uitsluitend in titel en wijzigingstijd; alle overige bronvelden en de Writer-kopie blijven behouden. De systeemdialoog krijgt expliciet focus binnen het eigen Xvfb-scherm. Eerste beelden na 0,6 seconde zijn soms verouderd; alle afzonderlijke beelden na 2–8 seconden zijn behouden. Dit is geen algemene snelheids- of automatische systeemfocusgoedkeuring.

Een afzonderlijke Writer-vensterproef van negentien stappen controleert Bestand in licht en donker, Escape-terugkeer, de Instellingen-overlay en terugkeer naar licht. Beide eigen documentbronnen blijven bytegelijk. De oorspronkelijke volledige beelden zijn visueel beoordeeld; er is geen algemene menu- of functieacceptatie.

De 61 widgetbeelden zijn bewaard. Vijftien gedeelde documentbeelden, acht letterbeelden en twee symboolbeelden blijven exact gelijk aan alpha45. Alle acht oorspronkelijke UI-vergelijkingen blijven afgekeurd: volledige schermen op 1058×892, nul tolerantie, zonder maskers of herschaling. Volledige ribbon, overige functies, native database-interface, installaties en fysieke Windows/macOS-vensters blijven open. De alpha46-platform- en geoptimaliseerde releasevenstercontrole zijn nog niet afgesloten. Alle dertig migratieacceptaties blijven false.
'''.replace('bewaарvraag','bewaarvraag'))
(d/'controle-2026-11-02-alpha46.md').write_text('''# Native controle: 2 november 2026, alpha46

**2026.45.0-alpha.46** verbindt Start en een documentbalk met de bestaande Office-iconen. Terugkeer behoudt tekst en documentmeldingen. Sluiten vanaf Start toont de vraag voor het juiste gewijzigde document. Lange tabnamen worden met de werkelijke letterbreedte ingekort; de titelpositie volgt de gemeten oorspronkelijke balk.

Alle negen lokale controles zijn groen na afzonderlijke hervatting van de runtimefase: **447 reguliere Rust-proeven**, waarvan **194 UI-proeven**, inclusief het X11-contract; daarnaast **zes afzonderlijke runtimeproeven** en **zeven Python-tests**. De **736 bronbestanden** zijn bytegelijk met de geteste bron, Git-index en herstelde basiscommit plus patch. Alle negen onderliggende stapstatussen zijn nul. De eerste terminalsessie eindigde na zeven groene fasen tijdens runtime met status 143; de oorzaak is niet vastgesteld. De twee resterende fasen zijn afzonderlijk op dezelfde bron herhaald met eindstatus nul. De oorspronkelijke status en onvolledige uitvoer blijven behouden. De eerste onvolledige bronherstelopstelling is als afkeuring behouden.

De echte Linux-debugproef sluit veertig gerichte stappen af. Start via tabblad, merk en plus behoudt het concept; de juiste sluitvraag kan worden geannuleerd. De bewaarde notitie verandert uitsluitend in titel en tijd. Een inactief tabblad sluiten behoudt Writer; de volledige beelden vóór en na terugkeer zijn exact gelijk. De systeemdialoog gebruikt expliciete focus binnen het eigen testscherm. Dit bewijst geen algemene dialoogfocus, volledige GUI- of snelheidsdekking.

Een afzonderlijke Writer-vensterproef van negentien stappen controleert Bestand en Escape in licht en donker, Instellingen en terugkeer naar licht; beide bronkopieën blijven bytegelijk.

De 61 widgetbeelden zijn vastgelegd; vijftien gedeelde documentbeelden, acht letterbeelden en twee symboolbeelden blijven exact gelijk aan alpha45. **Alle acht oorspronkelijke UI-vergelijkingen blijven afgekeurd.** Referenties, schaal en nul tolerantie blijven ongewijzigd. De alpha46-platform- en geoptimaliseerde releasevenstercontrole blijven open; er is geen fysieke GUI- of installatiegoedkeuring voor Windows/macOS. Alle dertig migratieacceptaties blijven false.

[Volledige bewijzen](start-documentbalk-2026-11-02-alpha46/LEESMIJ.md) en [schermmetingen](schermen-2026-11-02-alpha46.json).
''')
p=r/'native/README.md';s=p.read_text();s=s.replace('De huidige bouwstap is **2026.45.0-alpha.45**','De huidige bouwstap is **2026.45.0-alpha.46**',1);i=s.index('Alpha45 bewaart');s=s[:i]+'''Alpha46 verbindt Start, de documentbalk en bestaande Office-iconen. De [volledige lokale ronde](docs/controle-2026-11-02-alpha46.md) slaagt met 447 reguliere Rust-proeven (194 UI), zes afzonderlijke runtimeproeven en zeven Python-tests op 736 bytegelijke bronbestanden. Veertig echte Linux-debugstappen controleren behoud van invoer, sluiten vanaf Start, werkelijk bewaren en terugkeer naar Writer. Alle oorspronkelijke UI-vergelijkingen en alpha46-platform-/releasevenstercontroles blijven open.

'''+s[i:];p.write_text(s)
p=r/'README.md';s=p.read_text();i=s.index('Alpha 45 keeps');s=s[:i]+'''Alpha 46 connects Home, document tabs and the existing Office icons. [Full local validation](native/docs/controle-2026-11-02-alpha46.md) passes 447 Rust tests (194 UI), six separate runtime checks and seven Python tests on 736 exact source files. Forty actual Linux debug-window steps verify draft retention, the correct close prompt from Home, saving and returning to Writer. All eight original UI comparisons still fail; alpha 46 cross-platform and optimized release-window checks remain open.

'''+s[i:];p.write_text(s)
p=d/'migratie.json';v=json.loads(p.read_text())
for g in v['gebieden']:
 assert not any(g[k] for k in ['functioneel_gelijk','alle_functies_getest','visueel_gelijk'])
 if g['id']=='schil':g['resterend']='Volledige oorspronkelijke modulelinten, inklappen, responsief lint, losse vensters, venstermenu, tabbladcontextmenu/verplaatsen en alle sneltoetsen. Alpha46 verbindt Start, documentbalk, bestaande Office-iconen en de juiste bewaardoeleigenaar bij venstersluiten vanaf Start. De volledige lokale ronde slaagt met 447 reguliere Rust-proeven (194 UI), zes afzonderlijke runtimeproeven en zeven Python-tests op 736 bytegelijke bronbestanden. Veertig echte Linux-debugstappen controleren invoerbehoud, sluiten, werkelijk bewaren, inactief tabblad sluiten en terugkeer naar hetzelfde Writer-frame. Zeer snelle toetsen/tabwissels, automatische systeemdialoogfocus en alle oorspronkelijke pixelvergelijkingen blijven open. Alpha46-platform- en geoptimaliseerde releasevenstercontroles zijn nog niet afgesloten.'
p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print({'verliesloze_bewijzen':len(items),'bronbestanden':736,'tests':447,'ui':194})
