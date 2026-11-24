# SXW / lo-sxw-1: statische bronoracle en historisch hergebruik

**STATIC_SOURCE_PASS_HISTORICAL_REUSE_CURRENT_RUNTIME_OPEN**.
Geen nieuwe CI, conversie, Word-engine, native bediening of browser-UI getest.
Volledige formaatacceptatie blijft **FALSE**. Eén oorspronkelijke fixture;
gewone tekst, gecachete veldweergave en levende databasefunctionaliteit blijven
onderscheiden. Geen algemene mailmerge-PASS.

## Exacte bron

Appbron P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.

Catalogus `lo-sxw-1` verwijst naar
[LibreOffice/core92c170f1: MailMerge.sxw](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sw/qa/unoapi/testdocuments/MailMerge.sxw).
5.391 bytes, Gitblob `1088405350933346ff9b99a758716588794b495f`, SHA256
`4b9368c02476d59fb488e7ba69a92be9e2c7404100ec487725efad1376dd78e5`.
Ongewijzigde bytes staan in `source.sxw`; originele LibreOffice-projectnotices
in `source-notices/`. Geen afzonderlijke CC0/per-bestandslicentie aangenomen.

Dit is een echte legacy OpenOffice.org XML Writer-container: eerste opgeslagen
MIME-entry `application/vnd.sun.xml.writer`, legacy office/text-namespaces,
`office:class=text`, `office:version=1.0`, passend manifest. Geen hernoemde ODT.
Alle zes ZIP-members, CRC's, lengtes, unieke namen en paden zijn gecontroleerd;
geen uitpakken naar willekeurige paden. De generator vermeldt zelf
`StarOffice 6.1 Beta 1 (Win32)`; geen producentattestatie of native Windows-test.

## Onafhankelijke bronoracle

`scripts/qa-sxw/native.py` gebruikt uitsluitend stdlib en oorspronkelijke
ZIP/XML-bytes. Het laadt geen productreader, Office, database of externe DTD.
De vijf exacte bekende publieke DTD-declaraties worden vóór parsing verwijderd;
andere DOCTYPEs/interne entities worden niet geaccepteerd. Geen volledige
DTD-/schema-conformiteitstest geclaimd.

De vier directe bodyalinea's zijn:

| Index | Rol | Gecachete weergave |
| --- | --- | --- |
| 0 | Lege alinea | `""` |
| 1 | Gewone letterlijke tekst | `Test` |
| 2 | Drie getypeerde databasevelden met expliciete spaties | `<Identifier>  <Address>  <Author>` |
| 3 | Lege alinea | `""` |

De veldbindingsattributen luiden database `Bibliography`, tabel `biblio`,
type `table`, kolommen achtereenvolgens `Identifier`, `Address`, `Author`.
De oorspronkelijke placeholders zijn gecachete weergaven. Tussen de velden
staat telkens één letterlijke spatie plus een `text:s` met standaardcount1;
de oracle bewaart beide. Een algemene `itertext()`-flattening zou het
veldtype en de expliciete spatie verliezen en wordt niet als oracle gebruikt.

De [primaire OpenOffice.org XML-specificatie](https://www.openoffice.org/xml/xml_specification.pdf),
Technical Reference Manual Version2/December2002, §§3.1.2 en3.7.11, is gelezen.
PDF met 571 pagina's, 1.418.866 bytes, SHA256
`043a0e4c30532d6b1ef028e12dcbade9b6d4bcc062c4d620329abe43bdcf34a1`.
De volledige relevante pagina's120 en163 zijn gerenderd en visueel bekeken;
tekstextractie heeft een gebrekkige glyphmapping. De specificatie verklaart
de extra `text:s`-spatie en onderscheidt databasevelden van hun weergegeven
inhoud. Zij bewijst geen databaseverbinding of uitgevoerde mailmerge.
De PDF wordt niet herverdeeld.

Alle alinea's verwijzen naar de gemeenschappelijke stijl `Standard` zonder
parent; de brondefault noemt `Thorndale` en `12pt`. Dat is een broninventaris,
geen fontinstallatie-, rendering- of behoudsacceptatie. Koptekstvelden
page-number/page-count worden apart geïnventariseerd; hun gecachete `1/1`
wordt niet als hoofdtekst of werkende paginaberekening geaccepteerd.

## Bestaand bewijs hergebruikt

Het in P2 gecommitteerde #43-Windowsverslag van 10 november bevat voor deze bron
al een technische open/save/nieuwe-sessie-reopen-PASS. Opgeslagen DOCX:
6.743 bytes, SHA256
`27777e12a4d2571af8079e003ec06d2371e69ab22a349d6f613daa10c6b9eda2`.
Het verslag is behouden als `retained/historical-windows-report.json`, exact
Gitblob `5d7e11bf168244e1d1e2dc400f6acea40a43ea1a`/SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.

De bestaande lokale cache bevat daarnaast een **geconverteerde**, nog niet
door de engine opgeslagen DOCX: 6.943 bytes, SHA256
`584d598f10bc2b972761e5c6b9bbb241b2900221b5bf095a28d1dddd088de252`.
Die bytes en conversie-/cacherapporten zijn exact bewaard in `retained/`.
De bronrij en conversieduur12.743ms correleren met het gecommitteerde verslag.
Er is geen onafhankelijke officiële artifact-/producerende-runbinding voor
die lokale cache: de correlatie is geen cryptografische herkomstattestatie.
De gecachete conversie wordt dus niet als actuele P2-proef geaccepteerd.

Read-only OOXML-onderzoek van deze historische conversie geeft drie passende
observaties: gewone DOCX-type, exact vier bodyalinea's inclusief beide extra
spaties, en drie complexe MERGEFIELD-structuren met juiste kolomnamen/caches.
Vier synthetische oraclecontroles wijzen gewijzigde `Test`-hoofdletter, verlies
van één extra spatie, platgeslagen velden en een onjuiste veldkolom af.
Dit zijn tests van de onafhankelijke oracle, geen extra importfixtures of
nieuwe product-/runtime-acceptatie.

Het historische conversieprofiel `8f301a13…de6c` verschilt van P2
`847721a3…e40`. Historisch converter-/enginebewijs wordt niet naar de private
P2-runtime of huidige native platforms overgezet.

## Openstaande P2-stappen en capaciteitsgrens

Read-only productiepolicycontrole op exacte P2-Gitbytes: SXW staat bij DOCX-
invoer, valt buiten de eigen tekstimportbranch en gaat naar `viaRuntime`.
De converter vereist de Tauri-desktopbridge; de aanbevolen normale save is
DOCX, zonder SXW-exportoverride. Dit is code-inspectie, geen nieuwe uitvoering
van helper, Node-browsergrens of echte browserroute.

Nog ontbrekend: echte private P2-runtime → productie-openhelper → Word-engine,
bewerking van gewone `Test`-alinea1, Undo/Redo, DOCX-save en onafhankelijk XML,
nieuw proces/heropen met exact opgeslagen bytes. De vooraf vastgelegde oracle
onderscheidt de gewone tekst van gecachete placeholders en veldstructuur.
Zelfs een toekomstige cache-/structuur-PASS bewijst geen gegevensophalen,
rijselectie, update, databasebeschikbaarheid of volledige mailmerge.

De integratiechat houdt nieuwe CI/runtimeconsumptie tegen tijdens de kritieke
draftcollector45371601667 zonder gerichte capaciteitsafstemming. Er is daarom
geen nieuwe job of runtime-inputdownload gestart; een mislukte collector is
geen automatische vrijgave. De runtimebinding wordt hier niet als verbruikt
of geverifieerd geclaimd. Bestaande gedeelde runtimepinnen blijven ongewijzigd.
Windows/Linux/macOS/browserbediening, visuele vergelijking, volledige
veld-/header-/stijl-/fontsemantiek en formaatacceptatie blijven open.

Open én gesloten SXW-issues zijn gezocht; de bestaande gesloten #43-beschrijving
en #30-context zijn gebruikt. Geen zelfstandig bewezen productfout of nieuw
issue. Geen product-, catalogus-, gedeelde index-, intake-, appbuild-, main-,
tag- of publicatiewijziging. Geen eigen lokale app/opname/server gestart.

Runtimevrije replay vanaf de QA-worktree:

```text
python -B scripts/qa-sxw/analyse.py
```

`--write` schrijft alleen het afgeleide `result.json`. De audit verifieert
bron/notice/Gitbindings, cachebytes, originele XML-oracle, drie historische
cachewaarnemingen en vier oraclecontroles. Geen Office- of Word-uitvoering.
