# HYPERLINK: doeluitdrukkingen zonder werkboekwijziging

Vervolg op PR246 voor #75 en #3. De host leest het eerste HYPERLINK-argument met de bestaande, begrensde `readCells.formulaQueries`-API wanneer de geladen kern die ondersteunt. Oorsprong en doel zijn de echte formulecel, zodat lokale namen en ROW/COLUMN dezelfde context krijgen. De formule, celopmaak, opgeslagen bytes en Undo-geschiedenis blijven behouden.

Op de eerdere productiekern blijft de bestaande ondersteuning voor letterlijke adressen, enkele celverwijzingen en tekstconcatenatie beschikbaar. De specifieke afwijzing van het onbekende protocolveld wordt eenmaal per werkboek herkend. Een native budgetbeperking of berekeningsfout wordt niet als een geldige bestemming geopend. Een onoplosbare bestemming toont nu een vertaalde melding met de mogelijkheid een expliciete hyperlink te gebruiken.

## Werkelijke kernen en vaste verwachtingen

`scripts/test-rekenblad-koppeling-vragen.mjs` opent elke kern in een apart proces. De bron is synthetisch en bevat een globale en lokale naam met dezelfde identificator, vaste tekstwaarden en een onbekend onderdeel. Elf doeluitdrukkingen per kern hebben vooraf bepaalde verwachtingen, waaronder LOWER, samengestelde tekst, IF/ROW/COLUMN, de lokale naam, fouten en een rechtstreeks meercellig bereik. Elke lezing controleert ook ongewijzigde versie, geschiedenis, formule en byte-identieke opslag.

| Variant | SHA256 | Resultaat |
| --- | --- | --- |
| Huidige kern van deze branch | `3c6bcf0d11f3f66ce4410ae7ba5d55c042477949e9975f3977b4e421079781de` | 11 gevallen, bestaande beperkte terugval |
| Query-kern uit PR251 | `ad3d40536ad80eaebfa4a06dc2099885a485d850160e65e23f6306ba99abbe1e` | 11 gevallen, native doeluitdrukkingen en lokale namen |

De tweede binary is vastgezet op [commit 10b9ac1c](https://github.com/OpenAEC-Foundation/open-office-studio/tree/10b9ac1c7634da666498d21de3258dd3573ad397/vendor/rekenbladengine). CI controleert de volledige hash bij het downloaden. De bronbinary van de app wordt niet vervangen. Deze proeven meten API-compatibiliteit; de bestaande onafhankelijke formulematrix blijft afzonderlijk draaien.

## Productie-browserproeven

Dezelfde productiebuild is in twee verse browsers getest. De tweede proef serveert uitsluitend de vastgezette XLSX-WASM-binary via een lokale testoverride. Beide varianten slagen voor de vijftien bestaande stromen, inclusief werkelijke Ctrl+klik, bestandspaden, websites, interne navigatie, onbekende doel-functies, veilige URL-schema's, objectbewerkingen, scrollen, zoom en vastgezette cellen.

De query-variant gebruikt voor de interne bestemming daadwerkelijk IF/ROW en voor de website LOWER over een celverwijzing. De onbekende functie geeft de nieuwe melding; de formule blijft staan. Rapporten en screenshots worden in de Spreadsheet-CI bewaard. De volledige lokale testsuite, typecontrole, productiebuild en i18n-controle slagen; de JSON-bijlage bevat de getelde testresultaten.

## Grenzen en herhalen

Rechtstreekse meercellige bestemmingen blijven onopgelost. Volatiele uitdrukkingen zonder beschikbare klokcontext, onbekende functies en beperkte berekeningen leveren geen klikbare bestemming. Dit voltooit niet de brede object-, toegankelijkheids- en grote-werkboekcriteria van #75/#3/#74.

```text
pnpm exec vitest run --maxWorkers=4
pnpm exec tsc --noEmit
node scripts/test-rekenblad-koppeling-vragen.mjs
pnpm exec vite build --outDir .local/dist --logLevel error
node scripts/test-rekenblad-objecten-gui.mjs
```

Voor de tweede browserrun: `OOS_TEST_REKENBLAD_WASM=.local/formula-query-compat/query-engine.wasm` en `OFFICE_TEST_UIT=.local/proef-rekenblad-objecten-query-engine`. De productiecode verandert deze testvariabelen niet.
