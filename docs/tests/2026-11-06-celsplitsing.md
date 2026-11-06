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
`9e5af39bbfd74008c6660b93076c5c9e2747312211e39f266ea75c3a87a01be4`
(24.549.505 bytes). De JS/WASM-interface blijft 30 imports en 298 exports.
De losse layoutkern blijft bytegelijk aan PR #155.

De volledige aangepaste tekstkern slaagt met 987 tests en twee overgeslagen
prestatieproeven; het afzonderlijk vastgelegde procesresultaat heeft afsluitcode
0. De vijf aanvullende integratiedoelen slagen met samen 53 tests. De importset
slaagt afzonderlijk met 63 tests. De volledige Office-set slaagt met 150
bestanden, 1.708 geslaagde en zeven bestaande overgeslagen tests.

## Bronvoorkeuren behouden bij import en opslag

De eerste native tegenproef met kern `b5624e38` bewaarde de zichtbare grenzen,
maar voegde `tcW`-voorkeuren toe die niet in het bronbestand stonden: 33 `pct`
in de bovenste rij en 50 `pct` in de onderste rijen. Het eerdere
[controlebestand](celsplitsing-native-2026-11-06.json) en de beelden
[vóór splitsen](../screenshots/test-celsplitsing-native-voor-2026-11-06.png) en
[na heropenen](../screenshots/test-celsplitsing-native-heropend-2026-11-06.png)
leggen die tegenproef vast; ze zijn geen aftekening van de huidige kern.

Zowel de native import als de JS-documentprojectie vulde een ontbrekende
voorkeursbreedte aan met het afgeronde rasteraandeel op schaal 0–100. Opslag
behandelde dat vervolgens als een werkelijk opgegeven OOXML-voorkeur op schaal
0–5000. De correctie voorkomt deze aanvulling bij beide importen. De
rasterbreedtes blijven voor de indeling beschikbaar. De brug respecteert elke
werkelijk opgegeven voorkeur, ook wanneer haar kleine getal toevallig op een
vroeger afgeleid rasterpercentage lijkt.

De opslagproef controleert nu 24 gevallen: zes combinaties met/zonder delen
via native/documentimport en sessie-/editoropslag, plus achttien gevallen met
een expliciete voorkeur uit de bron of een nieuwe bewerking. Die voorkeuren
zijn 50 `pct`, 2500 `pct` en 4000 `dxa`. Alle gevallen slagen. De Node-proef
laadt een eigen kopie van de volledige SDK-modulegraaf met dezelfde
broncorrectie als de productiebuild; het gedeelde pakket blijft onaangeroerd.

## Native controle en eerste-opslagmelding

De native proef met de nieuwe kern `9e5af39b` is in een eigen X11-scherm,
profiel en applicatie-id uitgevoerd. De ingebedde asset heeft de verwachte
SHA-256. Delen in twee en drie kolommen, Undo/Redo en opnieuw samenvoegen en
delen naar twee zichtbare cellen slagen. De bovenste driedeling is 3 × 208
pixels; de onderste rijen blijven elk 2 × 312 pixels. Na de werkelijke eerste
Ctrl+S bevat de DOCX nul `tcW`-elementen, overeenkomstig de bron.

Die proef ontdekte een afzonderlijke statusafwijking: het bestand is geschreven,
maar de wijzigingsstip blijft na de eerste opslag staan. Een nieuwe kopie van
de bron met alleen een driedeling reproduceert dit ook. Instrumentatie toont
dat `adoptWorkerSaveUpdates` de door de opslagworker gepubliceerde
alinea-identiteiten overneemt; de engineversie stijgt daarbij zonder nieuwe
gebruikersinvoer. De directe versiemelding telt dit ten onrechte als een
bewerking tijdens opslaan. Een tweede opslag blijft schoon, maar geldt niet
als oplossing of als geslaagde eerste-opslagproef.

De JS-aansluiting markeert uitsluitend deze synchrone adoptie op de betrokken
sessie. De deduplicatie bevestigt haar versie zonder een inhoudswijziging te
melden. De markering wordt in `finally` hersteld. Echte invoer vóór of na die
adoptie tijdens de asynchrone opslag blijft als onopgeslagen gelden. De drie
nieuwe regressiegevallen voeren de werkelijke bundeluitdrukkingen uit: zonder
correctie faalt het geval zonder nieuwe invoer; met correctie slagen alle drie.
De native eerste-opslag-/heropenproef met deze aanvullende JS-correctie slaagt:
na de eerste Ctrl+S blijft de titel 2,064 seconden schoon binnen 3,444 seconden
na de toets, ruim binnen de vaste grens van zeven seconden. Na sluiten en
heropenen zijn alle celteksten en getekende grenzen exact gelijk aan vóór het
sluiten. Het opgeslagen raster is `[3120,1560,1560,3120]`, met overspanningen
`[1,2,1]` boven en `[2,2]` in beide onderste rijen. Geen enkele cel heeft een
nieuwe `tcW`. De opnieuw-samengevoegde cel mag in de echte dialoog van vier
rasterstroken naar twee zichtbare kolommen worden gedeeld.

Zie het [nieuwe native bewijs](celsplitsing-native-behoud-2026-11-06.json),
de [eerste-opslagtegenproef](eerste-opslag-tegenproef-2026-11-06.json) en de
nieuwe beelden [vóór delen](../screenshots/test-celsplitsing-native-behoud-voor-2026-11-06.png)
en [na heropenen](../screenshots/test-celsplitsing-native-behoud-heropend-2026-11-06.png).
De bestaande melding over aangepaste XML-gegevens is zichtbaar in beide beelden;
voor deze proef is geen volledige consolefoutregistratie gemaakt. Typecontrole,
productiebuild en native bouw slagen; de 27 backendbronbestanden zijn bytegelijk
aan de repository. De applicatie en het eigen X11-scherm zijn na de proef
opgeruimd. #48 en #130 blijven open wegens hun ruimere criteria.

## Afzonderlijke observatie bij het opzetten van de proef

Bij rechtstreeks invoegen via de lage sessie-API verschuift een nieuwe tabel
na bewaren en heropenen van x=96 naar x=88,8 beeldpixels, ook zonder enige
splitsbewerking. De breedte blijft 624 pixels. De standaardstijl wordt bij import
anders verwerkt; ook de rijhoogtes veranderen. De splitsproef begint daarom met
een eenmaal opgeslagen en heropende synthetische DOCX-tabel. Deze afzonderlijke
API-observatie is niet als gereproduceerde native gebruikersfout afgetekend en
wordt door deze rasterpatch niet hersteld.
