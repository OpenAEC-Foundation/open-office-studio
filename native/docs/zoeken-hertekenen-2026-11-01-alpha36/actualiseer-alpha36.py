"""Actualiseer de hoofdrapportage zonder de migratieacceptatie te verruimen."""
from pathlib import Path
import json
r=Path.cwd();d=r/'native/docs';w=r/'.local/controle-2026-10-31';p=d/'zoeken-hertekenen-2026-11-01-alpha36'
bron=json.loads((w/'native-alpha36-testbron.json').read_text());assert len(bron)==669
s=json.loads((d/'schermen-2026-11-01-alpha36.json').read_text());assert s['reguliere_tests']==388 and s['laatste_ui_tests']==151
platform=json.loads((d/'platformen-2026-11-01-alpha36.json').read_text());assert platform['geslaagd']
bouw=json.loads((d/'bouw-2026-11-01-alpha36-lokaal.json').read_text());assert bouw['geslaagd']
vensters=[]
for soort in ['ci','lokaal']:
 totaal=0
 for route in ['writer','writer-lijsten','writer-stijlen-hulpgherstel','schaars','bestand']:
  mapnaam=f'gui-alpha36-{route}-{soort}';a=json.loads((w/mapnaam/'rapport.json').read_text());assert a['geslaagd'];totaal+=len(a['stappen']);vensters.append({'bouw':soort,'route':route,'stappen':len(a['stappen']),'geslaagd':True,'rapport':f'zoeken-hertekenen-2026-11-01-alpha36/{mapnaam}/rapport.json'})
 assert totaal==61
v={'versie':'2026.44.9-alpha.36','broncommit':'9deec078c7080549f3e6900685ba8357ad3d1547','omvang':'61 gerichte echte Linux-vensterstappen per geoptimaliseerde bouw; geen fysieke hardware-, andere OS-, systeemdialoog-, IME-, schermlezer- of volledige suite-/pixelgoedkeuring.','routes':vensters}
(d/'vensterproeven-2026-11-01-alpha36.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
browser={a['module']:a['afwijkende_pixels'] for a in json.loads((d/'pixelcontrole-alpha36/rapport.json').read_text())['resultaten']};desktop={a['module']:a['afwijkende_pixels'] for a in json.loads((d/'pixelcontrole-alpha36-desktop/rapport.json').read_text())['resultaten']}
(d/'controle-2026-11-01-alpha36.md').write_text(f'''# Native controle, 1 november 2026: alpha 36

**2026.44.9-alpha.36**, productiebroncommit `9deec078c7080549f3e6900685ba8357ad3d1547`, bewaart de herkomst van zoekinvoer en begrenst schaduwberekeningen tot het actuele fysieke hertekengebied. De [bewijsreeks](zoeken-hertekenen-2026-11-01-alpha36/LEESMIJ.md) bewaart oorspronkelijke afkeuringen, negen herstelbare onderzoeksmomenten en de volledige geteste bronpatch. Tijdelijke diagnosecode zit niet in de uiteindelijke bron.

- **388 reguliere Rust-tests**, waaronder **151 UI-tests**, zes runtimeproeven en zeven Python-tests slagen. Rustfmt, Clippy met waarschuwingen als fouten, bronpins en onafhankelijke lezers slagen; **669 bronbestanden** blijven vóór en na de volledige ronde bytegelijk.
- **57 volledige native widgetbeelden** zijn vastgelegd. Vijftien gedeelde documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 35; vijf oorspronkelijke renderer-goldens blijven gecontroleerd.
- De [lokale releasebouw](bouw-2026-11-01-alpha36-lokaal.json) slaagt in **30m21s**, met pakket-/bronregressiecontrole en beide programma’s apart vastgezet. Alle **2918 Git-bouwbronbestanden** zijn opnieuw tegen het archief en de onveranderde bouwbron gecontroleerd.
- De [platformronde](platformen-2026-11-01-alpha36.json) slaagt op vijf taken, met **2917 verpakte bronbestanden per platform**, **114 exacte native beeldparen** en **21 paginabezoeken**. Dit zijn portable pakketten voor de drie gebouwde doelplatformen, geen volledige installer-/architectuurmatrix.
- De [echte Linux-vensterproeven](vensterproeven-2026-11-01-alpha36.json) slagen zowel lokaal als in CI op ieder **61 gerichte stappen**: elf Writer-structuur-/focusstappen, negentien lijststappen, twintig stijlstappen, zes schaarse-rasterstappen en vijf bestandsschermstappen. De lijst-/stijlbestanden zijn met onafhankelijke lezers gecontroleerd. Volledige beelden tonen het bestandsscherm zonder de ribbon ervoor en de herstelde documentpagina na Escape.

Drie volledige geladen 1440×900-ontwikkelvensters vóór en na de schaduwcorrectie hebben nul afwijkende pixels. Die afgebakende hertekenregressie is geen bewijs van oorspronkelijke UI-pariteit. De oorspronkelijke [browservergelijkingen](pixelcontrole-alpha36/rapport.json) blijven afgekeurd: {browser}. De [afzonderlijke desktopvergelijkingen](pixelcontrole-alpha36-desktop/rapport.json) blijven eveneens afgekeurd: {desktop}. Elke vergelijking gebruikt alle 943.736 pixels, zonder maskers, herschaling of kleurtolerantie.

De [brede releasecorpusronde](corpus-2026-11-01-alpha36-release.json) controleert 648 van de 1566 manifestbronnen: **579 slagen, 68 worden geweigerd en één overschrijdt 30 seconden**. De 68 geweigerde bron-ID’s zijn gelijk aan alpha 16. De [afzonderlijke 120-secondenproef](corpus-2026-11-01-alpha36-uitloper.json) slaagt voor die 177-paginabron in 31,678 seconden; de oorspronkelijke corpusuitslag blijft afgekeurd. De overige 918 formaten vallen buiten deze native ronde. Een eigen document met kleine kapitalen wordt nog geweigerd; de oorspronkelijke fout blijft vastgelegd voor vervolgwerk.

Een extra volledige ZIP-byte-eis faalt doordat bewaren de kop-/voettekstwrappers herschrijft. Onafhankelijke controle bevestigt bytegelijke volledige binnen-XML, behouden naamruimtebetekenissen, rijke tekst, tabel en secties. Dat vervangt de oorspronkelijke byteafkeuring niet en is geen volledige brongetrouwheidsclaim.

Alle tien [migratieacceptatiegebieden](migratie.json) blijven open op volledige functie-, test- en pixelpariteit. Ontbrekende modulefuncties, oorspronkelijke UI-gelijkheid, volledige import/corpusdekking, native installers en echte vensters op andere besturingssystemen blijven vereist. Geen stabiele native vrijgave of voltooiing op 100%.
''')
readme=r/'native/README.md';tekst=readme.read_text();tekst=tekst.replace('De huidige bouwstap is **2026.44.9-alpha.35**','De huidige bouwstap is **2026.44.9-alpha.36**',1)
a=tekst.index('Het [controlerapport voor alpha 35]');b=tekst.index('\n\n',a)
nieuw='''Het [controlerapport voor alpha 36](docs/controle-2026-11-01-alpha36.md) legt **388 reguliere Rust-tests**, waaronder **151 UI-tests**, zes runtimeproeven en zeven Python-tests vast. Rustfmt, Clippy, bronpins en onafhankelijke lezers slagen; **669 bronbestanden** en **57 volledige native widgetbeelden** zijn vastgelegd. De lokale releasebouw, vijf CI-taken, 114 exacte native beeldparen en 21 paginabezoeken slagen. Beide geoptimaliseerde Linux-bouwen slagen ieder op 61 gerichte vensterstappen. Dit bewijst geen volledige functie-, platform- of oorspronkelijke UI-pariteit.

De brede corpusronde heeft 579 geslaagde bronnen, 68 weigeringen en één overschrijding van 30 seconden. De afzonderlijke 120-secondenproef slaagt, maar maakt de oorspronkelijke ronde niet groen. Een extra ZIP-byte-eis legt herschreven kop-/voettekstwrappers vast; de inhoud blijft afzonderlijk gecontroleerd. De oorspronkelijke afkeuringen blijven in de [bewijsreeks](docs/zoeken-hertekenen-2026-11-01-alpha36/LEESMIJ.md) bewaard.

![Werkelijk CI-Linux-venster: heropende opgemaakte tekst, systeemklembord en hervatte bediening](docs/zoeken-hertekenen-2026-11-01-alpha36/gui-alpha36-writer-ci/writer-vet-heropend.png)'''
tekst=tekst[:a]+nieuw+tekst[b:];tekst=tekst.replace('De [controle van alpha 35](docs/controle-2026-11-01-alpha35.md) legt de huidige lokale tests','De [controle van alpha 36](docs/controle-2026-11-01-alpha36.md) legt de huidige lokale tests');readme.write_text(tekst)
readme=r/'README.md';tekst=readme.read_text();a=tekst.index('Alpha 35 prevents');b=tekst.index('## Suite or a separate app',a);tekst=tekst[:a]+'''Alpha 36 binds search focus to its original input event and limits shadow work
to the current repaint area. Its [validation report](native/docs/controle-2026-11-01-alpha36.md)
records 388 Rust tests, including 151 UI tests, six runtime checks and seven
Python tests. The local release build and all five platform CI jobs pass;
each optimized Linux build passes 61 targeted window steps. The broad corpus
still contains refusals and a timeout, and the original full visual comparisons
remain failed. These checks do **not** establish complete migration or visual parity.

'''+tekst[b:];readme.write_text(tekst)
readme=r/'README.nl.md';tekst=readme.read_text();punt='De bestaande release blijft 2026-W44.8.\n';assert tekst.count(punt)==1;tekst=tekst.replace(punt,punt+'''
De [controle van alpha 36](native/docs/controle-2026-11-01-alpha36.md) legt 388 Rust-tests,
waaronder 151 UI-tests, zes runtimeproeven en zeven Python-tests vast. Lokale
releasebouw en vijf platformtaken slagen; beide geoptimaliseerde Linux-bouwen
slagen ieder op 61 gerichte vensterstappen. Corpusweigeringen, een tijdslimiet
en de oorspronkelijke volledige pixelvergelijkingen blijven afgekeurd.
Dit is geen volledige migratie- of pariteitsgoedkeuring.
''');readme.write_text(tekst)
m=json.loads((d/'migratie.json').read_text())
for g in m['gebieden']:
 assert not any(g[k] for k in ['functioneel_gelijk','alle_functies_getest','visueel_gelijk'])
 if g['id']=='writer':g['resterend']+=' Alpha 36 stempelt zoekfocus bij de oorspronkelijke widgetgebeurtenis. Zes nieuwe gerichte proeven en 61 Linux-vensterstappen per geoptimaliseerde bouw controleren de correctie en hertekenregressies. Volledige rijke bewerking, alle oorspronkelijke bediening en pixelpariteit blijven open. Kleine kapitalen worden nog geweigerd; kop-/voettekstwrappers worden bij bewaren nog herschreven.'
 if g['id']=='bestanden':g['resterend']+=' De alpha36-releasecorpusronde controleert 648 van 1566 bronnen: 579 slagen, 68 weigeringen en één tijdslimiet van 30 seconden. De afzonderlijke 120-secondenproef slaagt; de oorspronkelijke ronde en 918 overige formaten blijven open.'
 if g['id']=='distributie':g['resterend']+=' Alpha36 levert drie portable CI-pakketten en een gecontroleerde lokale Linux-bouw; native installers, alle architecturen en echte vensters op andere OS blijven open.'
(d/'migratie.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print('Hoofdrapportage en leesmij bijgewerkt; alle dertig acceptatievlaggen blijven onwaar.')
