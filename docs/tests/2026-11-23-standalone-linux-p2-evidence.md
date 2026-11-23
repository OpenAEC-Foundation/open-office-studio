# Zelfstandige Linux-apps: bewaard P2-bewijs

Dit is uitsluitend historisch bewijs voor bron `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`. Het is geen P4-acceptatie of stabiele vrijgave. Er is niets gepubliceerd, getagd of naar main samengevoegd.

De eenmalig geverifieerde parent is release `45150438420`, Linux-job `137610274931`, attempt 1, artifact `14808939009` (`uitgave-Linux`), 4.444.678.701 bytes, ZIP-SHA256 `904a128efa87e73b6fb58072c208c348a043f86553d614c5d39fb9de83ea3f09`. Intake en expliciete go staan afzonderlijk in de bestaande P2-documenten. Prep `45159559656` splitste alleen de twaalf oorspronkelijke zelfstandige pakketten en zes rapporten; geen Suite-pakket of Suite-runtime kwam op een apphost. De originele app-inputs zijn daarna hergebruikt.

## Functionele uitkomsten en grenzen

| App | P2 DEB | P2 AppImage | Werkelijke kerncontrole en resterende grens |
|---|---|---|---|
| Writer | PASS | PASS | Werkelijk DOCX-bewerkveld, Ctrl+S, onafhankelijke XML, origineel behouden, volledig afsluiten en nieuw PID/heropenen/vindbare wijziging. |
| Spreadsheet | PASS | Kern-XLSX PASS; GNM intermitterend | Cel/formule/caches 27 en 36, bewaren en heropenen. DEB beide GNM-suffixen volledig groen. AppImage aanvankelijk `.gnm` groen, volgende `.gnumeric` echte native importfout; dezelfde originele bytes in gerichte herproef beide groen. Geen bewezen oorzaak of betrouwbaarheid uit één failure en één pass. |
| Presentation | PASS | PASS | Werkelijke Outline-tekstwijziging en tweede slide, Ctrl+S, PPTX-tekst/relaties onafhankelijk gecontroleerd, volledig afsluiten/nieuw PID/heropenen. Geen volledige animatie- of canvascertificering. |
| Email | FAIL Ctrl+S | FAIL Ctrl+S | Eerste noStoredPassword was een QA-stdinfixturefout. Na correcte SecretService-roundtrip werkt echte lokale IMAP-communicatie. Geadverteerde Ctrl+S doet geen APPEND; echte Draft-knop doet exact één APPEND met onafhankelijke MIME/plainbody-controle en volledig afsluiten/nieuw PID/native Drafts-header en iframebody teruglezen. Latere WebDriver-screenshot timeout blijft een aparte drivergrens. Productfix #379 is een andere bron en wordt hier niet als getest voorgesteld. |
| Notition | PASS | PASS | Nieuw eigen boek/paginatitel/tekst, lokale persistentie/Ctrl+S, echte native backup-export, onafhankelijke JSON en volledig afsluiten/nieuw PID/eigen profiel heropenen. |
| Database | PASS normale native route | PASS normale native route | Werkelijke ondersteunde SQLite-open/lees/UPDATE/export en cold-newPID-reopen met onafhankelijke typed SQLite-oracle; zie `2026-11-23-database-linux-p2-native.md`. De oorspronkelijke metadata-ACL- en WebDriver HTML-pickerdriverfouten blijven apart bewaard. Geen productfix of volledige Access-formatenclaim. |

Alle genoemde positieve native routes liepen op verse geïsoleerde Linux-CI-hosts, met uitsluitend de eigen app-input. Pakketidentiteit, eigen executable/desktopprofiel, pakket- en running-ELF-hash, PID/XID-focus, afwezigheid van Suite/host-LibreOffice en eigen resourcecleanup staan in de ruwe rapporten. Email gebruikt alleen synthetische loopbackdata; er is niets verzonden. Geen live account, alle formaten, alle conversies of Linux-cryptografische installerhandtekening zijn hiermee gecertificeerd.

## GNM-herproef en timing

AppImage `214a135377e3c701743b533d1a2991b16dec171cb4548e93f3fe5f8283256349` is in beide runs exact dezelfde pakketinput. Run `45159559656` (QA `3637dddd`) bevat de oorspronkelijke fout; `45162569158` (QA `5da75ff9`) bevat de gerichte positieve herproef. Het bronbestand blijft in beide suffixen dezelfde 2.062 bytes, SHA256 `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`.

Tussen de drivers veranderde diagnostiek: selectie van uitsluitend AppImage, twee readonly zenity-inventarisopdrachten vóór de GUI, `/proc/PID/cwd` en meer TMP/PATH-observatie per start, plus `panel.innerText` bij GNM-observaties. Dat laatste kan layout en RPC-timing beïnvloeden. Een native Show-details-click is alleen na de failuredeadline toegevoegd. De invoerbestanden, toetsen, wachtduren/90-secondenreadiness en criteria (acht getypeerde cellen, vier formules met waarden, twee bladen, echte edit, expliciete XLSX Save as, volledig afsluiten/nieuw PID en onafhankelijke ZIP/XML) bleven gelijk. De diagnostiek is geen bewezen causale fix. Een volgende begrensde herhaling moet dezelfde sequentie behouden en de oorspronkelijke intermitterende waarneming zichtbaar laten.

## Ruwe auditketen

`standalone-linux-p2-proof/receipt.json` bindt veertien officiële outputartifacts en 45 bytegetrouw bewaarde JSON-rapporten/matrices als deterministische gzip. Iedere volledige lokale output-ZIP is opnieuw op officiële API-grootte en SHA256 gecontroleerd; per bewaard rapport staan oorspronkelijke artifactmember, raw-SHA256 en gzip-SHA256 vast. Die ontvangst zegt niets over een gehele run als native-pass: failed en geslaagde deelroutes blijven apart.

De eigenlijke pakketbytes staan niet opnieuw in git. `standalone-linux-final-p2-prepared.json` en de kleine originele inputmetadata-ZIP binden de zes aparte app-inputartifacts, twaalf pakkethashes/identiteiten en zes rapporthashes aan de ene parent. De GitHub-artifacts blijven het ruwe beeld-/pakketbewijs; niet iedere screenshot is hier gekopieerd. Lokale Windows-GUI of opnamesessie is niet gestart.
