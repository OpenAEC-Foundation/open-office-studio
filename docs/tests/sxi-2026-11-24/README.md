# SXI / lo-sxi-1: bronoracle, historische maatmismatch, runtime OPEN

**STATIC_SOURCE_PASS_HISTORICAL_SIZE_MISMATCH_CURRENT_RUNTIME_OPEN**.
De bron is gekwalificeerd en statisch geïnventariseerd. De oude lokale
PPTX-conversie voldoet aan **6 van 7** begrensde bronvergelijkingen; de exacte
diamaatvergelijking blijft **FAIL**. Vier negatieve oraclecontroles worden
terecht afgewezen. Geen nieuwe CI, converter, engine of native/browser-UI
uitgevoerd. Volledige presentatie-/formaatacceptatie blijft **FALSE**.

## Bron en vooraf begrensde oracle

Exacte appbron: P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.

Bestaande `lo-sxi-1`:
[LibreOffice/core92c170f1 — ooo41061-1.sxi](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sd/qa/unit/data/sxi/ooo41061-1.sxi),
42.492 bytes, Gitblob `4c2482a586509a1615cd996e0847cb1c9d07d76a`, SHA256
`38450da6649c31b5f319ecee7f9f804691312f6431c5435e82581bd101b31399`.
Ongewijzigde bytes en LibreOffice-projectnotices zijn behouden. Geen
afzonderlijke CC0/per-bestandslicentie of producentattestatie aangenomen.

De eerste opgeslagen ZIP-entry heeft legacy MIME
`application/vnd.sun.xml.impress`. Rootclass presentation, officeversion1.0,
legacy namespaces en manifest passen bij echte SXI; geen hernoemde ODP.
Alle elf unieke packagepaden, CRC's, groottes en resourcehashes zijn getoetst.
De eigen XML-reader verwijdert uitsluitend bekende externe DTD-declaraties;
andere DTDs/entities zijn niet geaccepteerd en er is geen externe resolver.
Dit is geen volledige DTD-/schemavalidatie.

De directe body bevat **26 draw:page-elementen** en een afzonderlijk
presentation:settings-element. De hoofd-diatekeningen bevatten 93 objecten:
28 text-boxes, 64 rechthoeken, één image. De 26 notesstructuren worden apart
gehasht en niet met diaobjecten/hoofdtekst verward. Vijf PNG/GIF-packagebestanden
worden op bytes/hash en eenvoudige header/pixelmaten geïnventariseerd;
er wordt geen decoder/renderingacceptatie uit afgeleid.

Vóór de cachevergelijking is de inhoudelijke oracle begrensd tot:

- 26 dia's in presentatievolgorde en de paragraafvector van het eerste
  titelobject per dia, als SHA256-vector zonder volledige dia-tekst te kopiëren.
- De twee alinea's van het subtitleobject op dia1 en de acht outline-alinea's
  op dia2; lijststijl, inspringing en fonts vallen buiten deze tekstcase.
- De werkelijke presentatie-maat: alle dia's verwijzen via hun master naar
  page-master `PM1`, met `fo:page-width=28cm` en `fo:page-height=21cm`.
  Handout-PM0 en notes-PM2 zijn nadrukkelijk andere maten.
- De exacte originele GIF-bytes plus interne image-relatie op dia17:
  3.274 bytes, SHA256
  `fde1866bf3569bfdd850c1344e97357fe83c2374521c89f94f283f2db8a7babe`.
  Gelijke bytes/relatie bewijzen geen correcte pixels, positie of afspelen.
- Het gewone PPTX-hoofdinhoudstype bij onderzoek van de historische conversie.

De eigen bronreader staat in `scripts/qa-sxi/native.py`. Overige objecten
hebben een inventaris van soort, IDs/stijlreferenties, ruwe geometrie en
logische XML-serialisatiehash. De ruwe XML-memberhashes staan apart.
Die inventaris is geen algemene object-, font-, geometrie- of lay-out-PASS.

## Bestaand bewijs en cachewaarneming

Het exact in P2 gecommitteerde #43-Windowsverslag van 10 november bevat voor
deze bron een technische open/save/nieuwe-sessie-reopen-PASS met 26 dia's,
LibreOffice26.8.2.2 `9dea406ab7695df6325b11b0e19fdca8db4b7276`.
Het opgeslagen enginepakket was 83.870 bytes, SHA256
`22d1a4e00baf6ff13c98b1939327420afd0f482d355bfbb45b79b7583085fcc9`.
Dat opgeslagen pakket is hier niet opnieuw getoetst. Het ongewijzigde verslag
staat in `retained/historical-windows-report.json`.

De bestaande lokale cache bevat een **geconverteerde**, nog niet door de
engine opgeslagen PPTX van 85.070 bytes, SHA256
`be418ce739fd663401cbb635d327e20e2b67779a50fdeff4cb8e52528954978b`.
Die bytes, het cacheverslag en de conversiereceipt zijn exact behouden.
De bronrij correleert met het gecommitteerde verslag, maar de interne
conversiemeting11310ms verschilt1ms van de verslagrij11309ms. Er is geen
officiële artifact-/producerende-runattestatie voor deze lokale cache.
Het historische profiel `8f301a13…de6c` verschilt bovendien van P2
`847721a3…e40`. Geen actuele P2- of platformequivalentie aangenomen.

Read-only OOXML-onderzoek volgt `p:sldIdLst` en interne relaties; fysieke
ZIP-bestandsvolgorde bepaalt de diavolgorde niet. Zes cases passen: gewoon
PPTX-type, 26 dia's, de 26 titelvectoren in bronvolgorde, de twee geselecteerde
tekstobjecten en de bytegelijke originele GIF-relatie op dia17.
De oude cache bevat ook 93 hoofdobjecten; dit is alleen een observatie en
wordt niet als algemene één-op-één-objectacceptatie geteld.

**De zevende case blijft afgekeurd:**

| Maat in EMU | Bron via PM1 | Historische PPTX | Verschil |
| --- | ---: | ---: | ---: |
| Breedte | 10080000 | 10080625 | +625 |
| Hoogte | 7560000 | 7559675 | −325 |

De omrekening gebruikt exact360000EMU/cm met Decimal, zonder tolerantie of
afronden naar de waargenomen uitvoer. De rol van `p:sldSz` staat in de
[primaire Microsoft SlideSize-documentatie](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.slidesize?view=openxml-3.0.1);
de [primaire EMU-documentatie](https://learn.microsoft.com/en-us/windows/win32/vml/basic-vml-types)
geeft914400EMU/inch, dus360000EMU/cm. Daarmee is uitsluitend het numerieke
verschil onderbouwd, niet de oorzaak, een toegestane conversietolerantie of
een zichtbaar defect. Geen nieuwe actuele P2-productbug geclaimd/geregistreerd.

De vier negatieve oraclecontroles verwijderen een dia, verwisselen dia1/2,
veranderen een titelletter of verwijderen het hoofd-dia-image. Elke controle
moet een **nieuwe** mislukte case opleveren bovenop de al aanwezige maatmismatch.
Een al rode dimensiecase kan de controles dus niet ten onrechte doen slagen.
Dit zijn synthetische wijzigingen voor de oracle, geen nieuwe importfixtures
of productweigeringstests. De historische maatmismatch wordt niet gerepareerd.

## Linux-grens en openstaande actuele proef

De P2-catalogus bevat voor deze bron tevens de historische Linux7.3.7.2
`30(Build:2)`-weigering bij PPTX-export met `SfxBaseModel::impl_store 0xc10`.
Die geregistreerde grens blijft afzonderlijk behouden. Hij is hier niet
opnieuw gereproduceerd of als resultaat van de P2-private-runtime aangemerkt;
de Windows-PASS heft hem niet op.

Read-only P2-policy: SXI-invoer behoort tot PPTX en valt terug op
`viaRuntime`, waarvoor de echte converter een desktop/Tauri-bridge vereist.
Normaal savevoorstel is gewone PPTX, zonder SXI-exportoverride.
Geen nieuwe productiehelper-/Node-browsergrens-/gehoste browserproef geclaimd.

Nog OPEN: na gerichte capaciteitsafstemming echte gepinde private runtime →
productie-openhelper → PPTX-engine, edit van een vooraf gekozen titel,
Undo/Redo, gewone PPTX-save, onafhankelijk OOXML en nieuw-proces-heropen met
exact opgeslagen bytes. De publishercorrectie geeft geen automatische
CI/runtimevrijgave; er is niets gestart of gedownload. SXW blijft apart OPEN.
Fonts, rendering, animaties, notes/masters, overige media/embedded objecten,
volledige layout en native Windows/Linux/macOS/browservergelijking zijn niet
geaccepteerd. Geen algemene presentatie-PASS.

Open én gesloten SXI-issues zijn gezocht; de gesloten #43-beschrijving en
het #30-kader zijn gebruikt. Geen product/catalogus/index/intake/appbuild/
main/tag/publicatiewijziging. Geen eigen app-, server- of opnamesessie gestart.

Runtimevrije replay vanaf de QA-worktree:

```text
python -B scripts/qa-sxi/analyse.py
```

`--write` schrijft alleen het afgeleide resultaat. Succesvolle audit betekent
dat bron/hergebruik/waarnemingen exact reproduceerbaar zijn, inclusief de
zichtbaar behouden maat-FAIL; niet dat alle broncases of actuele runtime slagen.
