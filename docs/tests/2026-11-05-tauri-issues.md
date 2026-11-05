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
- 134 testbestanden geslaagd: 1.553 proeven geslaagd, zeven overgeslagen
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
Er is geen nieuwe installer gebouwd of gepubliceerd, en geen native
besturingssysteemproef uitgevoerd. Externe corpusgevallen mogen alleen als
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
