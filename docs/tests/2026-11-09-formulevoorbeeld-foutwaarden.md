# Foutwaarden in Functie invoegen (#59)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`.

Het functievoorbeeld kopieerde verwijzingswaarden naar een kladwerkmap als
invoertekst. Alleen `#N/A` kreeg een foutformule; andere foutwaarden werden
overgeslagen en veranderden daardoor in lege cellen. Met `#DIV/0!` in A1
toonde het voorbeeld van `A1+1` bijvoorbeeld `1`. Met zo'n foutcel op een ander
blad gaf `IFERROR('Bron blad'!A1,99)` het voorbeeld `0` in plaats van `99`.

Het voorbeeld gebruikt nu de openbare `setCellValues`-stap om getypeerde
bronwaarden naar de kladwerkmap te kopiëren. Daardoor blijven alle foutwaarden
behouden, net als tekst, getallen, booleans en lege cellen. De echte werkmap
wordt alleen gelezen; wijzigingen gebeuren uitsluitend in de tijdelijke
werkmap, die na gebruik wordt vrijgegeven.

## Controle

Twaalf tests gebruiken echte `@betteroffice/xlsx`-werkmaphandles en de echte
functie `voorbeeldResultaat`. Alleen het ophalen van het lege sjabloon is
vervangen door lezen uit het lokale, meegeleverde XLSX-bestand.

- Zeven foutwaarden (`#NULL!`, `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`,
  `#NUM!`, `#N/A`) blijven foutwaarden in `A1+1`; `IFERROR` vangt ze correct af.
- Een foutwaarde van een ander blad blijft behouden.
- Getallen, booleans, tekst die met `=` begint en lege cellen houden hun type.
- Versie en Undo/Redo-geschiedenis van de bronwerkmap blijven ongewijzigd.

Op de oorspronkelijke code falen zeven van deze twaalf tests; met de fix
slagen ze alle twaalf. Samen met de bestaande functietests slagen 21 tests.
De volledige suite slaagt: 176 bestanden, 1.999 tests geslaagd en tien
bestaande corpusoverslagen. TypeScript en Vite-productiebouw slagen.

```text
node node_modules/vitest/vitest.mjs run src/lint/rekenblad-formulevoorbeeld.test.ts src/lint/rekenblad-functies.test.ts --maxWorkers 2
node node_modules/vitest/vitest.mjs run --maxWorkers 2
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/issue59-build
```

De vastgezette dependencies zijn gebruikt via een lokale node_modules-junction
naar een bestaande installatie. De directe Vite-build voert geen nieuwe
voorbereiding van lettertype-/spellingcaches uit. De browserdialoog en native
Windows-installer zijn niet apart getest. Dit is een afgebakende verbetering
van het functievoorbeeld; de overige criteria van #59 blijven open.
