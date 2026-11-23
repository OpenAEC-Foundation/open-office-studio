# Zelfstandige Database: P2 native bewerken, export en heropenen

Beide oorspronkelijke losse Linux-pakketten zijn functioneel geslaagd op een verse CI-host zonder Suite: P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`. Dit is geen finale P5-acceptatie.

Run `45180827871`, QA `b20ed145467254763a629471cc011fc7b33eb965`, artifact `14821786524` (`standalone-linux-database`), 736.837 bytes, officiële en lokaal gecontroleerde ZIP-SHA256 `3ea416998bc8303161f3274ff09dcb66d3ec1111df4bb86756892e347fae828e`.

De hele run blijft terecht FAILURE: de eerdere WebKitWebDriver-route vangt de HTML-filechooser af. De normale binaries voeren de functionele route uit zonder WebDriververbinding, DOM-modelsetter, geïnjecteerd File-object of backend-statewijziging. AT-SPI wordt uitsluitend gelezen; alle bediening bestaat uit echte XTest-toetsen en muisklikken op zichtbare bediening met PID/XID-, focus- en executablecontrole. Er is geen Database-productfix of ACL-verruiming gemaakt.

| Vorm | Origineel pakket SHA256 | Eerste → heropende PID | Functioneel resultaat |
|---|---|---|---|
| AppImage | `9e49fd6e6195a377aa443187b4ebacf0659dc2a3be0ba2a0f4501adec4c6b4ae` | 5623 → 10588 | PASS |
| DEB | `d89d7d6c53879db362da68e30d8ee712db67fa1feeca55a0ce1de3b764eff824` | 10769 → 15608 | PASS |

De werkelijke ondersteunde SQLite-route opent via Ctrl+O en de OS-picker een synthetische tabel met `SyntheticAlpha=7` en `SyntheticBeta=11`. De zichtbare Access-SQL-editor levert eerst `SUM=18`; een werkelijk getypte `UPDATE` met de gewone Run-bevestiging wijzigt Alpha naar 13; een nieuwe SELECT geeft 24. Ctrl+S opent de echte native exportdialoog. Onafhankelijke Python sqlite3-controle op de geschreven bytes eist exact twee rijen, integerwaarden 13/11 en som 24. Vervolgens sluiten app, WebKit-processen en AppImage-launcher normaal af met exitcode 0; een nieuw proces opent de export via de gewone picker en voert opnieuw een zichtbare SELECT uit die 24 toont. Beide heropende GDK-beelden zijn visueel gecontroleerd.

De oorspronkelijke SQLite blijft SHA256 `4d0b734aa48197a00ecc4142fcbf93711cde0c86ecdb21531763075ea4c55aa4` met oorspronkelijke integerwaarden 7/11. De AppImage-export heeft SHA256 `a6fe0a18b1510b22585668f51597af4b44468abf0356c14f027ed554bcba4091`; de DEB-export `32c8863239669ab0542f1305553d9bea56210e7fe92f108d168a875b2fe27e32`. De bytes en beide oorspronkelijke inputs zijn opnieuw onafhankelijk lokaal geopend, alleen-lezen, en gecontroleerd.

De GTK-savepicker is geen appchild-PID-aanname. Ongewijzigde bewezen helpers uit protocol `9f321450ce9002dfd2bfbd8ed7baed63a212067e` en gecorrigeerde caller `3f4ddecd383e6a9fcb6a5f78ff456c08d772797a` koppelen de echte SaveFile-frontendcredentials aan het app-PID, requesthandle, broker en geactiveerde GTK-peer. Private D-Bus, DISPLAY, XAUTHORITY, PID-starttijd, ELF en één exact XID worden vóór invoer gecontroleerd. De werkelijk gefocuste native tekstentry moet via readonly AT-SPI exact het goedgekeurde exportpad bevatten vóór Return. De monitor sluit en de geattribueerde GTK-peers 4675 en 10777 worden na afloop gecontroleerd beëindigd. Beide appfamilies zijn weg; beide eigen Database-profielen zijn aangetoond en opgeruimd; geen Suite-profiel of Suite/host-LibreOffice-mapping is gebruikt.

`database-linux-p2-proof/receipt.json` bindt 19 bewaarde rapporten, passieve D-Bus-traces, echte remote GTK/GDK-beelden en SQLite-bytes aan de volledige geverifieerde output-ZIP. Helperprovenance staat afzonderlijk in `database-portal-helper-provenance.json`; 13 protocolcontracts en 5 native-inputcontracts slagen. Dit certificeert één ondersteunde synthetische SQLite-bewerkroute, geen volledige MDB/ACCDB/VBA/formulier- of conversiedekking. Linux gebruikt een geïsoleerde X11-desktop met GTK/XDG-portal; afwezigheid van die OS-service is geen geteste negatieve case. Geen lokale Windows-GUI/opnamesessie is gestart.
