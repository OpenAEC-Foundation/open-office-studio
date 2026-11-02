from pathlib import Path
import json,hashlib,gzip,subprocess,datetime
r=Path.cwd();w=r/'.local/controle-2026-10-31';d=r/'native/docs';uit=d/'presentatie-2026-11-01-alpha42/volledige-hertest'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
st=json.loads((w/'native-alpha42-hertest-stapstatus.json').read_text());te=json.loads((w/'native-alpha42-hertest-terminalstatus.json').read_text());assert te['exitcode']==0 and st['inhoudelijk_afgerond'];assert len(st['stappen'])==9 and all(s['exitcode']==0 for s in st['stappen'])
m=json.loads((w/'native-alpha42-hertest-testbron.json').read_text())
for n,h in m.items():assert sha(r/n)==h and hashlib.sha256(subprocess.check_output(['git','show',':'+n])).hexdigest()==h,n
assert 'Het [werkrapport voor alpha 42]' in (r/'native/README.md').read_text()
assert json.loads((d/'pixelcontrole-alpha42-desktop/presentation/rapport.json').read_text())['afwijkende_pixels']==193793
uit.mkdir();items=[]
def kopie(p):
 raw=p.read_bytes();q=uit/p.name;gz=p.suffix in ['.log','.patch'];q=q.with_name(q.name+'.gz') if gz else q;assert not q.exists();q.write_bytes(gzip.compress(raw,mtime=0) if gz else raw);assert (gzip.decompress(q.read_bytes()) if gz else q.read_bytes())==raw;items.append({'bron':p.relative_to(r).as_posix(),'bestand':q.name,'bron_sha256':hashlib.sha256(raw).hexdigest(),'opgeslagen_sha256':sha(q)})
for n in ['native-alpha42-hertest-testbron.json','native-alpha42-hertest-geteste-bron.patch','native-alpha42-hertest-geteste-bron.json','native-alpha42-hertest-patchherstel.json','native-alpha42-hertest-stapstatus.json','native-alpha42-hertest-terminalstatus.json','native-alpha42-hertest-terminal.log','native-alpha42-hertest-index.json','controle-alpha42-hertest.py','start-alpha42-hertest.py','bevries-alpha42-hertest-bron.py','finaliseer-alpha42-hertest.py','publiceer-alpha42-hertest.py','native-alpha42-migratie-voorcontrole.log','opruiming-oude-eigen-cache-voor-alpha42-hertest-tweede.json','ruim-oude-eigen-cache-alpha42-hertest-tweede.py']:
 kopie(w/n)
for s in st['stappen']:
 p=w/s['log'];assert sha(p)==s['sha256'];kopie(p)
(uit/'bewijskopieen.json').write_text(json.dumps({'omvang':'Volledige gecorrigeerde lokale Linux-ronde; eerste afkeuringen blijven ongewijzigd bewaard. Geen oorspronkelijke UI-, volledige functie-, installatie- of platformgoedkeuring.','vastgelegd_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kopieen':items},ensure_ascii=False,indent=2)+'\n')
p=d/'presentatie-2026-11-01-alpha42/LEESMIJ.md';p.write_text(p.read_text()+'\n## Afgesloten hertest op 2 november\n\nDe beschrijving en de manifestomvang hierboven leggen het eerdere afkeuringsmoment vast. De gecorrigeerde lokale ronde is inmiddels groen: 418 reguliere Rust-proeven, waarvan 172 UI-proeven, zes afzonderlijke runtimeproeven en zeven Python-tests. De [volledige hertestbewijzen](volledige-hertest/bewijskopieen.json) bevatten alle negen stapstatussen, de terminal-eindcode, de 729 bronhashes en de volledige reproduceerbare patch. De aanvullende Linux-debugvensterproef bewaart het paneel en herstelt snelle undo/opslaan bytegelijk. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd; alpha42-platform- en geoptimaliseerde releasevensterproeven zijn nog open.\n')
p=d/'controle-2026-11-01-alpha42.md';s=p.read_text();s=s.replace('De volledige gecorrigeerde ronde loopt nog.','De volledige gecorrigeerde lokale ronde is hieronder afgesloten.')
s+='''
## Gecorrigeerde lokale hertest op 2 november

Alle negen stappen slagen: workspacebouw, rustfmt, Clippy voor alle doelen, de volledige reguliere Rust-ronde, onafhankelijke documentlezers, zeven Python-tests, de gepinde broncontrole, zes afzonderlijke runtimeproeven en de onafhankelijke conversielezers. Er slagen 418 reguliere Rust-proeven, waarvan 172 UI-proeven, inclusief het X11-contract. De zes runtimeproeven zijn in de reguliere ronde overgeslagen en vervolgens werkelijk afzonderlijk uitgevoerd. De bron omvat 729 bestanden; werkboom, Git-index en de uit basiscommit plus volledige patch herstelde bron zijn bytegelijk. De onderliggende stapstatussen en de afzonderlijke terminal-eindcode zijn nul.

Er zijn 61 widgetbeelden vastgelegd. De vijftien gedeelde documentbeelden, acht Spreadsheet-letterbeelden en twee symboolbeelden blijven bytegelijk aan alpha41. Alle acht volledige vergelijkingen met de ongewijzigde browser- en desktopreferenties blijven afgekeurd. De desktoppresentatie verbetert van 559431 naar 193793 afwijkende pixels van 943736, zonder masker, herschaling of kleurtolerantie. De volledige ribbon, schil en overige modulefuncties blijven open.

Deze bron heeft nog geen afgesloten alpha42-platformronde of geoptimaliseerde alpha42-releasevensterproef. De eerdere alpha41-platformronde is wel volledig groen; haar resultaten gelden uitsluitend voor die eerdere bron. De klok- en kalendercorrectie voor notities wordt afzonderlijk voorbereid en maakt geen deel uit van deze geteste alpha42-bron. Alle dertig migratieacceptaties blijven false.
''';p.write_text(s)
p=r/'native/README.md';s=p.read_text();a=s.index('Alpha 42') if 'Alpha 42' in s else -1
# Alleen de afzonderlijke actuele alpha42-paragraaf vervangen; historische bewijslinks behouden.
regels=s.splitlines()
for i,regel in enumerate(regels):
 if regel.startswith('Het [werkrapport voor alpha 42]'):
  regels[i]='Alpha42 verbindt echte diavoorbeelden, een lichte presentatie-werkruimte en een afzonderlijke notitie-editor. De volledige lokale hertest slaagt met 418 reguliere Rust-proeven (172 UI), zes afzonderlijke runtimeproeven en zeven Python-tests op 729 bytegelijke bronbestanden. De echte Linux-debugvensterhertest behoudt het paneel bij navigatie en bewaart snelle undo/opslaan bronexact. De eerste afkeuringen blijven vastgelegd in [de controle](docs/controle-2026-11-01-alpha42.md). Alle acht oorspronkelijke UI-vergelijkingen blijven afgekeurd; platform- en geoptimaliseerde releasevenstercontrole van alpha42 zijn nog open.'
  break
else:raise AssertionError('Actuele alpha42-paragraaf niet gevonden')
p.write_text('\n'.join(regels)+'\n')
p=d/'migratie.json';v=json.loads(p.read_text())
for g in v['gebieden']:
 assert not any(g[k] for k in ['functioneel_gelijk','alle_functies_getest','visueel_gelijk'])
 if g['id']=='presentation':g['resterend']='Directe tekstinvoer, vormselectie/rotatie/slepen/vergroten, afbeeldingen, tabellen/grafieken, thema/layout, overgangen en presentatiemodus; volledige oorspronkelijke ribbon en grote-dekvirtualisatie/automatische navigatiescroll. Alpha42 sluit echte begrensde achtergrondminiaturen, een meeschalende lichte werkruimte en een afzonderlijke notitie-editor aan. Tien nieuwe gerichte kern-/UI-proeven en de volledige lokale ronde slagen. Nieuwe en bestaande notities zijn onafhankelijk uit PPTX gelezen. De echte Linux-debughertest behoudt het paneel bij diawisseling en bewaart snelle undo/opslaan bytegelijk. Alle oorspronkelijke pixelvergelijkingen blijven afgekeurd; alpha42-platform- en geoptimaliseerde releasevensterproeven blijven open.'
 if g['id']=='schil':g['resterend']='De volledige oorspronkelijke modulelinten, inklappen, responsief lint, losse vensters en alle sneltoetsen overzetten. Alpha41 is volledig lokaal, in alle vijf CI-taken en op het echte geoptimaliseerde Linux-venster gecontroleerd; de historische debugafkeuringen blijven behouden. Alpha42 houdt de algemene hervatting van invoer en zoeken intact, ordent overlappende bewaaraanvragen en optimaliseert vier rasterbibliotheken met behoud van debug- en overflowcontroles. De gerichte debugmenuproef klopt na drie seconden, maar de eerste opname rond 0,8 seconde blijft achter. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd.'
 if g['id']=='notition':g['resterend']='Automatische lokale bewaring/herstel, zoeken, boeken en secties hernoemen/verplaatsen, lege boeken, volledig prullenbakbeheer, volledige blokopmaak en taken, import/export en bestaande GUI exact overnemen. De alpha38-navigatie-/greep-/Markdown-undo-hertests en de volledige alpha39/41-platformrondes zijn afgesloten. De geoptimaliseerde alpha41-Linux-vensterproef slaagt ook voor snelle formaatgrepen, vrije blokken en bronexacte undo. De oorspronkelijke afkeuringen en alle oorspronkelijke pixelverschillen blijven bewaard. Een vaste klok per sessie, werkelijke aanmaakdatum en lokale kalenderdag worden afzonderlijk voorbereid; deze correctie is nog geen onderdeel van de geteste alpha42-bron.'
p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print({'verliesloze_volledige_hertestbewijzen':len(items),'bronbestanden':len(m),'reguliere_tests':418,'ui_tests':172})
