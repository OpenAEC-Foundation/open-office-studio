# lo-gnumeric-1: authentieke lege bron, afzonderlijk houden van positieve fixtures

**AUTHENTIC_EMPTY_GNUMERIC_SOURCE_NO_POSITIVE_CELL_WITNESS_REUSE_ONLY**.
Gzip-integriteit en de drie lege XML-bladen zijn onafhankelijk gecontroleerd.
De bestaande bron-/bewijsgrens is gereconcilieerd. Deze bron levert **geen**
positieve oorspronkelijke celtype-/waarde-/formule-importproef. Volledige
formaatacceptatie blijft **FALSE**; geen nieuwe runtime of CI aangevraagd.

## Oorspronkelijke bron en containerroute

App P2: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.

Werkelijk catalogus-id `lo-gnumeric-1`:
[LibreOffice/core92c170f1 — täßt.gnumeric](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/gnumeric/t%C3%A4%C3%9Ft.gnumeric),
1.716 bytes, Gitblob `043616c3e3f67dc3415b92c44ea17d7cb5978510`, SHA256
`1bc3d97bb228f6d9735886600bfdbb5b75169c767ffc0ab6ed3a96abe9fcda36`.
De oorspronkelijke gecomprimeerde bytes en LibreOffice-projectnotices zijn
behouden. Geen afzonderlijke CC0/per-bestandslicentie aangenomen.

De originele suffix is `.gnumeric`. Eén gzip-member, FLAGS0/DEFLATE, correcte
CRC32/ISIZE en een begrensde decompressie leveren10.568 XML-bytes op, SHA256
`692ceb25d08d848020470c553b53065f882eb7b6fc6a8b5208e3b42946e56500`.
Header/trailer zijn gelezen volgens [RFC1952](https://www.rfc-editor.org/rfc/rfc1952.html).
Er zijn geen optionele bestandsnaamvelden in deze header. Gedeelde uitgepakte
XML zou geen bewijs voor een andere container- of naamroute opleveren.
Deze QA maakt of opent geen nieuwe `.gnm`-alias van de1.716-byte bron.

Vier controles op de eigen begrensde reader wijzen verkeerde CRC, afgekorte
trailer, meerdere aaneengeplakte members en een overschreden eigen uitpakgrens
af. Concatenatie is algemeen toegestaan in gzip, maar valt buiten dit ene
bevroren single-membercontract. Dit zijn geen productweigeringstests of
algemene uitspraken over ongeldige gzipbestanden.

## Onafhankelijke XML-oracle: werkelijke inhoud ontbreekt

De eigen stdlib-reader gebruikt de oorspronkelijke uitgepakte bytes, geen
converterbaseline. Hij leest de Gnumeric-v10-namespace, de drie directe
Sheets/Sheet-elementen en hun Cells-secties:

| Blad | Gewone celrecords | Cel-/formulerecords |
| --- | ---: | ---: |
| Sheet1 | 0 | 0 |
| Sheet2 | 0 | 0 |
| Sheet3 | 0 | 0 |

De SheetNameIndex bevestigt dezelfde volgorde. StyleRegions, rij-/kolom-
defaultmaten, DisplayFormulas en Calculation-metadata zijn apart geïnventariseerd;
getallen in die instellingen zijn geen gewone celwaarden of uitgevoerde formules.
De Version-vermelding1.12.34 is een zelfrapportage, geen producerattestatie.
Er wordt geen externe XSD geladen of volledige schema-, stijl-, font- of
renderingconformiteit goedgekeurd. De lege inhoud zelf maakt dit bestand niet
corrupt en bewijst geen applicatiefout.

De oude Windows #43-proef van 10 november heeft een technische
open/save/heropen-PASS. De behouden lokale XLSX van1.648.840 bytes heeft exact
zijn gecommitteerde saved-digest
`df18582a4ecb0cace2847e261970de4ce27f5b8565694426bd4a10fa4d728264`.
Een streaming OOXML-controle bevestigt dezelfde drie bladen en nul `<v>`,
`<f>` of inline-string-inhoud in gewone cellen. De768.768 fysieke cel-elementen
zijn dus geen768.768 geïmporteerde bronwaarden. De grote style-only XML wordt
niet als volledige celmatrix in geheugen opgebouwd.

Deze historische bytes/rapporten worden hergebruikt, niet opnieuw geconverteerd.
Het oude profiel `8f301a13…de6c` verschilt van P2 `847721a3…e40`; geen actuele
P2-runtime-/native-/platformequivalentie geclaimd. De Unicode-basename van de
upstream URL levert evenmin een nieuwe Unicode-bestandsdialoogtest op.

## Positief bestaand bewijs betreft een andere bron

Het root-P2-routebewijs beschreef deze lege bron al expliciet. Het positieve
bewijs gebruikt `universal-content.gnumeric`, **2.062 bytes**, Gitblob
`440c2feb88d5fd5d262c7338047ecdc5f2a6998a`, SHA256
`0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`:
twee bladen, acht getypeerde cellen en vier oorspronkelijke formules.
Dezelfde echte gzipbytes zijn daar afzonderlijk door beide `.gnm`- en
`.gnumeric`-naamroutes getest. Dat is geen tweede producentvariant.

| Bestaande andere bron | Behouden afbakening |
| --- | --- |
| P2 Windows native45151594168 | Twee werkelijk uitgevoerde suffixroutes, acht cellen/vier formules en native edit/save/nieuw proces; andere fixture |
| P2 Linux native45155198992 | Beide suffixroutes op de echte P2-DEB, andere fixture |
| Mac-actuals van6f92, run45357794642 | P5-scope van die eigenaar, andere fixture; geen nieuwe package-/nativeacceptatie door deze QA |

De canonieke oorspronkelijke metadata/README's zijn behouden met
commit/path/Gitblob/SHA-pinnen. Geen grote oude proof-ZIP opnieuw gedownload
of gevalideerd. Dit is hergebruik van geldige scope-informatie.

Bij de Mac-actuals zijn de werkelijk bewaarde `.gnm`- én `.gnumeric`-invoer
read-only gehasht: beide zijn exact de2.062-byte universal-content-bron.
Ook de bestaande actual-outputbestanden zijn uitsluitend op identiteit
geïnventariseerd; die bytes worden hier niet als nieuwe huidige bronfixture
of eigen native bewijs overgenomen. De betreffende twee jobs138320456572
en138320456566 zijn success; de **hele workflowconclusie is failure**.
Deze verschillende niveaus blijven in de boundaryreceipt onderscheiden.
Mac-harness4c2d7637 is geen hier opnieuw geverifieerde app-/pakketidentiteit.
De P5-nativeclaims en resources blijven bij6f92.

De acht cellen/vier formules, routepasses en latere edits worden dus niet
naar de lege1.716-byte bron, een andere suffix of een ander codepunt geleend.

## Actuele productiepolicy en ontbrekend bewijs

Read-only P2-code: `gnm` en `gnumeric` zijn aparte catalogusnaamkeuzes voor
dezelfde XLSX-conversieroute. De echte converter vereist de Tauri-desktopbridge.
Geen van beide heeft een uitvoeroverride; het moderne savevoorstel is XLSX.
Er is geen nieuwe uitvoering van productiehelper, engine, native UI of echte
browserroute. Gewone uitgepakte XML is evenmin als alternatieve input getest.

De oude releasecapaciteitshold is volgens integratie beëindigd, maar er is
geen nieuwe CI/runtime/build/downloadronde toegewezen. Deze audit vraagt er
geen aan: herhaling van een lege import creëert geen ontbrekende originele
cel-/formule-inhoud. Een zinvolle positieve fixture is bovendien al afzonderlijk
getest. De huidige1.716-byte bron krijgt daarom geen nieuwe runtime-PASS.
Geen volledige stijl-/font-/print-/locale-/niet-ASCII-/schema-/security- of
algemene formaatacceptatie. SXW/SXI/DIF-runtime blijven apart OPEN.

Geen nieuw issue voor de reeds bekende lege-brongrens. Open én gesloten
Gnumeric-issues zijn gezocht; bestaande relevante bewijzen zijn gebruikt.
Geen product/catalogus/index/intake/main/tag/releasewijziging, appbuild,
nieuwe native-/CI-run of automatische volgende claim. Geen eigen lokale
app-, server-, converter-, besturings- of opnamesessie gestart.

Runtimevrije replay vanaf de QA-worktree:

```text
python -B scripts/qa-gnumeric/analyse.py
```

De replay controleert gzip/bron-/notice-/Git-/referentiehashes, drie lege
XML-bladen, vier readercontroles, de historische lege XLSX en de expliciete
andere-fixturegrens. `--write` schrijft alleen het afgeleide resultaat.
