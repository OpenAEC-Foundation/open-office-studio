# STC-template QA onder #30 — 23 november 2026

Deze ene QA-route verandert geen productcode, versie, catalogusclaim of bestaande
oplevering. Applicatiebasis is P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`,
tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.
De QA-harness heeft een eigen branch en afzonderlijk vastgelegde commits.

## Originele bron en formaatidentiteit

`fixture.json` bindt **Carnet de notes** van Francis Lecher (2003) aan de
officiële Apache/OpenOffice-repository, een onveranderlijk broncommit, Git-blob,
bestandsgrootte en SHA-256. Het oorspronkelijke bestand is gepubliceerd als
`.stc`, bevat de OpenOffice.org 1.0 XML-namespaces en DOCTYPE, is geproduceerd
door OpenOffice.org 1.1.0 en bevat een `meta:template`-verwijzing naar het
oorspronkelijke STC-sjabloon. De PDL-licentievermelding blijft in de originele
bron aanwezig. De binary wordt niet naar deze repository gekopieerd; de proef
haalt de exact gebonden originele bytes op.

De historische bron gebruikt intern `application/vnd.sun.xml.calc`, zowel in
`mimetype` als in het oude manifest. Dat is een expliciete eigenschap van deze
originele distributie, geen bewijs voor `application/vnd.sun.xml.calc.template`.
De proef herschrijft dat niet. Er is geen moderne OTS/XLSX hernoemd of omgepakt.
Deze ene historische fixture bewijst geen algemene STC-dekking.

## Onafhankelijke inhoudelijke oracle

`oracle.py` gebruikt uitsluitend Python-stdlib voor ZIP/XML en rationale/
decimale berekeningen. De verwachte uitkomsten worden niet van een conversie of
de applicatie-engine overgenomen.

- Zes werkbladen, met de oorspronkelijke namen/volgorde, en **854 formulecellen**.
- De bronformule in `notes 1 trimestre!H5` is `SUMPRODUCT` gedeeld door `SUMIF`.
  De gewichten in C4:G4 worden `1,2,1,1,1`; de cijfers in C5:G5 worden
  `10,12,14,16,18`. De uitkomst is `82/6 = 41/3`.
- De bestaande MROUND-/kwartafrondingsformule in I5 moet **13,75** geven.
- Een wijziging van `liste des élèves!A5` moet via de bestaande naamformule
  terugkomen in `notes 1 trimestre!A5`.
- De bron bevat al foutcaches door ontbrekende invoer. Die oude caches zijn
  geen rekenoracle en worden niet zonder onderscheid als conversiefout gemeld.

## Reeds uitgevoerd

- Broncontrole en oracle: [Linux-CI 45145699370](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45145699370),
  harness `b0ceb98ecce4f9ba9a242af7cac2fc0e89a1fa89`: geslaagd.
- Broncontrole plus negatieve browser-capability/open-helpercontrole:
  [Linux-CI 45146978595](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45146978595),
  harness `817e42e4b4580f010920e977fab3e1e5700f64af`: geslaagd.
- De eerdere [run 45146649239](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45146649239)
  stopte vóór applicatiecode door een ontbrekend P2-object in de ondiepe
  CI-checkout. De harness haalt nu uitsluitend de vaste P2-snapshot op voor de
  ongewijzigde identiteitscontrole. Dit is geen gereproduceerde productfout.

De browsercontrole voert de echte `conversieStatus`, `converteer` en
`bereidOpenen` uit in Linux Node met een leeg `window`-object. Er wordt geen
Tauri-brug aangebracht. De uitkomst is een concrete STC-melding met het advies
vanuit de bronapp als XLSX te exporteren. Dit is **geen** volledige gehoste
browserbedieningstest en bewijst niet dat STC in de browser geopend kan worden.

## Voorbereid, nog niet uitgevoerd

De integratiechat moet eerst de gedeelde private Linux-runtime vrijgeven en
exact aan het P2-pakket/artifact binden. Er is geen grote release-ZIP of nieuwe
suitebuild door deze QA-chat aangevraagd of gedownload.

`convert.py` accepteert alleen een expliciete private executable en binding,
controleert de identiteit en gebruikt dezelfde CLI-argumenten, 45-secondenlimiet
en exact hetzelfde veilige conversieprofiel als P2. Het tijdelijke profiel
raakt geen gebruikersprofiel. Dit is een CLI-adapter, geen Tauri-IPC-bewijs.

Daarna voert `engine.mjs` de echte productie-openhelper en de vastgepinde
XLSX-WASM uit: als nieuw document openen, modern XLSX-voorstel, passende
invoerwijziging, berekende waarden, Undo/Redo van de naamwijziging, engine-save
en reopen. `oracle.py` controleert de uiteindelijke XLSX onafhankelijk op
werkbladen, formulecellen en berekende inhoud. De originele STC moet bytegelijk
blijven.

Niet geclaimd: lokale/native GUI-bediening, Tauri-IPC, schermopname, Windows- of
macOS-runtimeacceptatie, andere spreadsheetformaten, volledige STC-variantdekking
of vrijgave van de P2-release.
