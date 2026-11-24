# SXC / lo-sxc-1: exact P2-bewijs hergebruikt, objectcontrole blijft FAIL

**REUSED_P2_WINDOWS_CELL_PASS_STRICT_OBJECT_FAIL_NO_NEW_RUNTIME**.
De oorspronkelijke onafhankelijke bronoracle is exact gereproduceerd met
ongewijzigde readerbytes. Bestaande native Windows- en converterresultaten
op hetzelfde appcodepunt worden hergebruikt, niet opnieuw uitgevoerd.
Volledige SXC-/objectacceptatie blijft **FALSE**. Geen #380-productwerk.

## Exacte bron en bronoracle

App P2: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.
Alle nieuwe bestanden zijn QA/hergebruikdocumentatie; productcode blijft P2.

Bestaande `lo-sxc-1`:
[LibreOffice/core92c170f1 — calcshapes.sxc](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unoapi/testdocuments/calcshapes.sxc),
13.030 bytes, Gitblob `7f98b1a501e004eafe85e4947dbbe88a292e9c19`, SHA256
`9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d`.
Ongewijzigde bytes en bestaande LibreOffice-projectnotices zijn behouden;
geen afzonderlijke CC0/per-bestandslicentie aangenomen.

De echte legacy Sun XML/Calc-MIME en officeversion1.0 horen bij deze bron.
De oorspronkelijke eigen, onafhankelijke reader uit
[proofcommit d74ff7a8](https://github.com/OpenAEC-Foundation/open-office-studio/tree/d74ff7a8fa29a1109b2a0f6b8290615a0899a3f2/qa/sxc-native-windows)
wordt bytegelijk hergebruikt in `scripts/qa-sxc/reference/`, inclusief zijn
oorspronkelijke fixtureconfiguratie. `fixture.json` bindt elke gekopieerde
referentie aan originele commit/path/Gitblob/byteaantal/SHA256. De canonieke
Gitbytes worden zonder Windows-regelafbrekingsnormalisatie behouden.

Alleen `read_source()` is opnieuw uitgevoerd, met dezelfde Pillow13.0.0.
Geen native/converter/audit-CLI, fetch(), productengine, WASM, browser of
formulieractie is aangeroepen. Het resultaat is als complete datastructuur
gelijk aan de reeds vóór import bevroren `source-oracle-before-import.json`:

- Bladvolgorde `Sheet1`, `Sheet2`, `Sheet3`.
- Eén gewone broncel, `Sheet1!C13 = Note attached`.
- Een afzonderlijke annotatie op C13, `Just a note`.
- Sheet2/Sheet3 bevatten geen broncelwaarden; **nul oorspronkelijke formules**.
- Negen top-level tekenobjecten: rechthoek, cut/chord-ellips, volledige ellips,
  bitmap, groep met rechthoek+lijn en vier getypeerde formuliercontrols.

De cellenreader gebruikt directe celalinea's voor de waarde en aparte
annotation-elementen voor de notitie. Annotationtekst wordt dus niet ten
onrechte als tweede gewone celwaarde opgevat. Rij-/kolomherhaling en geneste
tekenobjecten worden door de oorspronkelijke reader afgehandeld; labels,
vormgeometrie en beeldpixels zijn geen gewone spreadsheetcellen/formules.

## Reeds bestaand exact P2-Windowsbewijs

De oorspronkelijke volledige overdracht staat in `retained/prior-readme.md`.
Canonical receipts/bindings en de bevroren bronoracle zijn exact gekopieerd
uit d74ff7a8. Er wordt geen geldige reeds uitgevoerde native stap herhaald.

| Bestaand bewijs | Vastgelegde uitkomst |
| --- | --- |
| [Native run45164747391](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45164747391), job137658680548 | Native bediening/cellen PASS; strikte objectpreservatie FAIL; runconclusie failure behouden |
| Drie native picker-cases, drie normale volledige exits, twee nieuw-proces-heropeningen | Bestaande geslaagde uitvoering hergebruikt |
| H1-marker, I1=`=40+2`/42, echte gridfocus en Undo/Redo, Ctrl+S/SaveAs | Bestaande geslaagde uitvoering hergebruikt |
| Originele C13/notitie, drie bladen, werkelijk opgeslagen/heropende XLSX | Bestaande onafhankelijke cel-/XML-controles hergebruikt |
| [Converter-only control45166523239](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45166523239), job137664775095 | Bestaande afgeronde controle hergebruikt; dezelfde geselecteerde vorm/controlverschillen bestaan vóór engine-Save |

Native harness `f94a88bb43fc8249e8e1e9ad93babe6c7f214af7`, artifact14814677764,
ZIP-SHA256 `9960b654d45739a8ca1e2bf18c28101d328a0494e60ef5b864834e28b117f270`.
Converter-control harness `92f86fc5abcf9c4f2a588480d0707bc4ab4809c4`,
artifact14815275891, ZIP-SHA256
`186e3dee50af270ed7e546828e9169f70ef1b52a7c575c6aba6abcbc05663f42`.
Converteruitvoer SHA256
`7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196`.

De oorspronkelijke audits verifieerden volledige officiële ZIPs, bron/pakket,
native uitvoering, opgeslagen bestanden en cleanup. Deze nieuwe kleine replay
verifieert de canonieke gekopieerde bron/reader/config/receipts; hij downloadt,
hasht of auditeert die grote ZIPs en alle native uitvoerbestanden niet opnieuw.
Geen nieuwe officiële artifactdownload-/package-/native-testclaim.
De afgebroken eerdere controle45165934483 blijft in de oude binding als
driverfout vóór conversie bewaard en wordt niet als geslaagde conversie geteld.

De veel oudere technische #43-PASS van 10 november is apart bewaard in
`nov10-historical-windows-report.json`. Hij wordt niet als bronbehoud of
actuele native P2-uitvoering gebruikt waar het sterkere P2-bewijs bestaat.

## Negatieve grenzen blijven negatief

- Drie vectorbreedtes verschillen **+0.009cm** van de bron, buiten de vóór
  import vastgelegde tolerantie0.001cm. De bestaande strikte uitkomst blijft FAIL.
- De uitvoer heeft getypeerde button/checkbox-controls. De Radio heeft nog
  een verborgen AlternateContent-naam/label maar geen getypeerde controlrelatie;
  de oorspronkelijke TextBox-control ontbreekt. Dit zegt niet dat de Radio-
  labelstring uit ieder XML-part is verdwenen.
- De P2-app toont een chord-placeholder terwijl de oorspronkelijke DrawingML
  de Save overleeft. Dit wordt niet als nieuw herstelde renderondersteuning
  of als shapeverlies door engine-Save gepresenteerd.
- De toegevoegde UI-formule I1 bewijst bewerking en bewaren, **geen import van
  oorspronkelijke formules**: deze fixture heeft er geen.
- De convertercontrol laat voor vier native outputs gelijke objectparts en
  geselecteerde structuren zien. Dat voorkomt een onterechte nieuwe claim
  dat engine-Save deze reeds bestaande conversieverschillen veroorzaakt.

De bestaande [#380-beschrijving](https://github.com/OpenAEC-Foundation/open-office-studio/issues/380)
is gelezen en als snapshot behouden. De latere chordfix/bron
`42d161a3d494fb56fa159501a510a34ac95f6fd0` en diens browser/printbewijs zijn een
ander codepunt; geen productcode of nieuwe claim daarvoor in deze branch.
Algemene volledige layout/font/rendering/control-acties zijn niet geaccepteerd.

## Capaciteit, resterende platforms en replay

Geen nieuwe CI/runtimeconsumptie tijdens release-run45376499489. Er is geen
inhoudelijk gat vastgesteld dat herhaling van de al gedekte P2-Windowsroute
rechtvaardigt. Eventuele echt ontbrekende Linux/macOS/native-/browsercontroles
blijven afzonderlijk open en vereisen gerichte capaciteitsafstemming.
Een browserproef met geconverteerde XLSX op het toekomstige chordfixpunt is
geen directe browser-SXC-conversie of platformequivalentie op P2.
SXW en SXI blijven apart OPEN; deze opdracht hervat hun runtime niet.

Runtimevrije hergebruik-/bronreplay, met de bestaande Pillow13.0.0:

```text
python -B scripts/qa-sxc/analyse.py
```

Succes betekent dat de bronoracle en de bestaande gemengde uitkomst correct
zijn gereconcilieerd. Het maakt de negatieve native/objectcontrole niet groen.
`--write` schrijft alleen het afgeleide resultaat.
Geen nieuw issue, product/catalogus/index/intake/appbuild/main/tag/publicatie.
Geen eigen lokale app, server, Office-converter of opnamesessie gestart.
