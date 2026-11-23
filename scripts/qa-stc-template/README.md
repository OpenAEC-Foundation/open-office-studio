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

## Echte conversie, enginebewerking en modern opslaan: geslaagd

[Linux-CI 45149986178](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45149986178)
slaagt voor bron, browserlimiet en de echte runtime/engine-route op QA-harness
`ec6d511480165a88d45ab43c3be20b8d864f2012`, met exact de ongewijzigde P2-applicatie.
De [machineleesbare oplevering](../../../docs/tests/stc-template-2026-11-23/result.json)
legt alle bindingen en beperkingen vast.

De gebruikte private LibreOffice-runtime is **26.8.2.2**, uit het vastgepinde
runtime-only artifact `14805600515`, producer-run `45147346793`. De volledige
eigen ZIP is gecontroleerd tegen `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`;
de tar tegen `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`.
De ongewijzigde gedeelde verifier controleerde alle **15.082** manifestentries,
modi, links, launcher en ELF. De producer bindt dit aan Desktop-run
`45143305147`, Linux-job `137586343061` en P2-DEB
`23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`.
De DEB-verificatie wordt als producerbewijs overgenomen; deze proef downloadde
of installeerde de DEB niet en deed geen standalone-appacceptatie.

`convert.py` accepteert alleen een expliciete private executable en binding,
controleert de identiteit en gebruikt dezelfde CLI-argumenten, 45-secondenlimiet
en exact hetzelfde veilige conversieprofiel als P2. Het tijdelijke profiel
raakt geen gebruikersprofiel. Dit is een CLI-adapter, geen Tauri-IPC-bewijs.

`engine.mjs` voerde de echte productie-openhelper en de vastgepinde
XLSX-WASM uit: als nieuw document openen, modern XLSX-voorstel, passende
invoerwijziging, berekende waarden, Undo/Redo van de naamwijziging, engine-save
en reopen. `oracle.py` controleerde de uiteindelijke XLSX onafhankelijk op
werkbladen, formulecellen en berekende inhoud. Zes bladen en alle 854 bronposities
met een formulecel blijven behouden. De gecontroleerde rekenuitkomsten zijn
`13.666666666666666`, `13.75` en de naamtekst `QA_STC_23NOV`. De originele STC
blijft bytegelijk. De rekenoracle betreft deze geselecteerde waarden; behoud van
de 854 formulecelposities is geen bewijs dat iedere formule geëvalueerd of iedere
formule-expressie inhoudelijk vergeleken is.

Resultaatartifact `14804804420` (`stc-runtime-result`, 600.746 bytes) is apart
gedownload en volledig geverifieerd tegen
`651d7fdeda05b0a693769084bba2a4f3c25eb4cd016ad6cd3b748ff3a98e33df`.
De bron-, descriptor-, pakketbindings- en uitvoerhashes zijn vervolgens opnieuw
uit de gedownloade resultaten gecontroleerd. De opgeslagen XLSX heeft SHA-256
`aedb0d2e1e26413d3e5ba08a5f013a167ecd8d4678d710253ce59ae4f0b9d5c7`.

De eerdere runtime-run `45149421124` stopte vóór Office-executie door een eigen
consumer-aanname: de verrijkte coordinator-Gitattestatie werd onterecht als de
oorspronkelijke artifactdescriptor behandeld. Nu worden beide afzonderlijk
gecontroleerd: Gitattestatie `1c0e508276b37fbd5b92e55bf113446d7e8522fc1d9e1817bb7722d5b5dd53c6`
verwijst expliciet naar basisdescriptor
`9497f67c9c9e4f30b11c85f32cf3d3254a3f857ad6d53a40ab2f9a01d0f3adb5`.
De ZIP-/tar-/manifest-/pakket-/executablecontroles zijn daarbij behouden.

Binnen deze afgebakende STC-route is geen productfout aangetoond. Er is geen
productfix gemaakt en geen algemene catalogusclaim opgewaardeerd.

Niet geclaimd: lokale/native GUI-bediening, Tauri-IPC, schermopname, Windows- of
macOS-runtimeacceptatie, andere spreadsheetformaten, volledige STC-variantdekking
of vrijgave van de P2-release.
