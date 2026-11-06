# IFCX-opslag en native Writer-invoer

Datum: 5 november 2026. Basis: `main` op `3f06bbc6`. Dit betreft de bestaande
Tauri/websuite, met de vastgezette tekstengine 0.5.1. Het parallelle native
interfacetraject is niet aangepast. De bronlaag en grenzen van het formaat
staan in [IFCX-opslag](../ifcx-office-opslag.md).

## Bewaarproeven voor de drie editors (#152)

De productie-interface is met een afzonderlijke Chromium-instantie getest.
Voor DOCX, XLSX en PPTX is het gewone sjabloon geopend, via **Opslaan als →
IFCX Office** gedownload en daarna opnieuw geopend. Onafhankelijke
base64-, byte-aantal- en SHA-256-controle bevestigt dat de onbewerkte bron
volledig gelijk blijft. De heropende bestanden kiezen hun juiste editor;
Opslaan als selecteert opnieuw IFCX en toont geen onjuiste kopiewaarschuwing.

Daarna zijn echte bewerkingen uitgevoerd, opgeslagen en heropend:

- Writer: tekst invoeren; de opgeslagen DOCX-XML en het heropende scherm
  bevatten de nieuwe tekst. [Beeld](../screenshots/test-ifcx-tekst-2026-11-05.png).
- Spreadsheet: A1 = 7 en A2 = `=A1*2`; de XLSX bevat de formule en uitkomst 14.
  [Beeld](../screenshots/test-ifcx-rekenblad-2026-11-05.png).
- Presentation: een presentatornotitie invoeren; de notitie-XML en het
  heropende notitieveld bevatten dezelfde tekst.
  [Beeld](../screenshots/test-ifcx-presentatie-2026-11-05.png).

Een corrupte bronhash wordt in de interface geweigerd zonder het al geopende
document te vervangen. De gerichte engineproeven controleren daarnaast
formuleherberekening na een volgende celwijziging, bewaarcontext,
macrobytes, onbekende uitbreidingen en verwijzingen naar oudere bronnen,
versleuteling, vensteroverdracht en foutpaden. Wachtende invoer wordt verwerkt
voordat een ongewijzigde bron mag worden hergebruikt.

Het dossier bewaart oudere bronnen. Achteraf alleen de nieuwste bron
versleutelen zou oudere inhoud leesbaar laten; die bewerking wordt daarom
vóór een schrijfactie geweigerd. Een nieuw beveiligd dossier en beveiligd
doorwerken met reeds versleutelde bronnen zijn afzonderlijk getest.

## Werkelijke Linux-webview en opslag

De bestaande Rust-desktopschil is als proefprogramma gebouwd met een eigen
app-identificatie en de productiefrontend van de Office-suite. De uitvoering
gebruikt WebKitGTK 2.52.6, een eigen Xvfb-scherm, een eigen sessiebus en eigen
configuratie-, gegevens- en herstelmappen. Het gewone bureaublad en klembord
worden niet gebruikt. Alleen synthetische kopieën staan in de proefmap.

- Een geopend IFCX blijft na Ctrl+S in zijn geheel bytegelijk.
- Daarna ingevoerde tekst blijft na Ctrl+S in de gecontroleerde bron aanwezig;
  de nieuwe bronrevisie komt naast de oude bron te staan. Tab, titel en
  statusbalk eindigen schoon.
  [Native opslag](../screenshots/test-ifcx-native-opgeslagen-2026-11-05.png).
- Vanuit een DOCX: tekst invoeren, IFCX kiezen en de native bestandskiezer
  bevestigen. Het gekozen IFCX wordt het nieuwe werkbestand en de tabnaam
  verandert mee. Nieuwe invoer na die naamwisseling blijft behouden. Ctrl+S
  schrijft naar het nieuwe pad; de oorspronkelijke DOCX blijft ongewijzigd.
- Na sluiten van de tab en heropenen via de native bestandskiezer bevat het
  document nog steeds `Voor opslaan als en verder`.
  [Heropend](../screenshots/test-ifcx-native-heropend-2026-11-05.png).

[Meetuitkomsten](ifcx-resultaten-2026-11-05.json) bevatten de bronhashes en
uitgevoerde rondgangen. Dit zijn geen uitgevoerde Windows- of macOS-GUI-proeven.

## Verdwenen eerste aanslag na opslaan (#135)

De native proef reproduceerde de oorspronkelijke initialisatiemelding in
een gewone alinea: na de eerste opslag verdween de volgende eerste aanslag.
`Basis` gevolgd door opslaan en ` vervolg` leverde `Basisvervolg` op. De
worker antwoordde op de eerste `applyInput` met **Document worker is not
initialized**, waarna de editor terugviel op de hoofdthread. Ook langzaam
typen reproduceerde de fout. Hetzelfde gebeurde met IFCX.

De webinspectie liet zien dat WebKit bij de eerste opslag de worker-ingang
opnieuw als module uitvoerde. De luie opslagmodule importeert die ingang;
de tweede uitvoering registreert een invoerafhandeling met een lege sessie.
Een klein startscript importeert de engine nu als gewone module, zodat
invoer en opslag dezelfde modulecache gebruiken. De bundelaar herkent nog
steeds de bestaande worker-URL. De native worker en overdraagbare buffers
blijven in gebruik; het object-URL wordt opgeruimd bij laden, fouten of stoppen.

De gerichte proef behoudt `Voor vervolg` na twee opslagcycli en alle
workerantwoorden op invoer en opslag slagen.
[Berichten vóór en na de gerichte aansluiting](worker-opslag-2026-11-05.json).
Een nieuwe bronbouw bevestigt vervolgens correcte native IFCX-invoer en
vervolginvoer na native Opslaan als. De vijf gerichte automatische tests
bewaken de vastgezette bron en het opstarten en opruimen van de worker.

De eerder gecontroleerde tabelinvoer na opmaak en Undo blijft beschreven in
[de voorgaande ronde](2026-11-05-tauri-issues.md). De hier gevonden oorzaak
is een aanvullende, rechtstreeks gereproduceerde initialisatiefout.

## Wachtende invoer en de wijzigingsmarkering (#153)

De strengere native herhaalproef vond een afzonderlijke fout: na direct typen
van `Basis` en Ctrl+S bevat de DOCX alle vijf tekens, maar de native titel
blijft na vijf seconden gewijzigd. De opslagbewaking legde haar revisie vast
vóór het verwerken van nog wachtende invoer. Die al opgeslagen invoer telde
daardoor als een latere wijziging.
[Voor herstel](../screenshots/test-native-opslag-vlag-voor-2026-11-05.png).

De native revisietrace legt de oorzaak preciezer vast: de inputroute plant
haar wijzigingsmelding 100 ms later. `flushPendingInput` wacht wel op de
invoer, maar niet op deze uitgestelde melding. Zelfs de nieuwe
`onDocumentChange`-melding kwam daardoor pas tijdens het serialiseren binnen.
De opslagrevisie ging in [de trace](native-opslagrevisie-voor-2026-11-05.json)
tijdens die fase van `1:0` naar `1:1`.

De gerichte engineaansluiting meldt de bevestigde documentversie nu direct.
De duurdere Document-projectie houdt haar bestaande vertraging; dezelfde
versie wordt bij die latere projectie niet nogmaals gemeld. De teksteditor
gebruikt `onDocumentChange` voor de opslagstatus. De compatibiliteitsprojectie
blijft actief voor de bestaande synchrone lint-API, maar verandert de
opslagstatus niet meer. Vijf proeven voeren de echte versie-, deduplicatie-
en timerexpressies uit de vastgezette engine uit. De tegenproef met de oude
timer blijft gewijzigd; dezelfde bewaarrondgang met directe melding wordt
schoon. Een echt nieuwe versie tijdens schrijven blijft gewijzigd.

De teksteditor heeft daarnaast een afzonderlijke voorbereidingsstap. De opslag
verwerkt eerst die wachtende invoer en legt daarna de te bewaken revisie vast.
Wijzigingen tijdens het daaropvolgende serialiseren of schrijven blijven
onopgeslagen. Een documentwissel tijdens de voorbereiding opent geen
opslagdialoog; een voorbereidingsfout bewaart niets en laat opnieuw proberen
toe. Vijf aanvullende regressiegevallen controleren deze grenzen. De
IFCX-serialiseerder geeft dezelfde voorbereidingsstap door.

De nieuwe ingebedde Tauri-bouw slaagt ook in de native herhaling: na direct
invoeren van `Basis` en Ctrl+S verdwijnt de markering. Dezelfde controle slaagt
na elk van de vier plakroutes. Het proefscript controleert eerst de werkelijk
opgeslagen XML en daarna een minstens twee seconden onafgebroken schone
native venstertitel, binnen een wachttijd van zeven seconden. Alleen de eerste
schone titel bleek te vroeg: de OS-titel kon nog de vorige toestand tonen.
Het eindbeeld bevestigt ook de schone tab en status **Ready**; een tweede
Ctrl+S is niet nodig om een al bewaarde tekst schoon te krijgen.
[Nieuwe plak- en opslagtoestand](../screenshots/test-native-plakken-2026-11-05.png).

De [revisietrace na herstel](native-opslagrevisie-na-2026-11-05.json) controleert
in dezelfde echte webview `Basis vervolg` tegen de opgeslagen XML, de
synchrone opslagstatus, de DOM-titel en de statusbalk. Die rondgang eindigt
schoon. De afzonderlijke tegenproef met invoer tijdens een nog lopende opslag
blijft terecht gewijzigd; het herstel onderdrukt geen echte latere wijzigingen.

## Extern en intern plakken (#126)

In dezelfde echte Linux-webview is `Basis` getypt. Een afzonderlijk
klembordprogramma biedt eerst `.Lint` en daarna `.Sneltoets` aan. Plakken via
het lint en vervolgens Ctrl+V levert `Basis.Lint.Sneltoets` op. Daarna is
intern alles gekopieerd en via Ctrl+V verdubbeld; nogmaals kopiëren en via
het lint plakken verviervoudigt de volledige tekst. Na iedere stap is echt
opgeslagen en de DOCX-XML onafhankelijk gecontroleerd. Bestaande inhoud en
de invoegpositie blijven behouden.
[Native plakproef](../screenshots/test-native-plakken-2026-11-05.png).

De klembordroute zelf was al opgenomen in PR #148. Deze ronde vult de
ontbrekende native bediening op de oorspronkelijk gemelde Linux-omgeving aan.
Dit sluit geen brede vrijgave van alle rijke klembordformaten of alle
besturingssystemen in (#20).

## Pakket en controles

De Linux-proefbouw levert ook een werkelijk gebouwd Writer-DEB op. De
uitgepakte desktopkoppeling bevat `application/x-openaec-office-ifcx` en het
eigen MIME-bestand bevat `*.ifcx`. Het pakket bevat geen MIME-bestand op de
naam van de suite, zodat de gerichte editor die koppeling niet overschrijft.
[Gecontroleerde pakketinhoud](ifcx-deb-inhoud-2026-11-05.json). Het proefpakket
is niet geïnstalleerd of als release gepubliceerd.

- Productiebuild en TypeScript: geslaagd.
- Volledige Vitest-set: 146 bestanden; 1.654 geslaagd, zeven bestaande
  corpusgevallen overgeslagen.
- Python: 44 geslaagd.
- Vertaalcontrole: negen talen × 21 namespaces, 6.829 bronsleutels; nul fouten
  en 23 bestaande waarschuwingen voor voorbereide taalmappen.
- Rust-desktopschil: 110 geslaagd, zes standaard genegeerde proeven. De
  gerichte IFCX-opslagproef bevestigt echte atomaire opslag en conflictherkenning.
- Gebouwde Linux-webview: de hierboven afzonderlijk beschreven uitvoering.

## Herhalen

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run --maxWorkers=1
python3 -m unittest discover -s tests
pnpm i18n:check
pnpm build
```

Voor de native herhaling zijn Xvfb, xdotool, xclip, xwd, dbus-run-session en
Pillow nodig. Maak een Tauri-proefbouw met een **eigen app-identificatie** en
de productiefrontend. Gebruik geen al draaiend gebruikersprogramma als test.
Maak via Opslaan als een IFCX met het lege DOCX-sjabloon. De proef kopieert
beide bronnen en start zelf zijn geïsoleerde scherm en gegevensmappen:

```sh
python3 scripts/test-native-tekst-opslag.py \
  --binary /pad/naar/tauri-proefbouw \
  --docx public/templates/nieuw.docx \
  --ifcx /pad/naar/leeg-synthetisch.ifcx
```

De uitvoermap wordt afgedrukt; daarin staan de gecontroleerde bestanden,
beelden, logs en `resultaat.json`. De proef beëindigt uitsluitend zijn eigen
procesgroepen. De extra native Opslaan-als/heropenproef hierboven is
afzonderlijk via de zichtbare dialoog uitgevoerd.
