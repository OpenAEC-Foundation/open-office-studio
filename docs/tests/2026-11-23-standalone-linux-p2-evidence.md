# Zelfstandige Linux-apps: bewaard P2-bewijs

Dit is uitsluitend historisch bewijs voor bron `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`. Het is geen P4-acceptatie of stabiele vrijgave. Er is niets gepubliceerd, getagd of naar main samengevoegd.

De eenmalig geverifieerde parent is release `45150438420`, Linux-job `137610274931`, attempt 1, artifact `14808939009` (`uitgave-Linux`), 4.444.678.701 bytes, ZIP-SHA256 `904a128efa87e73b6fb58072c208c348a043f86553d614c5d39fb9de83ea3f09`. Intake en expliciete go staan afzonderlijk in de bestaande P2-documenten. Prep `45159559656` splitste alleen de twaalf oorspronkelijke zelfstandige pakketten en zes rapporten; geen Suite-pakket of Suite-runtime kwam op een apphost. De originele app-inputs zijn daarna hergebruikt.

## Functionele uitkomsten en grenzen

| App | P2 DEB | P2 AppImage | Werkelijke kerncontrole en resterende grens |
|---|---|---|---|
| Writer | PASS | PASS | Werkelijk DOCX-bewerkveld, Ctrl+S, onafhankelijke XML, origineel behouden, volledig afsluiten en nieuw PID/heropenen/vindbare wijziging. |
| Spreadsheet | PASS | Kern-XLSX PASS; GNM intermitterend | Cel/formule/caches 27 en 36, bewaren en heropenen. DEB beide GNM-suffixen volledig groen. AppImage aanvankelijk `.gnm` groen, volgende `.gnumeric` echte native importfout; dezelfde originele bytes in gerichte herproef en één begrensde extra herhaling beide groen. De oorspronkelijke intermitterende fout is daarmee niet verklaard of opgelost. |
| Presentation | PASS | PASS | Werkelijke Outline-tekstwijziging en tweede slide, Ctrl+S, PPTX-tekst/relaties onafhankelijk gecontroleerd, volledig afsluiten/nieuw PID/heropenen. Geen volledige animatie- of canvascertificering. |
| Email | FAIL Ctrl+S | FAIL Ctrl+S | Eerste noStoredPassword was een QA-stdinfixturefout. Na correcte SecretService-roundtrip werkt echte lokale IMAP-communicatie. Geadverteerde Ctrl+S doet geen APPEND; echte Draft-knop doet exact één APPEND met onafhankelijke MIME/plainbody-controle en volledig afsluiten/nieuw PID/native Drafts-header en iframebody teruglezen. Latere WebDriver-screenshot timeout blijft een aparte drivergrens. Productfix #379 is een andere bron en wordt hier niet als getest voorgesteld. |
| Notition | PASS | PASS | Nieuw eigen boek/paginatitel/tekst, lokale persistentie/Ctrl+S, echte native backup-export, onafhankelijke JSON en volledig afsluiten/nieuw PID/eigen profiel heropenen. |
| Database | PASS normale native route | PASS normale native route | Werkelijke ondersteunde SQLite-open/lees/UPDATE/export en cold-newPID-reopen met onafhankelijke typed SQLite-oracle; zie `2026-11-23-database-linux-p2-native.md`. De oorspronkelijke metadata-ACL- en WebDriver HTML-pickerdriverfouten blijven apart bewaard. Geen productfix of volledige Access-formatenclaim. |

Alle genoemde positieve native routes liepen op verse geïsoleerde Linux-CI-hosts, met uitsluitend de eigen app-input. Pakketidentiteit, eigen executable/desktopprofiel, pakket- en running-ELF-hash, PID/XID-focus, afwezigheid van Suite/host-LibreOffice en eigen resourcecleanup staan in de ruwe rapporten. Email gebruikt alleen synthetische loopbackdata; er is niets verzonden. Geen live account, alle formaten, alle conversies of Linux-cryptografische installerhandtekening zijn hiermee gecertificeerd.

## GNM-herproef en timing

AppImage `214a135377e3c701743b533d1a2991b16dec171cb4548e93f3fe5f8283256349` is in beide runs exact dezelfde pakketinput. Run `45159559656` (QA `3637dddd`) bevat de oorspronkelijke fout; `45162569158` (QA `5da75ff9`) bevat de gerichte positieve herproef. Het bronbestand blijft in beide suffixen dezelfde 2.062 bytes, SHA256 `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`.

Tussen de drivers veranderde diagnostiek: selectie van uitsluitend AppImage, twee readonly zenity-inventarisopdrachten vóór de GUI, `/proc/PID/cwd` en meer TMP/PATH-observatie per start, plus `panel.innerText` bij GNM-observaties. Dat laatste kan layout en RPC-timing beïnvloeden. Een native Show-details-click is alleen na de failuredeadline toegevoegd. De invoerbestanden, toetsen, wachtduren/90-secondenreadiness en criteria (acht getypeerde cellen, vier formules met waarden, twee bladen, echte edit, expliciete XLSX Save as, volledig afsluiten/nieuw PID en onafhankelijke ZIP/XML) bleven gelijk. De diagnostiek is geen bewezen causale fix. Een volgende begrensde herhaling moet dezelfde sequentie behouden en de oorspronkelijke intermitterende waarneming zichtbaar laten.

## Ruwe auditketen

`standalone-linux-p2-proof/receipt.json` bindt vijftien officiële outputartifacts en 50 bytegetrouw bewaarde JSON-rapporten/matrices als deterministische gzip. Iedere volledige lokale output-ZIP is opnieuw op officiële API-grootte en SHA256 gecontroleerd; per bewaard rapport staan oorspronkelijke artifactmember, raw-SHA256 en gzip-SHA256 vast. Die ontvangst zegt niets over een gehele run als native-pass: failed en geslaagde deelroutes blijven apart.

De eigenlijke pakketbytes staan niet opnieuw in git. `standalone-linux-final-p2-prepared.json` en de kleine originele inputmetadata-ZIP binden de zes aparte app-inputartifacts, twaalf pakkethashes/identiteiten en zes rapporthashes aan de ene parent. De GitHub-artifacts blijven het ruwe beeld-/pakketbewijs; niet iedere screenshot is hier gekopieerd. Lokale Windows-GUI of opnamesessie is niet gestart.

## Begrensde herhaling na Database-afronding

Precies één aanvullende verse AppImage-host draaide de ongewijzigde driverbestanden uit `5da75ff975c798b16557707cf8b376a728a8ae76`; nieuwere Database/Email/OS-pyatspi-driverwijzigingen zijn niet gebruikt. Workflowcommit `fa96ca06` bindt die driver afzonderlijk van de P2-appbron. Run `45182616870` is SUCCESS; artifact `14821128027` (`standalone-linux-spreadsheet-gnm-repeat`), 3.143.222 bytes, officiële en volledig lokaal gecontroleerde ZIP-SHA256 `c2c571ae1a43d2eca9c796f2852102ac4d98d9ca67d32ac1a70e9e94a93ec37b`.

Dezelfde eigen input `14809269456`/producer `45159559656` en AppImage `214a1353…` leveren opnieuw beide volledige suffixroutes, zonder extra invoer, uitstel, retries of criteriumwijziging. `.gnm` gebruikt PID 5240→5923; `.gnumeric` 6295→6959. Beide opnieuw opgeslagen/heropende XLSX-bestanden zijn SHA256 `1dcc4821688c4ef2f016c62879da03fc9915054e72b915c74f223ce52c1196c4`; originele 2.062 bronbytes blijven `0ae78397…`. De XLSX-kernpreflight, acht getypeerde cellen, vier formules/waarden, twee bladen, echte edit, aanbevolen XLSX Save as, volledig afsluiten/nieuw PID en onafhankelijke XML-oracles slagen; eigen app/driver/profielen zijn opgeruimd.

Dit sluit de ene geautoriseerde herhaling af. Er zijn nu twee latere positieve uitvoeringen naast de oorspronkelijke intermitterende importfout. De fout blijft expliciet open/onverklaard; er is geen productfix of onbeperkte betrouwbaarheidsclaim. P5-native acceptatie gebruikt uitsluitend nieuwe, apart gebonden P5-pakketten.
