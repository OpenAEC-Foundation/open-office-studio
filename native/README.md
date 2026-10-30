# Native Open Office Studio

De migratie verplaatst ook de volledige interface naar Rust. Deze afzonderlijke
preview gebruikt Iced en de gepinde native OpenAEC Blueprint-bibliotheek. Het
uitvoerbare bestand start zonder React, JavaScript, Tauri of een webview.
De bestaande release 2026-W44.8 blijft de referentie voor functionele en visuele gelijkwaardigheid. De huidige bouwstap is **2026.44.9-alpha.4**; de volledige migratie is nog open.

[migratie.json](docs/migratie.json) legt de open acceptatiegebieden vast. Een stabiele native vrijgave is pas toegestaan als functies, controles en uiterlijk aantoonbaar gelijk zijn.

![Native Writer, gerenderd door Iced](docs/screenshots/writer.png)

De afbeeldingen in `docs/screenshots` komen uit de echte native renderer met
synthetische documenten. Ze tonen deze preview, niet de bestaande webinterface.

## Starten en bouwen

```sh
cargo run --manifest-path native/Cargo.toml
cargo test --manifest-path native/Cargo.toml --workspace --locked
cargo build --manifest-path native/Cargo.toml --workspace --locked --release
python3 native/scripts/verpak.py
```

De uitvoer staat in `native/target/release/open-office-studio-native` (Windows:
`.exe`). De workflow `native-rust.yml` controleert en bouwt Windows, Linux en
macOS. De zip is een draagbare preview met licenties en herbouwbare bron; dit is
nog geen ondertekende installer of vervanging van de bestaande suite.
In het uitgepakte pakket staat de bron onder `bron/`; voer de bouwopdrachten
vanuit die map uit. Het programma staat direct naast `LEESMIJ.md`.
Op Linux zijn een grafische sessie, de X11/Wayland-bibliotheken en libxkbcommon
nodig. Er wordt een software-renderer gebruikt. `--features gpu` is optioneel en
valt buiten de standaardtestmatrix.

## Huidige omvang

| Onderdeel | Native implementatie | Nog over te zetten |
|---|---|---|
| Venster | OpenAEC-ribbon, documenttabbladen, vijf thema’s, sneltoetsen, Bestand, openen/opslaan/opslaan als, sluitvragen | Herstelkopieën, recente bestanden, afgesplitste vensters, updater, vertalingen |
| Writer | Native paginering, klikbare alinea’s, linialen, zoom, tekstbereikopmaak en uitlijning, splitsen bij de editorcursor en samenvoegen van aangrenzende alinea’s, woorden inclusief tabellen, Markdown-export | Directe rich-text-cursor op de pagina, volledige pagina- en alineabediening, velden/links/revisies bewerken, volledige ribbon, tabellen invoegen, spelling en afdrukken |
| Spreadsheet | Klikbare cellen, formulebalk, verplaatsbaar werkvenster via celadres/bereik, bereikopmaak, rijen/kolommen invoegen/verwijderen, samenvoegen/splitsen, herberekenen en bladen wisselen | Doorlopend raster met volledige toetsenbord- en sleepbediening, zoeken, sorteren/filteren, klembordbereiken, CSV en grafieken |
| Presentation | Native diaweergave, niet-geroteerde tekstvakken aanklikken, tekstbereikopmaak, dia’s toevoegen/verwijderen, tekstvakken invoegen, sprekersnotities bewerken | Directe cursor en vormbediening, geroteerde/gegroepeerde objecten, volledige ribbon en presentatiemodus |
| Notition | Versies 1–3 openen, boeken/secties/pagina’s toevoegen, vrij canvas met tekstvakken slepen/vergroten, Markdown-preview, bloktekst en vet/cursief, prullenbak herstellen; onbekende bronvelden behouden | Automatische lokale opslag/herstel, zoeken, boeken/secties hernoemen/verplaatsen, volledige blok- en taakbediening en import/export |
| Email | Lokale EML lezen, originele bytes met bijlagen behouden; opslaan in IFCX | IMAP/SMTP/OAuth en accounts verbinden met het native venster |
| Database | Bestaande aparte app blijft beschikbaar | Native database-interface; laagste prioriteit |
| Formaten | DOCX, XLSX, PPTX, notitie-JSON, EML, IFCX-bewaarprofiel | Overige import/export en conversie aansluiten |

De native versie heeft dus nog **geen functiepariteit** met de bestaande suite.
Een uitgebreide documentweergave betekent niet dat elke zichtbare eigenschap al
bewerkbaar is. Writer weigert tekstvervanging bij inline objecten, velden, links en revisies;
de vorige bron blijft dan intact. Gewone tekst met meerdere opmaakruns houdt
de opmaak van ongewijzigde tekstdelen. Enter in de teksteditor blijft een zachte
regelovergang binnen de alinea. Gebruik **Splitsen bij cursor** voor een echte
nieuwe alinea; **Volgende samenvoegen** verwijdert de aangrenzende alineagrens.
Deze opdrachten blijven binnen dezelfde tekst of tabelcel en weigeren revisies,
inhoudsbesturingen en samenvoegen over een sectie-einde.

![Vrij native notitiecanvas](docs/screenshots/notition-canvas.png)

![Native Markdown-werkruimte](docs/screenshots/notition-markdown.png)

## Bewaring en snelheid

De engines werken op één aparte werkdraad. De interface ontvangt een begrensde
weergave en blijft los van parser, rasterizer en bestands-I/O. Writer hergebruikt
de lettertypecache per werkdraad zolang fontvereisten en registergeneratie gelijk
blijven. Bestanden worden
uit het volledige enginemodel opgeslagen, nooit uit de tekstvelden of afbeelding
van het venster. Ongedaan maken bewaart maximaal 32 bronnen en 64 MB per document.
Dit is een eerste betrouwbaarheidskeuze; grote documenten vragen nog gerichte
profilering en een overgang naar de eigen transactiegeschiedenis van de engines.

Bestandsopslag controleert de gelezen SHA-256, schrijft via een tijdelijk bestand
naast het doel en vraagt bij gewijzigde externe inhoud om Opslaan als. Dit is
geen bestandssysteemtransactie tussen onafhankelijke externe programma’s: een
extern proces dat precies tussen controle en vervangen schrijft, kan nog een
race veroorzaken. Sluiten vraagt ook naar nog niet toegepaste editorinvoer.

Het IFCX-bewaarprofiel `0.1.0-draft.1` is het eerdere eigen voorstel, geen
vastgestelde interoperabele Office-standaard. Alle bronbytes gaan mee in base64
met lengte en SHA-256. Bij e-mail zijn dat de volledige oorspronkelijke
EML/MIME-bytes. Deze preview opent één document per IFCX-dossier, verwerkt geen
imports/overerving en begrenst de bron tot 12 MB. Onbekende attributen blijven
bij herschrijven behouden. IFCX is archivering van de bron; de semantische
bewerking van tekst, cellen en dia’s blijft bij de documentengines.

## Controles

Het [controlerapport voor alpha 4](docs/controle-2026-10-30-alpha4.md) beschrijft
de 58 lokaal geslaagde Rust-tests, vier beeldcontrole-tests en de grenzen van
die controle. De eerdere rapporten blijven historische verslagen.

```sh
python3 native/scripts/controleer-bron.py
cargo fmt --manifest-path native/Cargo.toml -p office-core -p open-office-studio-native --check
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets -- -D warnings
OFFICE_TEST_UITVOER=/tmp/native-rondgang OFFICE_TEST_SCHERMEN=/tmp/native-schermen \
  cargo test --manifest-path native/Cargo.toml --workspace --locked
python3 native/crates/office-core/tests/fixtures/controleer.py /tmp/native-rondgang
```

Voor de onafhankelijke terugleescontrole zijn python-docx, openpyxl en python-pptx
nodig. De synthetische fixtures kunnen met `tests/fixtures/maak.py` opnieuw worden
gemaakt. Screenshots worden door de echte Iced software-renderer gemaakt; ze
bewijzen de layout, geen volledige fysieke GUI- of schermlezertest.

Nog niet vrijgegeven: volledige native GUI-bediening, schone installatie,
platformintegratie, toegankelijkheid met een echte schermlezer, realistische
mailaccounts, grote-documentprestaties en het volledige bestaande bestandencorpus.
De UI-bibliotheek bewaart toegankelijkheidsnamen maar heeft nog geen werkende
schermlezerbrug. Writer en Presentation gebruiken dezelfde bundel van 70 open
lettertypen als de bestaande suite, met stijl- en taalgebonden resolutie.
Onbekende families kunnen nog steeds een terugval krijgen. Systeemletters en
volledige visuele gelijkwaardigheid zijn nog niet aangetoond.

### Bestandscontrole zonder venster

De volledige werkruimte bouwt ook `controleer-bestand` (`.exe` op Windows).
Dit programma leest één bron, maakt de eerste werkweergave, bewaart in geheugen
en vergelijkt de zichtbare tekstvelden na opnieuw openen. Het wijzigt het
bronbestand niet. De JSON-uitvoer vermeldt versie, bouwprofiel, bronhash en fase
bij een fout. Dit is geen volledige inhouds-, formule-, stijl- of pixelcontrole.

```sh
native/target/release/controleer-bestand --version
native/target/release/controleer-bestand document.docx
python3 native/scripts/corpus.py \
  --programma native/target/release/controleer-bestand \
  --manifest .local/corpus/manifest.json \
  --uitvoer .local/native-corpus.json
```

Een corpusmanifest bevat `bestanden`, met per bron `bestand`, `extensie` en
`sha256`. Relatieve paden tellen vanaf `--bronmap` (standaard de huidige map).
De runner bewaart voortgang atomair en weigert hervatten met een ander programma
of manifest. `--hervat` vervolgt dezelfde ronde. Per bron geldt standaard
30 seconden; maximaal twee processen draaien tegelijk. Op Linux begrenst
`prlimit`, indien aanwezig, ook de adresruimte tot 3 GiB per kindproces. De
uitvoer vermeldt expliciet of die grens geldt. Een weigering, tijdslimiet of
afwijking geeft geen volledig geslaagde ronde. De debugtijden zijn geen bewijs
voor prestaties van de releasebuild.

De [historische alpha-3-corpusronde](docs/corpus-2026-10-30-alpha3.json) bevat
648 openbare DOCX/XLSX/PPTX-bronnen: 554 geslaagde rondgangen, 80 weigeringen en
14 tijdslimieten. Die weigeringen moeten per bron worden beoordeeld; sommige
bronnen zijn beschadigd, versleuteld of nog niet ondersteund. Deze uitkomst
bewijst geen volledige controle van alpha 4 of van de andere bestandsformaten.

## Bron en licenties

`vendor/blueprint-bron.json` legt alle 202 gedeelde UI-bestanden vast op
OpenAEC Blueprint `29471a376eaec40bfbadcf3f1d52b463c91ab561`. De verificatie weigert
wijzigingen. De applicatiecode staat onder Apache-2.0. De gedeelde UI heeft eigen
LGPL-3.0-only-, CC-BY-SA-4.0-, OFL-1.1- en Apache-2.0-onderdelen: lees
`vendor/openaec-ui/LICENSE.md`, `NOTICE.md` en `licenses/`. De bron, fontnotices en gevonden licentieteksten van de Rust-afhankelijkheden
gaan mee in het previewpakket. De native documentengines zijn Apache-2.0 en
vastgelegd op versie 0.5.1 in Cargo.lock. De layoutadapter volgt het openbare
native-viewer-voorbeeld van openooxml/betteroffice; de bronverwijzing staat in
`crates/office-core/src/writer_beeld.rs`.

## Visuele vergelijking en vrijgave

`native/scripts/vergelijk-schermen.py` vergelijkt echte PNG-bronbeelden op
hetzelfde viewportformaat, zonder schalen of uitlijnen. Het werkelijke bronformaat
moet PNG zijn; een JPEG met een andere extensie wordt geweigerd. Omzetten van een
JPEG naar PNG maakt die opname nog geen verliesvrije referentie. Ook verschillen
in transparantie tellen mee. Standaard is geen enkel afwijkend pixel toegestaan.
Hiervoor is Pillow nodig. Een geslaagde native
rendertest is dus geen bewijs dat het beeld gelijk is aan de bestaande suite.

```sh
python3 native/scripts/controleer-migratie.py
python3 native/scripts/controleer-migratie.py --vrijgave
python3 native/scripts/vergelijk-schermen.py referentie.png native.png --uitvoer pixelcontrole
```

De vrijgavecontrole is momenteel terecht **niet geslaagd**: de native suite mist
nog functies en de UI is nog niet pixelgelijk. Alpha-pakketten blijven als
preview beschikbaar; een stabiel pakket wordt door `verpak.py` geweigerd zolang
de acceptatiegebieden openstaan.

De huidige browserkoppeling levert JPEG-opnamen. Die zijn bruikbaar om het
uiterlijk te beoordelen, maar vormen geen geldige referentie voor een numerieke
pixelcontrole. Een eerdere telling op zo’n opname is daarom geen pixelbewijs.
Een oorspronkelijke verliesvrije referentie van de bestaande volledige interface
is nog nodig voordat die controle geldig kan slagen.
