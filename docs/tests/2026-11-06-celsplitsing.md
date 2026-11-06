# Celbreedtes behouden bij splitsen

## Afbakening en reproductie

Deze herstelronde onderzoekt #130 en het bijbehorende tabelwerk van #48.
De oorspronkelijke melding beschrijft één bovenste cel boven twee rijen met
twee gelijke cellen. Alleen de bovenste cel wordt in tweeën gedeeld; de onderste
scheidingslijn zou van ongeveer de helft naar twee derde verschuiven. De
oorspronkelijke schermafbeeldingen en het bronbestand staan niet bij het issue.
Die precieze fout is met de huidige bronrevisie niet onafhankelijk gereproduceerd.
#130 blijft daarom open; ook het bredere #48 wordt hiermee niet gesloten.

Wel rechtstreeks gereproduceerd: een samengevoegde cel over twee rasterkolommen
in drie, vier of zes zichtbare cellen verdelen. De oorspronkelijke kern vergroot
de overspanning van beide onderste cellen, terwijl het nieuwe raster minder
stroken bevat dan die onderste rij nodig heeft. De bovenste rij bedekt daardoor
niet langer de hele tabel. Bij een tweedeling met ongelijke oude kolombreedtes
ontstaan bovendien geen gelijke nieuwe cellen.

De oorspronkelijke meegeleverde kern faalt in zeven van de eerste dertien
geometriegevallen. Zes, waaronder de gewone tweedeling uit #130, slagen al.
Dit is een tegenproef met de werkelijk getekende celvakken, geen vergelijking
van alleen het opgeslagen raster.

## Herstel

De bronpatch verfijnt het raster met zowel de bestaande grenzen als de nieuwe
deelpunten. Een cel kan meerdere rasterstroken beslaan; een rasterstrook is geen
extra zichtbare cel. Iedere niet-geselecteerde cel krijgt haar oorspronkelijke
begin- en eindgrens terug in dit verfijnde raster. Verdeel de voorkeursbreedte
van de geselecteerde oudercel over haar kinderen, in plaats van de volledige
voorkeur naar ieder kind te kopiëren. Bij uitsluitend verticaal delen blijft de
horizontale voorkeursbreedte gelijk.

Horizontaal samenvoegen telt de vergelijkbare voorkeursbreedtes van de bovenste
geselecteerde celrij op. De eerdere samenvoeging hield alleen de voorkeur van de
eerste cel vast. Twee cellen met elk 4000 twips voorkeur werden daardoor wel
zichtbaar 8000 twips breed, maar de overblijvende cel bleef als 4000 opgeslagen.
Na correct samenvoegen en opnieuw delen bewaren beide kinderen weer 4000 twips.
Bij verticaal samenvoegen worden breedtes niet opgeteld.

Handmatig nagerekend voorbeeld: twee oude kolommen van 2000 twips geven een
tabel van 4000 twips. Delen in derden geeft 1334, 1333 en 1333 twips. Met behoud
van de oude grens op 2000 worden de rasterstroken 1334, 666, 667 en 1333 twips.
De bovenste cellen beslaan respectievelijk één, twee en één strook; beide
onderste cellen blijven precies 2000 twips breed. Deze berekening staat ook
bij de Rust-proef in de bronpatch.

Na opnieuw samenvoegen mag hetzelfde vierstrooks raster weer twee zichtbare
cellen bevatten. Zowel de kern als de bestaande splitsdialoog laten dat toe.
Het verticale minimum en de bescherming tegen een lege 1×1-bewerking blijven
bestaan. De JS-aansluiting controleert de exacte bron van de vastgezette engine;
bij een gewijzigde engine stopt de bouw.

## Controles

- Gerichte Rust-proeven voor tabelbewerkingen: 46 geslaagd, inclusief
  proportionele absolute/procentuele voorkeursbreedtes, uitsluitend verticaal
  delen, horizontaal/verticaal samenvoegen en herhaald samenvoegen/delen.
- `splitsen-geometrie-engine.test.ts` meet getekende clipvakken via de echte
  layout en tekenlijst. De proef controleert hele tabelbreedte, gelijkmatige
  verdeling, behoud van onderste grenzen en alle celteksten, Undo/Redo en
  bewaren/heropenen. De tekenlijst rondt op 0,001 beeldpixel af; alleen het
  optellen van meerdere afgeronde vakken krijgt 0,005 pixel tolerantie.
- `splitsen-dialoog.test.ts` rendert de echte dialoog: twee zichtbare kolommen
  over vier rasterstroken zijn toegestaan; het verticale minimum en 1×1 blijven
  geblokkeerd. De oorspronkelijke metadata laat dezelfde geldige verdeling niet toe.

De geoptimaliseerde edit-kern heeft SHA-256
`b5624e380efd667199e7a9d00b0d8aa63aaed2402447290c5388653454d04069`
(24.568.979 bytes). De JS/WASM-interface blijft 30 imports en 298 exports.
De losse layoutkern blijft bytegelijk aan PR #155. Beide werkelijke
productie-assets zijn tegen het manifest gecontroleerd.

De volledige Office-set vóór de aanvullende opslagtegenproef slaagt: 149
bestanden, 1.681 geslaagde en zeven bestaande overgeslagen tests. Typecontrole
en productiebuild slagen. De achttien gerichte tabelproeven slagen ook met
werkelijke OOXML-percentages: 5000 = 100% en 3750 = 75%. Het volledige
tekstkernlog bevat 986 geslaagde tests en twee overgeslagen prestatieproeven.
De uitvoerder rapporteerde daarna afsluitcode 143; de afsluiting wordt daarom
nogmaals gecontroleerd met een afzonderlijk vastgelegd procesresultaat.

## Native bediening en nog openstaande opslagfout

Een native Linux-bouw met de productiefrontend is gestart op een eigen
X11-scherm, met een leeg profiel en eigen applicatie-id. De werkelijke
ingebedde edit-asset is opnieuw gehasht en komt overeen met bovenstaande kern.
Via **Table Design → Split Cell** is de bovenste cel in drie kolommen gedeeld.
De bovenste vakken zijn elk 208 pixels breed; de twee onderste rijen houden
hun vakken van 312 pixels. Ctrl+Z herstelt de volledige oorspronkelijke
tekengeometrie; Ctrl+Shift+Z herstelt de driedeling. Na Ctrl+S, tab sluiten en
Ctrl+O via de native bestandskiezer zijn tekst en getekende grenzen gelijk.
Er zijn nul consolefouten. Zie het
[controlebestand](celsplitsing-native-2026-11-06.json) en de beelden
[vóór splitsen](../screenshots/test-celsplitsing-native-voor-2026-11-06.png) en
[na heropenen](../screenshots/test-celsplitsing-native-heropend-2026-11-06.png).

**De opslaggetrouwheid is nog niet geslaagd.** De oorspronkelijke bron bevat
geen `tcW`-voorkeursbreedtes. Na native bewaren bevatten ook de niet-geselecteerde
onderste cellen nieuwe `pct`-waarden van 50; de nieuwe bovenste cellen krijgen
33. De bronvoorkeur wordt daarmee niet behouden. Een OOXML-waarde van 33
vijftigsten is bovendien geen derde van de tabel. De volledige opslagproef
blijft daarom rood, ondanks de gelijk gebleven zichtbare geometrie.

De aanvullende proef `voorkeursbreedte-opslag-engine.test.ts` controleert zes
geldige combinaties van native/documentprojectie en sessie-/editoropslag,
met en zonder splitsen. Twee ongewijzigde native routes slagen; vier gevallen
reproduceren de nieuwe voorkeuren. Ook de documentprojectie zonder splitsen
vertoont de afwijking. Deze regressieproef blijft bewust actief; de PR blijft
concept totdat de bron van deze afgeleide breedtes is hersteld en de
opslaggetrouwheid opnieuw slaagt. #48 en #130 blijven open.

## Afzonderlijke observatie bij het opzetten van de proef

Bij rechtstreeks invoegen via de lage sessie-API verschuift een nieuwe tabel
na bewaren en heropenen van x=96 naar x=88,8 beeldpixels, ook zonder enige
splitsbewerking. De breedte blijft 624 pixels. De standaardstijl wordt bij import
anders verwerkt; ook de rijhoogtes veranderen. De splitsproef begint daarom met
een eenmaal opgeslagen en heropende synthetische DOCX-tabel. Deze afzonderlijke
API-observatie is niet als gereproduceerde native gebruikersfout afgetekend en
wordt door deze rasterpatch niet hersteld.
