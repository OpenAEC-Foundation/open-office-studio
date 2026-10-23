# Open Database Studio

Experimentele databasebrowser in de gedeelde React/Tauri-werkruimte. Volgt [issue #8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8). Tekst, Rekenblad en Presentatie houden voorrang.

Vanaf weekuitgave 2026-W43.1 is er ook een [zelfstandige desktopapp](../../apps/database-studio), met een eigen venster, pictogram, installer en native exportdialoog. De parser en objectbrowser worden gedeeld; de zelfstandige bundel bevat de kantoorengines niet.

## Werkt nu

- MDB- en ACCDB-bestanden lokaal openen met de MIT-parser `mdb-reader` 3.2.0.
- Normale gebruikerstabellen, kolomnamen, typen en rijaantallen lezen.
- Maximaal 200 rijen per pagina tonen; zoeken en CSV-export gelden alleen voor de geladen pagina.
- Parsing in een moduleworker met overdracht van de invoerbuffer en een tijdslimiet van 15 seconden.
- Fouten melden voor beschadigde, lege en niet-ondersteunde bestanden. Originelen blijven onaangeroerd.
- Ingebouwde demonstratiegegevens onderscheiden van echte databasegegevens.

De Node-parserproef las 79 van 82 openbare databases. Drie bestanden met complexe of niet-ondersteunde velden werden geweigerd. De gebouwde browserworker las ook een MDB- en ACCDB-fixture via een Node-berichtadapter. Dit bewijst geen volledige versie-, encryptie- of velddekking. Zie het [corpusverslag](../../docs/tests/2026-10-21-formaten.md).

## Resterend werk

Geen databasebewerkingen, query-uitvoering, relaties, formulieren, rapporten, gekoppelde tabellen of ODB-ondersteuning. VBA-extractie en VBA-uitvoering ontbreken. SQL- en BAS-downloads zijn uitsluitend beschikbaar voor de ingebouwde voorbeelden. De richting blijft een volwaardige databaseomgeving met formulieren, query’s en rapporten; deze versie is daarvan slechts het begin.

De [browserproef van 0.4.1](../../docs/tests/2026-10-21-browser.md) heeft echte MDB/ACCDB-tabellen, typen, filters, CSV, foutbehoud en paginering gecontroleerd. Deze proef vond een ontbrekende browseradapter; die is hersteld. Native dialogen en schone installaties blijven afzonderlijke controles.

## Opbouw

`database-client.ts` beheert de worker en sessiegrenzen. `database-worker.ts` leest metadata en tabelpagina’s. `database-parser.ts` configureert de browserbuffer vóór het laden van de parser. `model.ts` bevat gegevensmodellen en CSV-escaping, inclusief bescherming tegen formule-invoer.

Starten: `pnpm install`, `pnpm dev`. Productie: `pnpm build`. Adaptercontroles: `pnpm test`.
