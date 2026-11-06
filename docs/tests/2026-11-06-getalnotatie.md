# Werkmapregio en getalnotatie — lopende herstelronde

#64 blijft open; [PR #164](https://github.com/OpenAEC-Foundation/open-office-studio/pull/164)
is een concept. De kern en interface zijn aangesloten in deze branch. De
openbare installers van 2026-W45.1 en 2026-W45.2 zijn ongewijzigd.

## Afwijking en herstel

De oorspronkelijke appkern (`385e2c53…`) gaf `1,234.50` voor de waarde 1234,5
met code `#,##0.00`, ook met een Nederlandse LCID. De Nederlandse datumcode
`[$-413]dddd d mmmm yyyy` leverde Engelse woorden. Het voorbeeldvenster had
een afzonderlijke benadering en kon daardoor afwijken van het raster. De
[synthetische werkmap](getalnotatie-kern-tegenproef-2026-11-06.xlsx) en
[kernlezing](getalnotatie-kern-tegenproef-2026-11-06.json) leggen dit vast.

De formatter ondersteunt nu tien bestandsregio’s: de negen actieve
interfaceregio’s en en-US. Alleen cijferdelen krijgen regionale
scheidingstekens; aangehaalde tekst blijft intact. Expliciete LCID-/taaltags
bepalen de datumwoorden. Franse groepering gebruikt een smalle vaste spatie;
de UTF-8-offsets en opvulgeometrie blijven correct. Notatiecodes en opgeslagen
numerieke waarden blijven in standaardnotatie. Bestaande expliciete
notatiecodes worden bij een regiowissel behouden.

De verborgen globale constante `_OpenAEC_NumberLocale` bewaart de regio.
Alleen een bekende, letterlijk aangehaalde tag wordt als instelling gelezen.
Een onbekende waarde blijft behouden; een zichtbare gebruikersnaam wordt
niet stil overschreven. Lokale namen gelden niet als bestandsinstelling. De
instelling is verborgen en beschermd in Naam beheren. Bestaande zichtbare of
lokale gebruikersnamen met dezelfde naam blijven beheerbaar.

De app voegt bij laden een beginregio toe als het bestand die nog niet heeft.
Daarna verandert een interfacetaalwissel de bestandsregio niet. De
initialisatie bewaart overige pakketonderdelen bytegelijk, respecteert
XML-voorvoegsels en levert bij twee systeemklokken gelijke bytes.

## Invoer en venster

Cel- en gewone formulebalkinvoer gebruiken de regionale kernparser.
Uitgebreide formulebalk en externe plaktekst geven expliciet
`localized: true` aan de batch mee. Bestaande canonieke `setCellInputs`-aanroepen
blijven ongewijzigd. Waarde en afgeleide datum-/procentnotatie horen bij één
Undo-stap. De oude nabehandeling met timers is verwijderd.

Plakken respecteert de tekstnotatie van het doel en laat overgeslagen cellen
ongemoeid. Interne kopieën gebruiken getypeerde waarden, ook tussen regio’s.
Canonieke HTML-getalvelden (`x:num`/`sdval`) worden afzonderlijk van regionale
tekst gelezen. Speciaal plakken en filtervoorwaarden lezen de bron met
dezelfde kern, regio en datumoorsprong, in een afzonderlijke lege werkmap.
Numerieke filtergrenzen worden eenmaal vastgelegd en canoniek bewaard.

Celeigenschappen › Getal biedt de bestandsregio naast alle elf categorieën.
Regio en celnotatie worden samen als één wijziging opgeslagen, met een
versiecontrole op het oorspronkelijke doelblad. Het venster leest de exacte
opgeslagen code, ook voor lege opgemaakte cellen. Voorbeelden gebruiken de
werkelijke kern met afzonderlijke werkmappen voor datumstelsel 1900 en 1904;
er wordt niets in het gebruikersbestand gewijzigd. Negatieve kleuren,
haakjes, datumtaal en boekhouding volgen dezelfde formatter als het raster.

## Bron en herbouw

De [regiopatch](../../patches/rekenbladengine-werkmapregio.patch) wordt na de
lange-ketenspatch op de vastgezette bron toegepast. De
[patchcontrole](getalnotatie-patchcontrole-2026-11-06.json) verifieert alle
21 gewijzigde bronbestanden na toepassen zonder fuzz. De productiecontrole
bewaakt beide patchhashes, oorspronkelijke en aangepaste WASM en het volledige
JS/WASM-contract. De npm-pakketten blijven ongewijzigd.

De aangesloten kern is 7.693.158 bytes, SHA-256
`a46812258ad5efcc54d0cba42bdfc21b99b4f3c873d3e9d701098f7712ee8f07`.
Een schone herbouw uit het gecontroleerde bronarchief met beide patches
levert bytegelijk deze kern; zie het
[herbouwbewijs](getalnotatie-kernherbouw-2026-11-06.json). De 21 imports en
95 exports blijven gelijk. De eerste uitvoering bereikte de gelijke
kernbytes, maar miste Node op PATH bij de contractcontrole. Een tweede schone
uitvoering met de vastgezette Node op PATH slaagt volledig.

Zeven [echte JS/WASM-proeven](getalnotatie-regionale-batch-wasm-2026-11-06.json)
controleren regio-isolatie, LCID in beide richtingen, TEXT, invoer,
Undo/Redo, bewaren/heropenen, legacytekst en de regionale batchvlag door de
bestaande pakket-JS. De oorspronkelijke kern faalt zes van deze zeven proeven.
Herhalen: `node scripts/proef-werkmapregio.mjs kern.wasm uitvoermap`.

De eerste kandidaat (`1df70b43…`) is afgekeurd: de brede controle vond dat
bestaande tekst `1/15` zonder regio bij ongewijzigd vastleggen een datum kon
worden. Die route gebruikt weer de oorspronkelijke parser. Zie de
[regressietegenproef](getalnotatie-wasm-legacy-tegenproef-2026-11-06.json).
De gecorrigeerde regiobasis slaagde in
[2.403 native kernproeven](getalnotatie-volledige-kernnacontrole-2026-11-06.json),
met zestien bestaande gevallen overgeslagen. De latere batchuitbreiding heeft
acht extra gerichte proeven; alle 46 betrokken werkmap-/invoer-/exportproeven
slagen. De [volledige laatste set](getalnotatie-regionale-batch-kernproeven-2026-11-06.json)
slaagt in **2.411 proeven**, 80 testsets, met zestien bestaande gevallen
overgeslagen en nul mislukkingen. Clippy
met `-D warnings` en de volledige bronformatcontrole slagen.

## App- en native controle

De eerste aansluitronde slaagt in 127 gerichte appproeven in acht bestanden.
De aanvullende HTML-nacontrole slaagt in 34 proeven: de bestaande
engine-integratie, regionale invoer en klembordlogica. Deze sets overlappen.
Een oude Nederlandse HTML-proef moest de bestandsinitialisatie expliciet
meenemen; de gewenste datumweergave is nu `01-02-2026`.

De volledige appnacontrole heeft 1.865 geslaagde proeven en tien bestaande
gevallen overgeslagen. Twee bestaande Writer-proeven raakten hun grens van
5 seconden tijdens gelijktijdige kerncontroles; er was geen mislukte
inhoudelijke assertie. De rustige nacontrole van beide
volledige testbestanden slaagt in alle 45 proeven, zonder gewijzigde deadlines
of verwachtingen. Daarmee zijn alle 1.867 unieke proeven gecontroleerd; zie
[appnacontrole](getalnotatie-appnacontrole-2026-11-06.json). Typecontrole, vertaalcontrole
en beide productiebouwen slagen.

De [native tussencontrole](getalnotatie-native-tussencontrole-2026-11-06.json)
gebruikt een echte Tauri-binary, eigen Xvfb/DBus/XDG-profielen en een afzonderlijke
inspectorpoort. De geladen editor- en kernbytes zijn uit de draaiende app
opgehaald en vergeleken met de productiebouw. Het gebruikersscherm en
gebruikersklembord zijn niet gebruikt.

- Elf categorieën zichtbaar, met Nederlandse cijfers en rode haakjes.
- Regiowissel nl-NL → en-US verandert de weergave; Undo herstelt de regio.
- `12,5` en `1-1-2026` via de formulebalk; `15%` via F2-celinvoer.
- Eigen code `0.000" m"` met kernvoorbeeld gewijzigd en toegepast.
- Ctrl+S, tab sluiten en dezelfde XLSX via de native bestandskiezer heropenen:
  bestandsregio en-US, eigen code, datum en procent blijven behouden.
- Onafhankelijke ZIP/XML-lezing vindt 12,5, 46023 en 0,15 terug; alle elf
  oorspronkelijke waarden en notatiecodes blijven behouden.

De [bewaarde synthetische XLSX](getalnotatie-native-tussencontrole-2026-11-06.xlsx)
is controleerbaar zonder de app. Deze native tussencontrole gaat vooraf aan de
HTML-getalcorrectie. De [laatste native nacontrole](getalnotatie-native-invoerroutes-2026-11-06.json)
controleert productie-editor `ff4aacb8…` en dezelfde kern opnieuw: uitgebreid
invoerveld, echt native HTML-klembord (tekst én HTML opgevraagd), regionale
getallen, canonieke HTML-getalvelden, datum, procent, formule, één Undo/Redo,
Ctrl+S en heropenen via Recente bestanden. De
[bewaarde XLSX](getalnotatie-native-invoerroutes-2026-11-06.xlsx) is onafhankelijk
met ZIP/XML gecontroleerd. In een te smalle datumkolom worden opvultekens
getekend; de volledige datum en juiste numerieke waarde blijven behouden.

![Native getalweergave](../screenshots/getalnotatie-raster-tussencontrole-2026-11-06.png)

## Resterende acceptatie

De zes platformchecks en de volledige issue-audit staan nog open. Ook de
interpretatie van ingebouwde datumcodes tegenover de bestandsregio moet
expliciet worden beoordeeld; een aanwezige eigen datumcode wordt behouden.
De zes issuecriteria blijven onafgevinkt tot de gezamenlijke acceptatie is
bewezen. PR #164 blijft concept en #64 blijft open.
