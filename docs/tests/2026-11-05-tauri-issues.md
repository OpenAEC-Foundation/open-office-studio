# Tauri: herstelronde van 5 november 2026

Basis: `main` op `b5492ef`, versie 2026-W44.8. De afzonderlijke werkboom
`codex/tauri-issues` bevat uitsluitend wijzigingen voor de bestaande
Tauri/websuite. De native migratie is geen onderdeel van deze ronde.

## Samengebracht en hersteld

| Onderdeel | Wijziging | Controle |
| --- | --- | --- |
| #120, bestaand voorstel #121 | De drie rekenbladpakketten gebruiken 0.5.1; de editor houdt de synchrone integratie expliciet aan. | De echte WASM blijft bruikbaar na een lege weekfunctie: directe invoer, plakken, openen, volgende bewerking, opslaan en heropenen. |
| #131, bestaand voorstel #134 | Rij verwijderen en Kolom verwijderen hebben zichtbare labels. | Bestaande lintproeven. |
| #124 | De pijltjes in het grootteveld passen de grootte direct toe, zowel met de muis als met het toetsenbord. Handmatig typen wordt nog met Enter of focusverlies bevestigd. | Browserproef met een volledige tekstselectie: 11 → 12 met Pijl omhoog, vervolgens 13 met het ingebouwde muispijltje. De gedownloade DOCX bevat voor de volledige tekst `w:sz=26`. |
| #125 | De drie tekstpakketten gebruiken 0.5.1, met expliciete synchrone integratie. Markering wordt pas toegepast na bevestigen van de kleurkeuze. | Vier echte engineproeven: geselecteerde tekst, RGB-opslag en heropenen, wissen, ingevoegde tekst en ongedaan maken/opnieuw. Browserproef: annuleren verandert de keuze niet; geel blijft in de gedownloade XML en na heropenen aanwezig. |
| Zichtbaar teken uit #122 | Het lege sjabloon gebruikt een Unicode-bolletje. De opsommingsknop zet ook de afgeleide tekengegevens voor directe weergave. | Sjablooncontrole en drie echte engineproeven voor opslaan/heropenen, aan/uit, ongedaan maken/opnieuw en alleen-lezen. Browserproef bevestigt directe weergave, uitschakelen, ongedaan maken en heropenen van de gedownloade DOCX. |
| #127 | Paginanavigatie verplaatst ook de invoegcursor. Bij een doorlopende alinea wordt de eerste regel op de gekozen pagina gebruikt. Beide paginadialogen gebruiken dezelfde route. | Vier regressieproeven, waaronder doorlopende alinea en lege pagina. Browserproef: na navigeren naar pagina 1 wordt nieuwe tekst vóór de bestaande eerste alinea ingevoegd. |
| Eigen tabelscheidingsteken | Het tekstveld gebruikt expliciet de achtergrond- en tekstkleuren van het venster. | Broncontrole; de native melding #140 is hiermee niet automatisch afgetekend. |
| Bestaand voorstel #117 | Tellingen nemen tabelcellen mee; de maatobserver van het notitiecanvas controleert of het element nog bestaat. | Bestaande proeven, aangevuld met de vier meegeleverde verhaalproeven. De oude previewblokkade voor de weekfunctie is door de engine-update vervallen. |

Bij het samenbrengen van #117 en #121 is alleen de achterhaalde
previewblokkade verwijderd. De nieuwe rekenbladengine geeft voor de lege
weekfunctie een normale foutwaarde; een voorafgaande wijziging blijft behouden.

## Resultaten van de eindcontrole

- TypeScript geslaagd.
- 136 testbestanden geslaagd: 1.570 proeven geslaagd, zeven overgeslagen
  wegens ontbrekende externe database- en versleutelingscorpusbestanden.
- De aanvullende opdrachtcontroles voor tekst (68), rekenblad en presentatie
  (10) zijn geslaagd, inclusief opslaan en heropenen.
- Productiebuild geslaagd. De bouw meldt nog grote JavaScript-bundels,
  genegeerde pakketdirectieven en verschillende JSON-importattributen.
- Aanvullende browserproef van de formulebalk: `=ISOWEEKNUM()` geeft in A1
  `#VALUE!`; daarna geeft `=1+1` in A2 gewoon `2`.

## Niet opgelost

De vervolgronde herstelt #123 en het lijstvervolg uit #122. De nieuwe
alinea krijgt haar lijstverwijzing en tekengegevens binnen dezelfde
invoerbewerking. Ook de nummerknop kiest nu een echte decimale definitie,
zodat genummerde tekst na bewaren geen opsomming wordt. Echte engineproeven
controleren beide lijstsoorten, bewaren/heropenen en undo/redo. De gebouwde
interface toont item 1 en 2; de gedownloade DOCX bevat twee verwijzingen naar
dezelfde decimale definitie.

Tab doorloopt de bestaande tabelcellen en voegt rechtsonder een rij toe
(#128). De actuele rasterplek wordt opgezocht in de tabelstructuur, zodat
blijvende cel-ids na rijinvoeging of celsplitsing geen verkeerde positie
opleveren (#137). De interfaceproef met vier celteksten en een nieuwe derde
rij is opgeslagen, heropend en met undo/redo gecontroleerd.

De gewone lijstknoppen gebruiken deze aansluiting in de bewerkmodus. Bij
wijzigingen bijhouden of ontbrekende definities blijft de oorspronkelijke
engineopdracht in gebruik. Voor wijzigingen bijhouden is geen volledige
visuele vrijgave gedaan.

Het volledige register van de lopende controle staat in
[de issuelus](2026-11-05-tauri-issuelus.md). Niet alle 118 open issues zijn
hersteld of afgetekend.

De overige open meldingen zijn niet afgetekend. In het bijzonder zijn
meldingen op de ontwikkelbuild 2026.45.17 gebaseerd op een bron uit de native
migratiebranch; dat is geen reproductie op de Tauri-hoofdtak. Ook oudere
meldingen vragen een afzonderlijke controle op deze suite voordat ze kunnen
worden gesloten. De brede routekaart voor formaten, agenda, tekst, presentatie
en rekenblad is geen lijst van reeds gereproduceerde fouten.

## Herhalen

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
pnpm test:opdrachten
```

De browserproeven draaien op de webinterface van dezelfde Tauri-bron.
Er is geen nieuwe installer gepubliceerd. De native systeemklembordproef
draait op een geïsoleerd X11-display; volledige native webviewbediening is
nog niet afgetekend. Externe corpusgevallen mogen alleen als
gecontroleerd gelden wanneer de benodigde bestanden werkelijk aanwezig zijn.

## Lange alinea omzetten naar hoofdletters (#142)

Een synthetische alinea van 785 tekens veroorzaakte ook op Tauri de fout:
648 losse lettervervangingen overschreden de grens van 128 stappen. De
opdracht vervangt nu één aaneengesloten opmaakstuk per stap, met behoud
van de oorspronkelijke tekenopmaak en de tekst- en versiecontroles van
de host. Onduidelijke tekstprojecties worden niet grofweg vervangen.

Zeven proeven met de echte engine controleren lange tekst, gemengde
opmaak, Unicode, gedeeltelijke selectie, tabelcellen, undo/redo en
bewaren/heropenen. De oude productie-interface gaf bij 785 tekens een
fout; dezelfde proef slaagt in de nieuwe bouw. De opgeslagen XML is exact
gelijk aan de verwachte 785 tekens in hoofdletters. Heropenen toont alle
130 woorden en 785 tekens. Bewijs: [heropend document](../screenshots/test-tauri-hoofdletters-2026-11-05.png).

De volledige suite telt nu 134 bestanden, 1.553 geslaagde en zeven
overgeslagen tests. De productiebuild slaagt. De grens van de host blijft
gelden voor uitzonderlijke selecties met meer dan 128 verschillende
opmaakstukken; zo'n bewerking wordt veilig geweigerd.

## Hyperlinkadres bewerken zonder tekstverlies (#146)

De minimale proef reproduceert de melding ook op Tauri: klikken op de vierde
letter van `Testlink`, het adres wijzigen en toepassen liet alleen `t` over.
De kliktreffer bevat één getekende letter. De aansluiting vraagt nu de
volledige koppeling op bij dezelfde enginezoeker die ook het te bewerken
bereik bepaalt. Ongewijzigde linktekst wordt niet opnieuw ingevoegd, zodat
een adreswijziging de bestaande tekenopmaak behoudt. De gerichte aansluiting
weigert een ongemerkte wijziging van de vastgezette enginebron.

Drie regressieproeven controleren broncompatibiliteit en de echte engine in
hoofdtekst en tabelcel, met gemengde opmaak, undo/redo en bewaren/heropenen.
De productie-interface vult `Testlink` in, behoudt acht tekens na toepassen,
zet alle acht links naar de nieuwe bestemming en herstelt met undo het oude
adres. Redo, DOCX-XML en heropenen bevestigen de nieuwe bestemming.
Bewijs: [heropende koppeling](../screenshots/test-tauri-hyperlink-2026-11-05.png).

De volledige suite telt nu 135 bestanden, 1.556 geslaagde en zeven
overgeslagen tests; de productiebuild slaagt.

## Puntvulling bij eerste invoeging van de inhoudsopgave (#145)

De tijdelijke cursormarkering werd meegenomen bij het vergelijken van
kopteksten. Met de cursor op de eerste kop werd die kop daardoor niet
gekoppeld aan een bladwijzer; de eerste weergave tekende kop en paginanummer
tegen elkaar. Bij volledig bijwerken was de markering weg en werkte de
koppeling wel. De vergelijking laat nu uitsluitend deze tijdelijke markering
weg; de oorspronkelijke koptekst en documentopmaak blijven behouden.

Drie regressieproeven plaatsen de cursor aan het begin, midden en eind van
een kop. Alle drie krijgen meteen een gekoppelde inhoudsopgaveregel met
rechtertab en puntvulling; volledig bijwerken verandert de regel daarna niet.
De productie-interface toont direct na invoegen de puntjes en het nummer
rechts; ook [de variant met twee niveaus](../screenshots/test-tauri-inhoudsopgave-twee-2026-11-05.png) is rechtstreeks na invoegen gecontroleerd. De opgeslagen XML bevat de bijbehorende bladwijzer en het heropende
document behoudt de juiste weergave. [Interfacebewijs](../screenshots/test-tauri-inhoudsopgave-2026-11-05.png).

De volledige suite telt 135 bestanden, 1.559 geslaagde en zeven overgeslagen
tests; typecontrole en productiebuild slagen.

## Nog open: nootverwijzingen (#144)

Beide noottypen zijn in de productie-interface ingevoegd en op Romeinse
kleine letters vanaf drie ingesteld. De hoofdtekstverwijzingen blijven
`1`; de noten gebruiken `iii`. Onafhankelijke controle van het gedownloade
bestand bevestigt voor beide typen `lowerRoman` en `numStart=3` in de
sectie-instellingen. De opgeslagen instellingen zijn dus niet verdwenen.
Deze fout is gereproduceerd, maar nog niet hersteld of afgetekend.

## Systeemklembord (#126)

De Tauri-route leest rechtstreeks het actuele systeemklembord via de
officiële plug-in. Een fout valt niet terug op een mogelijk verouderd
browserklembord. Het lint, Ctrl+V en plakken zonder opmaak gebruiken dezelfde
route. Er is alleen leestoegang voor de bestaande lokale vensters toegevoegd.

Naast de acht routeproeven is de echte JS-plug-inopdracht door gesimuleerde
IPC gecontroleerd. Een optionele native proef gebruikt twee afzonderlijke
plug-inverbindingen op een geïsoleerd X11-display: de bron kopieert tekst en
vervangt die; de ontvanger leest beide actuele waarden. Deze proef slaagt,
zonder het klembord van de gebruikerssessie aan te raken. De 109 gewone
schilproeven en vijf expliciet ingeschakelde conversieproeven slagen eveneens.

De browserproef combineert extern plakken, een gewijzigde externe kopie en
intern kopiëren/plakken; bewaren en heropenen behouden beide volledige
alinea's. [Interfacebewijs](../screenshots/test-tauri-plakken-2026-11-05.png).
Native webviewbediening op Windows, macOS en Linux blijft een afzonderlijke
open controle; deze laagproeven zijn daarvoor geen vrijgave.

## Rasterverwijzingen uit de uitgebreide formulebalk (#58)

De praktijkcontrole vond een invoerfout: tijdens het bewerken van een formule
in de uitgebreide balk verplaatste een rasterklik de doelcel en ging de
concepttekst verloren. De balk onderschept nu een verwijzingsgebaar met de
openbare rastergeometrie, houdt de doelcel vast en voegt het gekozen bereik
in de concepttekst in. Elke sleepstand rekent vanaf dezelfde oorspronkelijke
invoegplek. Een bestaande verwijzing wordt als geheel vervangen; tekst erna
blijft behouden. Annuleren van het aanwijzergebaar herstelt de oorspronkelijke
concepttekst. Tekst binnen aanhalingstekens wordt niet als verwijzingsplek
gebruikt. Er wordt pas bij bevestigen een celbewerking opgeslagen.

Elf regressieproeven behandelen invoegplekken, selecties, omgekeerd slepen,
herhaald slepen, bestaande verwijzingen en aanhalingstekens. De productieproef
voert 12,5 en 7,5 in, selecteert een bereik via het naamvak, controleert de
volledige F4-cyclus en gebruikt functiezoeken met argumentuitleg en resultaat
20. In de gerepareerde uitgebreide balk kiest de muis eerst één cel en daarna
A1:A2, met behoud van doelcel D3 en de omliggende formuletekst. De voltooide
formule is `=SUM(A1:A2)`, uitkomst 20; één undo maakt D3 leeg en redo herstelt
20. De gekleurde rastermarkering volgt A1:A2.

De gedownloade XLSX bevat `SUM(A1:A2)` en resultaatcache 20 in D3; de vijf
bestaande controlecellen blijven behouden. Heropenen toont opnieuw dezelfde
formule en uitkomst. [Interfacebewijs](../screenshots/test-tauri-formuleverwijzing-2026-11-05.png).
De brede functie-issue is hiermee nog niet volledig afgetekend.

Volledige controle: 136 testbestanden, 1.570 geslaagde en zeven overgeslagen
tests; typecontrole en productiebuild geslaagd.


## Hoge tabelcellen en actuele celselectie (#138, aanvulling #129)

Een klik onderin een hoge cel plaatste de cursor soms in de alinea na de
tabel. De muisroute toetst nu eerst het werkelijk getekende celvlak en zoekt
daarbinnen de bijbehorende tekstpositie. Randen behouden hun eigen bediening.
De selectie blijft de bestaande bewerkingswachtrij gebruiken.

Twee interne meldingssleutels hielden de eerste celselectie vast zolang de
tekstcursor gelijk bleef. Beide bevatten nu ook de celselectie. Het eigen
selectievlak en de kolomgrepen volgen bovendien gemeten celgrenzen wanneer
de tabel smaller wordt getekend dan de opgeslagen kolombreedtes.

Zeven engineproeven behandelen de bronankers en echte lay-out met hoge cellen,
een ingevoegde kolom, samenvoegen, marges, tekstrichting en gemengde inhoud.
Vier rasterproeven behandelen schaling, samengevoegde cellen en ontbrekende
grenzen. In de productie-interface zijn lege en gevulde cellen aangeklikt,
kolommen ingevoegd, celmarges en tekstrichting veranderd en een andere zoom
gebruikt. Invoer bleef in de gekozen cel. Selecteren in beide richtingen
geeft direct alle zes celvlakken. Samenvoegen en terugdraaien met de lintknop
behouden inhoud en celopmaak. Toetsenbord-undo met de focus op een lintknop
is daarmee niet afgetekend en blijft onderdeel van de sneltoetscontrole.

Onafhankelijke XML-controle van de download bevestigt twee rijen met drie
cellen, de oorspronkelijke teksten en de gedraaide middelste cel. Na
heropenen zijn de zes cellen opnieuw geselecteerd en is onderin de rechtercel
tekst ingevoerd; die verschijnt binnen de cel.
[Interfacebewijs](../screenshots/test-tauri-tabelcursor-2026-11-05.png).

Volledige controle: `pnpm exec vitest run --maxWorkers=2` slaagt met 138
bestanden, 1.581 geslaagde en zeven overgeslagen tests. Onbegrensde gelijktijdige
WASM-initialisatie raakte op deze machine de bestaande starttijdlimiet;
begrensde uitvoering slaagt zonder ruimere tijdlimieten. Typecontrole en
productiebuild slagen eveneens.


## Tabel splitsen met behoud van geschiedenis (#139)

De pakketroute is vervangen door een bewerking binnen dezelfde Yrs-sessie.
De onderste rijen verhuizen met hun bestaande celverhalen naar een tweede
tabel; een alineamarkering scheidt de tabellen. Raster, tabel- en celopmaak
blijven behouden. Een verticale samenvoeging over de splitsgrens wordt vóór
de wijziging geweigerd. De kopregelmarkering blijft in de bovenste tabel.

Undo verwijderde aanvankelijk wel de tweede tabel, maar de bewaarde
celselectie verwees daarna nog naar dat verwijderde embed. Dat gaf een fout
bij het verversen van de interface. De aansluiting voor geschiedenis herstelt
alleen zo'n ongeldige selectie naar de actuele positie van het celverhaal.
De native tabelcontext en geschiedenis gebruiken eveneens de actuele plek,
in plaats van het oude tabelnummer in de blijvende verhaalnaam.

Vijf proeven controleren bronankers, behoud van verhalen en opmaak, eerdere
geschiedenis, de echte aangepaste native Undo/Redo-opdracht, bewaren en
heropenen, en weigeren zonder wijziging bij een ongeldige splitsgrens.
De productie-interface splitst een bewaarde tabel met een gedraaide cel,
draait die in één stap terug, draait ook eerdere tekstinvoer terug en voert
beide stappen opnieuw uit. Ctrl+Z vanuit de tabelcel herstelt de tabel eveneens
zonder consolefout. De onafhankelijke XML-controle van de download bevestigt
twee tabellen met drie kolommen, alle oorspronkelijke teksten, de eerdere
invoer en de tekstrichting. Heropenen toont beide tabellen met dezelfde
inhoud en gedraaide cel.
[Undo in de interface](../screenshots/test-tauri-tabelsplitsing-undo-2026-11-05.png).

De volledige suite slaagt met `pnpm exec vitest run --maxWorkers=2`: 139
bestanden, 1.586 geslaagde en zeven overgeslagen tests. Typecontrole,
productiebuild en vertaalcontrole slagen. De vertaalcontrole meldt de bestaande
23 taalmapwaarschuwingen. De tabelklikproef leest zijn lettertype nu rechtstreeks
uit de geïnstalleerde afhankelijkheid, zodat ook een schone bouwomgeving die
proef kan uitvoeren zonder vooraf gevulde publieke assetmap.


## Gescheiden tekstkolommen op A5 (#143)

De gecombineerde proef is gereproduceerd met 785 tekens, uitvullen,
1 cm inspringing, vier alinearanden, A5 liggend, smalle marges en twee gelijke
kolommen. De regels waren correct afgebroken, maar de alinea-fragmenten hadden
de volledige tekstbreedte van de pagina. Uitvullen en de randen gebruikten
die verkeerde breedte. Daardoor liepen de kolommen door elkaar en buiten de
pagina. [Voor de reparatie](../screenshots/test-tauri-kolommen-voor-2026-11-05.png).

Het indelingsverzoek gebruikt nu de bestaande expliciete kolomroute met
dezelfde verdeling uit aantal en tussenruimte. Die route bewaart de werkelijke
kolombreedte van de fragmenten. Alleen de tijdelijke sectie-eigenschappen van
het verzoek veranderen; het document zelf blijft gelijke kolommen bevatten.
Bestaande ongelijke kolommen en documenten met één kolom blijven bij hun
bestaande indeling. Breedtes van afzonderlijke kolommen die bij gelijke
kolommen niet tellen, worden ook in de equivalente indeling niet gebruikt.

Acht proeven bewaken de bronkoppeling, onveranderde documenteigenschappen en
zes echte enginevarianten met twee of drie kolommen, verschillende uitlijning,
inspringing en randen. De proeven toetsen de fragmentbreedte en de positie van
alle zichtbare tekens, de alinearanden en behoud van alle tekst. Afsluitende,
niet-getekende spaties mogen hun bestaande positie buiten de regel houden.
De opgeslagen kolominstellingen blijven ongewijzigd.

De productie-interface toont de oorspronkelijke proef leesbaar. Een wijziging
naar centreren en Ctrl+Z behouden de juiste kolommen. Onafhankelijke
XML-controle van de download bevestigt alle 785 tekens, papierformaat, marges,
kolominstellingen, inspringing, uitvullen en vier randen. Na heropenen blijven
beide kolommen leesbaar, zonder consolefout.
[Herstelde weergave](../screenshots/test-tauri-kolommen-hersteld-2026-11-05.png).

Volledige controle: `pnpm exec vitest run --maxWorkers=2` slaagt met 140
bestanden, 1.594 geslaagde en zeven overgeslagen tests. Typecontrole en
productiebuild slagen eveneens. Het brede kolommen-issue #55 vraagt daarnaast
nog verdere toetsing van zijn overige functies.


## Herkenbare tabelacties en eigen scheidingsteken (#136, #140)

De invoegknoppen voor rijen en kolommen houden hun specifieke actielabels.
Vier verschillende pijlpictogrammen maken boven, onder, links en rechts
herkenbaar. In de compacte lintstand worden deze labels niet meer verborgen.
Het bestaande lint kan de groepen bij minder ruimte als gelabeld menu tonen.
In de productie-interface zijn alle vier acties uitgevoerd: twee bij twee
cellen wordt vier bij vier. Vier Undo-stappen herstellen de oorspronkelijke
tabel. [Normaal lint](../screenshots/test-tauri-tabelknoppen-2026-11-05.png).
Een tijdelijke controle met 620 pixels beschikbare lintbreedte toont de
menu's Rijen en Kolommen met volledige actielabels. Vanuit beide menu's is
een invoegactie uitgevoerd. De tijdelijke controlepagina is daarna verwijderd.
[Smal lint](../screenshots/test-tauri-tabelknoppen-smal-2026-11-05.png).

Het scheidingstekenveld gebruikt de eerder toegevoegde thema-eigen achtergrond,
tekst, binnenmarge en vaste minimummaat. De productiecontrole bevestigt 39 ×
30 pixels en een goed herkenbaar `|`. Met en zonder focus blijven tekst- en
achtergrondkleur gelijk. In donker zijn tekst en cursor RGB 242/242/240 op
42/42/49; in licht RGB 43/47/54 op wit.
[Donker](../screenshots/test-tauri-scheidingsteken-donker-2026-11-05.png) en
[licht](../screenshots/test-tauri-scheidingsteken-licht-2026-11-05.png).

De conversieproef vond daarnaast een ongeldige celselectie na het verwijderen
van de tabel. De native koppeling wist nu alleen een selectie waarvan het
tabelobject niet meer bestaat. Geldige selecties blijven intact; andere
fouten blijven zichtbaar. De tekstcursor verhuist vóór het verwijderen naar
de hoofdtekst, zodat directe wijzigingswaarnemers geen verwijderd celverhaal
hoeven uit te lezen. Vijf regressieproeven behandelen de bronankers, geldige en
ongeldige selecties, andere fouten, de echte native selectiestaat en de
gepubliceerde conversie. Een tegenproef met de oude cursorvolgorde faalt.

De interface zet a/b/c/d om naar `a|b` en `c|d`. Eén Undo herstelt de tabel;
Redo herstelt de twee alinea's. De onafhankelijke XML-controle bevestigt dat
de download geen tabel meer bevat en beide alinea's met `|` bewaart. Heropenen
behoudt hetzelfde resultaat. [Opgeslagen conversie](../screenshots/test-tauri-tabel-naar-tekst-2026-11-05.png).

## Workerterugval blijft open (#135)

De oorspronkelijke melding over een niet-geïnitialiseerde worker is in deze
ronde niet gereproduceerd. Na tabelconversie is wel een verwante fout zichtbaar
in de console: de achtergrondworker vraagt een inmiddels verwijderd celverhaal
op en valt terug op de hoofdthread. De conversie, Undo/Redo en bewaren blijven
werken. De verbeterde lokale selectieafhandeling neemt deze workerterugval
nog niet weg; de workerlevenscyclus is hiermee niet afgetekend.


Volledige controle van deze ronde: `pnpm exec vitest run --maxWorkers=1`
slaagt met 141 bestanden, 1.599 geslaagde en zeven overgeslagen tests.
Twee gelijktijdige testworkers raakten op deze machine incidenteel de bestaande
opstarttijdlimiet van vijf seconden bij zware engineproeven. Eén worker slaagt
zonder verruimde tijdlimieten. Typecontrole en productiebuild slagen eveneens.
