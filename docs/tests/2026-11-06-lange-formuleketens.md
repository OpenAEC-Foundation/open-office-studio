# Lange formules en celinvoer

De bestaande Tauri-/webeditor bewaart en berekent lange vlakke formuleketens
weer als formules. De aanvullende celinvoer via F2 heeft nu dezelfde
verwijzingskleuren en bereikkeuze als de formulebalken. Het parallelle native
interfacetraject (#116) valt buiten deze wijziging.

Dit voltooit de lokale acceptatieproeven van #58, naast PR #158. Aftekening
op GitHub volgt na de platformcontroles en merge. Het bredere #59 blijft open.
De gepubliceerde installers van v2026.45.1 bevatten deze correctie niet.

## Reproductie en kerncorrectie

In de oorspronkelijke vastgezette kern rekent een keten van honderd A1-termen
correct. Vanaf 101 termen veroorzaakt de links geneste expressieboom een
overschrijding van de AST-dieptegrens. Bij 200 en 400 termen maakt de gewone
invoer daarvan stilzwijgend tekst; de expliciete formulebewerking weigert de
formule. De [eerdere tegenproef](lange-formule-kern-tegenproef-2026-11-06.jsonl)
legt dat vast. Met de nieuwe acht gerichte app-proeven faalt de oorspronkelijke
kern zevenmaal; alleen de weigering van werkelijk te diepe invoer slaagt.

De parser vouwt lange links opgebouwde bewerkingen nu in een vlakke keten.
Bewerkingen worden strikt in de oorspronkelijke volgorde uitgevoerd. Er is
geen algebraïsche hergroepering en de dieptebescherming is niet verhoogd.
De grenzen blijven 100 voor syntactische/AST-nesting, 10.000 tokens en
32.768 formulebytes. Vijfduizend eenvoudige termen passen binnen de bestaande
tokengrens; 5.001 termen worden nog steeds geweigerd.

De patch verwerkt deze representatie ook in scalaire en matrixberekening,
foutvolgorde, formuletekst, afhankelijkheden, blad- en naamresolutie,
voorwaardelijke-opmaakverwijzingen en het herschrijven van verwijzingen.
De proeven controleren rijen invoegen, een bereik verplaatsen en een blad
hernoemen met verwijzingen aan het begin én het einde van de lange keten.
Undo en bewaren/heropenen behouden alle bijgewerkte verwijzingen.

## Herkomst en bitgelijke herbouw

De [bronpatch](../../patches/rekenbladengine-lange-ketens.patch) past zonder
fuzz op broncommit `4e982c3aea0065578604c3fe7727938533888f66`. Alle elf gewijzigde
bronbestanden zijn daarna bytegelijk aan de geteste bron. De schone bron met
uitsluitend deze XLSX-patch voldoet aan de volledige formatcontrole.

- Patch-SHA-256: `c19d5e65df78b2bb831cd02536843eb71ff9d2079c6998da2bdc90f78b81e41b`.
- WASM-SHA-256: `385e2c53ddcbddded2060cb1d749b6c0e9b3b84f87f73290c71e82932271a702`.
- Omvang: 7.670.630 bytes; Rust 1.98.1, wasm-bindgen 0.2.129 en Binaryen 132, met `-O3`.

Een tweede bouw via `scripts/bouw-rekenbladkern.py`, vanuit een nieuw uitgepakt
bronarchief, levert exact dezelfde bytes. Het bouwscript eindigt met code 0;
de omhullende exec-sessie rapporteert daarna 143. De eindbestanden, bouwmetadata
en verplichte checksumvergelijking zijn afzonderlijk gecontroleerd. Zie
[het herbouwbewijs](rekenbladkern-herbouw-2026-11-06.json).

De oorspronkelijke npm-kern blijft intact. De build bewaakt beide kernhashes,
de bronpatch en alle import-/exportnamen en -soorten van de JS/WASM-interface.
Er wordt precies één XLSX-kern in de productie-assets opgenomen. De hoofdapp
en workers gebruiken dezelfde aansluiting; ook de Node-proeven laden deze kern.

## Celinvoer via F2

De zichtbare celinvoer is rechtstreeks native gecontroleerd: 64 × 18,65625
pixels bij E2. Het is geen verborgen éénpixelveld. In de tegenproef stond
=B1+A1 zwart in de cel, met twee gekleurde rastermarkeringen maar zonder
gekleurde tekstlaag. Slepen vanuit =SUM( legde het onafgemaakte concept vast
en verplaatste de selectie naar A1:A2.

De kleurlaag volgt nu ook dit veld en zijn afmetingen. De bereikkeuze houdt
het oorspronkelijke veld, concept en doelcel vast. Klikken in het invoerveld
zelf blijft een gewone cursorklik. De native proef bevestigt:

- B1 blauw en A1 rood in zowel celinvoer als raster; de tekstkopie is
  verborgen voor hulptechnologie en ontvangt geen pointerbediening.
- Klikken binnen het veld verplaatst de cursor zonder de tekst te wijzigen.
- Alle vier F4-stappen, aanvullen van =SU naar SUM( met pijltjes/Tab en de
  uitleg voor het actieve argument werken in de cel.
- Slepen over A1:A2 behoudt E2 als doelcel; vastleggen geeft SUM(A1:A2)=30.
  Undo maakt E2 leeg en Redo herstelt dezelfde formule en waarde.
- Een lange formule in de cel blijft juist uitgelijnd bij 8.747 pixels
  horizontale verschuiving en bij teruggaan naar het begin. Na verlaten zijn
  formule en schone opslagstatus behouden.

Zie de tegenproeven voor [kleuren](celinvoer-kleuren-tegenproef-2026-11-06.json)
en [bereikkeuze](celinvoer-muis-tegenproef-2026-11-06.json), het
[herstelde celinvoerbewijs](celinvoer-native-2026-11-06.json) en de
[lange celinvoer](celinvoer-lang-native-2026-11-06.json). De beelden
[vóór herstel](../screenshots/test-celinvoer-kleuren-voor-2026-11-06.png),
[na herstel](../screenshots/test-celinvoer-kleuren-hersteld-2026-11-06.png),
[aan het einde](../screenshots/test-celinvoer-lange-formule-eind-2026-11-06.png)
en [aan het begin](../screenshots/test-celinvoer-lange-formule-begin-2026-11-06.png)
zijn visueel gecontroleerd.

## Gezamenlijke app- en opslagproef

De volledige formulebediening van PR #158 is opnieuw met de nieuwe kern
beproefd: beginselectie A1/10, adres/naam/bereik, beide formulebalken,
functiedialoog met categorie/zoeken/argumentuitleg/voorbeeld, invoegen met
Undo/Redo, vier F4-stappen, kleuren, muisbereiken en horizontaal/verticaal
scrollen. Zie [het gezamenlijke bewijs](formulebediening-kern-native-2026-11-06.json).

Daarnaast is een keten van vierhonderd A1-termen werkelijk getypt. Bij A1=10
rekent zij 4000; Undo/Redo herstelt de eerdere respectievelijk nieuwe formule.
A1 wijzigen naar 11 geeft 4400. De bewaartitel blijft 2,072 seconden schoon
binnen 2,263 seconden na Ctrl+S, met gewijzigde bestandstijd. De tab is gesloten
en dezelfde werkmap via de native bestandskiezer heropend. Formule en 4400
blijven exact gelijk. Onafhankelijke ZIP-/XML-inspectie bevestigt de 400-termen-
formule, A1=11, D2=4400, de vanuit F2 gemaakte E2-formule met waarde 31 en het
ongewijzigde benoemde bereik Getallen.

Bij deze eerste gezamenlijke proef heeft de geladen editors-bundel SHA-256
`bc1565668b29237f5927f04841f5d3cbd0ce0f4d637ed4c863f1c6cda0fa2dd1`;
de uit de native app opgehaalde XLSX-WASM heeft de hierboven genoemde hash.
Alle definitieve bedieningcontroleurs slagen met code 0 en registreren nul
consolefouten. Het langlopende harnas eindigt later met 143 zonder
opruimrapport. De eigen app- en X11-procesgroepen zijn daarna op PID,
opdrachtregel en groepsleider gecontroleerd en afzonderlijk afgesloten;
dit staat expliciet in de bewijzen. Het gebruikersprofiel blijft buiten de proef.

[Native ketenbewijs](lange-formule-native-hersteld-2026-11-06.json),
[opgeslagen werkmap](lange-formule-native-hersteld-2026-11-06.xlsx) en
[scherm na heropenen](../screenshots/test-lange-formule-heropend-2026-11-06.png).

## Nacontrole van herhaalde verwijzingen

De aanvullende native tegenproef met `=A1+$A$1+A$1+$A1+B1+A1` toont zes
verschillende tekstkleuren en zes rasterkaders, waarvan vijf over dezelfde
cel A1. De laatste kleur bedekt daardoor de eerdere kleuren in het raster.
Zie [het beeld vóór herstel](../screenshots/test-herhaalde-verwijzingen-voor-2026-11-06.png).

Een gedeelde kleurtoewijzing vergelijkt nu blad en genormaliseerd bereik.
Absolute/relatieve schrijfwijze, hoofdletters, expliciete verwijzingen naar
het huidige blad en omgekeerde bereikrichting leveren dezelfde kleur op.
Elk uniek bereik krijgt één rasterkader; de tekst behoudt alle oorspronkelijke
verwijzingen. Andere bladen en andere bereiken blijven afzonderlijk herkenbaar.
Het palet herhaalt pas na acht unieke bereiken.

Acht gerichte proeven bewaken deze gevallen, inclusief bladnamen met een
apostrof en celachtige tekst buiten verwijzingen. Negen native proeven slagen:
celinvoer, ingeklapte balk en uitgeklapte balk, ieder met herhalingen, een
expliciete huidige bladnaam en vierhonderd gelijke verwijzingen. De laatste
krijgen steeds vierhonderd blauwe tekstfragmenten en precies één blauw rasterkader.
Selectie E2 blijft behouden; Escape laat het opgeslagen document ongewijzigd.
De [celinvoer](../screenshots/test-herhaalde-verwijzingen-cel-2026-11-06.png),
[balk](../screenshots/test-herhaalde-verwijzingen-formulebalk-2026-11-06.png) en
[uitgeklapte balk](../screenshots/test-herhaalde-verwijzingen-uitgevouwen-2026-11-06.png)
zijn visueel gecontroleerd.

De eerste automatisch geïnjecteerde lange invoer bereikte de wachtgrens terwijl
de toetsen nog verwerkt werden. De tekst groeide daarna verder tot de exact
verwachte 1.200 tekens. De definitieve proef gebruikt een normaal toetsinterval
en wacht expliciet op de volledige veldwaarde, kleurtekst en het aantal kaders.

Met deze laatste frontend zijn ook de volledige F2-bediening, F4, aanvullen,
bereikslepen, Undo/Redo en de opslag-/heropenproef opnieuw geslaagd. De keten
rekent 4000 en na A1=11 opnieuw 4400. Bewaren duurt 2,243 seconden, waarvan
2,080 seconden met een schone titel. Onafhankelijke ZIP-/XML-inspectie bevestigt
de exacte formule, opgeslagen waarden en het ongewijzigde benoemde bereik.

De uit deze native app opgehaalde editors-bundel heeft SHA-256
`37d8f2e4f8a1f2cb67ba9634a1280af377f7a0f610832cebd018511b3951aaed`;
de opgehaalde XLSX-kern behoudt hash `385e2c53…271a702`. Alle definitieve
controleurs en het harnas eindigen met code 0; de eigen app en X11-server zijn
automatisch afgesloten. Er zijn geen consolefouten geregistreerd. Zie het
[aanvullende native bewijs](herhaalde-verwijzingen-native-2026-11-06.json) en de
[opgeslagen werkmap](herhaalde-verwijzingen-native-2026-11-06.xlsx).

## Controles en grenzen

- De volledige XLSX-kern-, mutatie- en facadeset slaagt: 1.725 tests, zestien
  bestaande overgeslagen gevallen, verdeeld over 66 testdoelen.
- Clippy met `-D warnings` voor alle testdoelen van de drie betrokken pakketten
  en de formatcontrole op de schone gepatchte bron slagen.
- De volledige app-set slaagt: 152 bestanden, 1.744 tests en zeven bestaande
  overgeslagen corpusgevallen. Typecontrole, productie- en native bouw slagen.
- De acht gerichte WASM-proeven controleren ook matrixberekening,
  foutvolgorde, afronding, expliciete formules en het blijven weigeren van
  werkelijk te diepe invoer zonder werkmapwijziging.

De native bediening is op Linux beproefd; Windows en macOS krijgen hun
platformcontroles in de PR. Dit is geen volledige aftekening van #59, van alle
functies of van alle interfacenotaties. Samenstelling met een invoermethode is
in deze ronde niet afzonderlijk native getest.
