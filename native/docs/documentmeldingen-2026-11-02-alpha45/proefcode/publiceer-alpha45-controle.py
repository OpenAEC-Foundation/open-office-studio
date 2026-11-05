from pathlib import Path
import json,hashlib,gzip,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';d=r/'native/docs';u=d/'documentmeldingen-2026-11-02-alpha45';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((w/'native-alpha45-hertest-testbron.json').read_text());st=json.loads((w/'native-alpha45-hertest-stapstatus.json').read_text());te=json.loads((w/'native-alpha45-hertest-terminalstatus.json').read_text());assert te['exitcode']==0 and st['inhoudelijk_afgerond'] and len(st['stappen'])==9 and all(s['exitcode']==0 for s in st['stappen']);assert len(m)==733
for n,h in m.items():assert sha(r/n)==hashlib.sha256(subprocess.check_output(['git','show',':'+n])).hexdigest()==h,n
assert json.loads((d/'schermen-2026-11-02-alpha45.json').read_text())['reguliere_tests']==442
v=json.loads((w/'native-alpha45-bewaarmelding-controle.json').read_text());assert v['vergelijkingen'][1]['fout_behouden'];u.mkdir();items=[]
def kopie(p,rel):
 raw=p.read_bytes();q=u/rel;gz=p.suffix in ['.log','.patch'];q=q.with_name(q.name+'.gz') if gz else q;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(gzip.compress(raw,mtime=0) if gz else raw);assert (gzip.decompress(q.read_bytes()) if gz else q.read_bytes())==raw;items.append({'bron':p.relative_to(r).as_posix(),'bestand':q.relative_to(u).as_posix(),'bron_sha256':hashlib.sha256(raw).hexdigest(),'opgeslagen_sha256':sha(q)})
for p in sorted(w.glob('native-alpha45-*')):
 if p.is_file() and p.suffix in ['.json','.log','.patch'] and 'prototype' not in p.name:kopie(p,Path('ruw')/p.name)
for n in ['start-alpha45-hertest.py','controle-alpha45-hertest.py','bevries-alpha45-debug.py','finaliseer-alpha45-hertest.py','controleer-alpha45-bewaarmelding.py','publiceer-alpha45-controle.py','ruim-oude-eigen-cache-alpha45.py','ruim-oude-eigen-cache-alpha45-tweede.py','opruiming-oude-eigen-cache-voor-alpha45.json','opruiming-oude-eigen-cache-voor-alpha45-tweede.json','opruiming-alpha45-tweede-opstellingsafkeuringen.json','opruiming-na-afgesloten-alpha45-voor-prototype46.json']:
 kopie(w/n,Path('proefcode')/n)
for n in ['gui-alpha44-bewaarmelding','gui-alpha45-bewaarmelding','gui-alpha44-bewaarmelding-v2','gui-alpha45-bewaarmelding-v2']:
 for p in sorted((w/n).iterdir()):
  if p.is_file():kopie(p,Path('vensters')/n/p.name)
for n in ['gui-bewaarmelding-alpha44-45.py','gui-bewaarmelding-alpha44-45-v2.py','venster-bewaarmelding-alpha44-45.py','venster-bewaarmelding-alpha44-45-v2.py','native-alpha44-bewaarmelding-terminal.log','native-alpha44-bewaarmelding-v2-terminal.log']:
 kopie(w/n,Path('proefcode')/n)
kopie(w/'native-alpha45-debug-vast/herkomst.json',Path('debugprogramma-herkomst.json'))
(u/'bewijskopieen.json').write_text(json.dumps({'omvang':'Volledige lokale alpha45-ronde en twee negentien-staps eigen Linux-debugproeven vóór/na de correctie. 442 reguliere Rust-tests, 189 UI, zes afzonderlijke runtimeproeven, zeven Python-tests op 733 bytegelijke bronbestanden. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd.','kopieen':items},ensure_ascii=False,indent=2)+'\n')
(u/'LEESMIJ.md').write_text('''# Documentgebonden meldingen alpha45

Centrale werkdraadantwoorden en bewaarmeldingen krijgen een eigenaar per tabblad. Een inactief antwoord mag geen waarschuwing van het actieve document vervangen. Bij terugkeer blijft een eigen fout of bewaarstatus zichtbaar. De afzonderlijke directe Writer-routes gebruiken dezelfde documentbinding voor werkfouten, ontbrekende cursors, ongeldige selectie over alinea’s en ontbrekende doelalinea’s; de bron blijft intact.

Vier nieuwe regressies falen op de oorspronkelijke alpha44-code. Na de centrale correctie slagen zij. Twee aanvullende Writer-regressies falen eerst en slagen na de eigen Writer-correctie. Zes nieuwe UI-proeven controleren ook de terugkeer naar de juiste waarschuwing, bronbehoud en de vier gecontroleerde Writer-foutroutes.

De volledige lokale ronde sluit alle negen fasen af: 442 reguliere Rust-proeven (189 UI), zes werkelijk afzonderlijke runtimeproeven en zeven Python-tests. Alle 733 bronbestanden zijn vanuit basiscommit plus volledige patch hersteld, na afloop bytegelijk en met de Git-index vergeleken. De 61 widgetbeelden zijn vastgelegd; vijftien gedeelde documentbeelden, acht letterbeelden en twee symboolbeelden blijven exact gelijk aan alpha44. Alle acht oorspronkelijke UI-vergelijkingen blijven afgekeurd.

Twee echte Linux-debugvensters gebruiken dezelfde eigen bestanden, elk met negentien stappen. De notitiekopie wordt uitsluitend door de proef bewust extern veranderd. Ctrl+S legt eerst een werkelijk bewaarconflict vast; daarna volgt wisselen naar Writer en terug. Alpha44 vergeet de eigen fout: haar volledige frame na terugkeer is exact gelijk aan het frame vóór de fout. Alpha45 behoudt haar: haar volledige frame na terugkeer is exact gelijk aan het frame mét de fout. De extern gewijzigde kopie wordt in beide versies niet overschreven; de eigen Writer-bron blijft bytegelijk. De volledige beelden zijn visueel beoordeeld en zonder uitsnede, maskers of herschaling vergeleken. Inactieve antwoordvolgordes zijn afzonderlijk deterministisch in de Rust-proeven gecontroleerd.

De eerste gecombineerde Ctrl+S/muisklikproef bewijst geen notitie-bewaarconflict: Writer meldde Opgeslagen en de notitiekopie bleef extern gewijzigd. Opdracht-eigendom bij zeer snelle toetsen/tabwissels moet afzonderlijk verder worden gecontroleerd; dit wordt niet als opgelost beschouwd. De eerste opstellingen en twee afgewezen verwachtingen bij veilige testcacheopruiming blijven als bewijs behouden. Alle vaste GUI/helperparen, bronnen en testuitvoer blijven bewaard.

Alpha45-platform- en geoptimaliseerde releasevenstercontrole zijn nog open. Alpha44 heeft vijf groene CI-taken; de afzonderlijke pakketverificatie en releasevensterproef worden aan haar eigen bron gekoppeld. Fysieke Windows/macOS-, installatie-, volledige oorspronkelijke functie- en pixelpariteit blijven open. Alle dertig migratieacceptaties blijven false.

[Alle verliesloze bewijzen](bewijskopieen.json)
''')
(d/'controle-2026-11-02-alpha45.md').write_text('''# Native controle: 2 november 2026, alpha 45

**2026.45.0-alpha.45** bewaart meldingen per document. Een inactief werkdraadantwoord, een bewaarsucces of een bewaarfout vervangt geen waarschuwing van het actieve tabblad. Terugkeer toont de eigen melding. De directe Writer-routes binden hun fout aan dezelfde eigenaar en behouden de oorspronkelijke bron.

Vier oorspronkelijke centrale afkeuringen en twee afzonderlijke Writer-afkeuringen zijn vastgelegd. De zes nieuwe UI-proeven slagen na de correcties. Alle negen lokale controlefasen zijn groen: **442 reguliere Rust-proeven**, waarvan **189 UI-proeven**, inclusief het X11-contract; daarnaast **zes afzonderlijke runtimeproeven** en **zeven Python-tests**. De **733 bronbestanden** zijn bytegelijk tussen werkboom, Git-index en herstelde bron. Alle stapstatussen en de afzonderlijke terminal-eindstatus zijn nul.

De echte Linux-debughertest gebruikt per versie negentien vastgelegde stappen. Een eigen notitiekopie wordt bewust extern gewijzigd; het werkelijk zichtbare bewaarconflict blijft bij terugkeer behouden in alpha45 en wordt vergeten in alpha44. Volledige frames bevestigen dat verschil zonder uitsneden of maskers. Beide versies behouden de externe wijziging; de eigen Writer-bron blijft bytegelijk. Deze GUI-proef controleert foutbehoud na wisselen. De inactieve antwoordvolgordes zijn afzonderlijk deterministisch gecontroleerd in Rust.

De eerste samengevoegde Ctrl+S/muisklikproef gaf geen bewezen notitie-bewaarconflict en blijft behouden. Opdracht-eigendom bij zeer snelle toetsen/tabwissels moet verder worden gecontroleerd. De weergave van een behouden fout mag daarmee niet worden verward.

De 61 widgetbeelden zijn vastgelegd. Vijftien gedeelde documentbeelden, acht letterbeelden en twee symboolbeelden zijn exact gelijk aan alpha44. Alle acht oorspronkelijke volledige browser-/desktopvergelijkingen blijven afgekeurd. Referenties, schaal en nul tolerantie zijn ongewijzigd. De nieuwe documentbalk en Start-route zijn uitsluitend een afzonderlijk prototype; zij behoren niet tot deze geteste alpha45-bron.

[Volledige lokale bewijzen](documentmeldingen-2026-11-02-alpha45/LEESMIJ.md) en [schermmetingen](schermen-2026-11-02-alpha45.json) blijven gekoppeld. Alpha45-platform- en geoptimaliseerde releasevenstercontrole zijn nog open. Alpha44 heeft vijf groene CI-taken; aanvullende pakket-/releasevensterbewijzen blijven aan die eerdere bron gebonden. Geen fysieke GUI- of installatiegoedkeuring voor Windows/macOS. Alle dertig migratieacceptaties blijven false.
''')
p=r/'native/README.md';s=p.read_text();s=s.replace('De huidige bouwstap is **2026.45.0-alpha.44**','De huidige bouwstap is **2026.45.0-alpha.45**',1);i=s.index('Alpha44 sluit');s=s[:i]+'''Alpha45 bewaart centrale en directe Writer-meldingen per document. De [volledige lokale ronde](docs/controle-2026-11-02-alpha45.md) slaagt met 442 reguliere Rust-proeven (189 UI), zes afzonderlijke runtimeproeven en zeven Python-tests op 733 bytegelijke bronbestanden. Twee echte Linux-debugproeven van elk negentien stappen tonen het foutbehoud vóór/na de correctie, met behoud van de externe wijziging en de eigen Writer-bron. Zeer snelle toetsen/tabwissels krijgen verdere controle. Alle oorspronkelijke UI-vergelijkingen en de alpha45-platform-/releasevenstercontroles blijven open.

'''+s[i:];p.write_text(s)
p=r/'README.md';s=p.read_text();i=s.index('Alpha 44 connects');s=s[:i]+'''Alpha 45 keeps background and save messages with their own documents, including direct Writer errors. [Full local validation](native/docs/controle-2026-11-02-alpha45.md) passes 442 Rust tests (189 UI), six separate runtime checks and seven Python tests on 733 exact source files. Two actual Linux debug-window runs of nineteen steps each verify that a save conflict remains visible after switching tabs, while the external change and the Writer source remain intact. Command ownership during very rapid key/tab changes needs further checks. Alpha 45 cross-platform and optimized release-window checks remain open; all eight original UI comparisons still fail.

'''+s[i:];p.write_text(s)
p=d/'migratie.json';v=json.loads(p.read_text())
for g in v['gebieden']:
 assert not any(g[k] for k in ['functioneel_gelijk','alle_functies_getest','visueel_gelijk'])
 if g['id']=='schil':g['resterend']='Volledige oorspronkelijke modulelinten, inklappen, responsief lint, losse vensters, venstermenu, Start-route en alle sneltoetsen. Alpha44 sluit de Office-vensterbalk aan en herstelt actieve-tabkeuze en metadata. Alpha45 bewaart centrale en directe Writer-meldingen per document; zes oorspronkelijke regressies worden behouden en de zes gecorrigeerde UI-proeven slagen. De volledige lokale ronde slaagt met 442 reguliere Rust-proeven, 189 UI, zes afzonderlijke runtimeproeven en zeven Python-tests op 733 bytegelijke bronbestanden. Twee Linux-debugvensters van elk negentien stappen controleren werkelijk bewaarconflict en terugkeer, met behouden externe wijziging en Writer-bron. Zeer snelle toetsen/tabwissels vereisen een afzonderlijke eigendomscontrole. De nieuwe documentbalk/Start-route is uitsluitend een afzonderlijk prototype. Alpha44 heeft vijf groene CI-taken; alpha45-platform- en geoptimaliseerde releasevenstercontroles blijven open. Alle oorspronkelijke UI-vergelijkingen en automatische systeemdialoogfocus blijven open.'
p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print({'verliesloze_bewijzen':len(items),'bronbestanden':733,'tests':442,'ui':189})
