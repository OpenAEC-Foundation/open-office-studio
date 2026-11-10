# Draaitabellen — issue #69

## Gedrag

Het lint Gegevens opent een eigen draaitabelvenster. Een bronbereik met koppen of een gestructureerde tabel kan naar een nieuw blad of een leeg gebied op een bestaand blad worden samengevat. Bronvelden kunnen naar Rijen, Kolommen, Waarden en Filters worden gesleept; veldkeuze met knoppen biedt dezelfde bediening zonder slepen. Ongegroepeerde velden verplaatsen tussen assen, terwijl afzonderlijke datumgroepen naast elkaar kunnen blijven staan.

Het model ondersteunt som, aantal niet-lege waarden, gemiddelde, minimum en maximum; normale waarden en percentages van eind-, rij- en kolomtotaal; jaren, kwartalen, maanden en getalintervallen. Leden kunnen worden geselecteerd of uitgesloten en elke as kan oplopend of aflopend worden gesorteerd. Vernieuwen leest de huidige bronwaarden opnieuw; een gestructureerde tabelbron volgt tabelgroei. Oude totaal-/kopopmaak wordt bij een nieuwe indeling verwijderd voordat de nieuwe opmaak wordt toegepast.

De uitvoer bevat echte standaardonderdelen: pivotTableDefinition, pivotCacheDefinition, pivotCacheRecords, werkmap-cacheregistratie, relaties en inhoudstypen. De zichtbare werkbladcellen bevatten actuele resultaten. Een eigen extensie onthoudt de bewerkbare veldindeling. Geïmporteerde draaitabellen zonder deze extensie behouden hun oorspronkelijke onderdelen en gecachte resultaten; het venster toont daarvoor uitsluitend hun naam, bereik en de beperking dat de indeling nog niet bewerkbaar is.

Wijzigingen gebeuren op een tijdelijke werkmap; bronoverlap, bezette uitvoercellen, samengevoegde uitvoercellen, dubbele namen en beveiligde bestemmingen worden geweigerd. Een versiecontrole voorkomt dat een verouderd venster nieuwere werkmapbewerkingen overschrijft. Aanmaken/vernieuwen vervangt het document en wist eerdere Undo-stappen; de bediening vermeldt dit. De bestaande structurele kernbeveiliging blijft actief: rij-/kolombewerkingen die pivotreferenties verplaatsen kunnen worden geweigerd. Er is geen nieuwe native patch of vendorpin voor #69.

## Gerichte verificatie

- `draaitabelRekenen.test.ts`: 9 proeven voor typen, foutwaarden, aggregaties, gewogen totalen, percentages, ledenfilters, sorteervolgorde, beide datumstelsels, intervallen en ongeldige/te grote indelingen.
- `draaitabellen.test.ts`: 9 echte-WASM-proeven voor standaardonderdelen, vernieuwen, groeperingen, atomaire weigeringen, nieuwe/bestaande bladen, tabelgroei, behoud van geïmporteerde onderdelen, metadata bij geweigerde structurele bewerkingen en opmaak na gewijzigde geometrie.
- `scripts/test-rekenblad-draaitabel-gui.mjs`: zes productie-browserstappen voor slepen, vernieuwen na bronwijziging, ledenfiltering en sorteren, datum-/percentagelayout met paginafilter, heropenen met bewerkbare indeling en behoud van een geïmporteerde draaitabel. Laatste run gebruikt het XLSX-bestand uit de onafhankelijke ODS-rondgang als import; alle pivot-/cacheonderdelen blijven tekstueel gelijk, zonder JavaScript-fouten.
- `scripts/test-rekenblad-draaitabel-libre.py`: acht onafhankelijke Calc/UNO-controles: basistabel, ODS-rondgang, jaar+maand met percentages, meerdere waarden, minimum, maximum, numerieke intervallen en paginafilter met kwartaal. Controleert echte DataPilotTables en opnieuw berekende waarden na bronwijziging. Het percentage-detail verandert eveneens; alleen een eindtotaal van 100% controleren zou onvoldoende bewijs zijn.
- Alle XML/relatieonderdelen van zeven fixtures zijn strikt geparseerd; openpyxl leest hun pivot-, cache- en recordmodellen. TypeScript, vertaalcontrole en productiebuild slagen. De 23 bestaande waarschuwingen voor inactieve taalmappen blijven bestaan.

Reproduceer de fixtures met `OOS_PIVOT_EVIDENCE=1` en de twee gerichte Vitest-bestanden. De browserproef gebruikt `.local/dist-pivot` en schrijft naar `.local/proef-draaitabel-gui`. De onafhankelijke proef vereist een eigen UNO-Python en `OPENAEC_CONVERSIE_PROGRAMMA`; zij gebruikt uitsluitend een tijdelijk profiel via `libreoffice_test_hulp.py`. Lokaal bewijs staat in `.local/tests-pivot-table-v7.log`, `.local/gui-pivot-v10.log`, `.local/libre-pivot-v6.log`, `.local/schema-pivot-v10.log` en de overeenkomstige rapportmappen. Dit is geen desktopinstaller-/Windows-eindacceptatie van de gecombineerde kandidaat.

## Begrenzingen

Bronnen zijn begrensd op 500.000 gegevenscellen en de uitvoer op 100.000 cellen. De ledenlijst toont maximaal 200 zoekresultaten tegelijk, met behoud van overige selecties. Bestaande geïmporteerde indelingen worden bewaard; generieke bewerking/vernieuwing van onbekende layouts is niet geïmplementeerd.

Calc 26.8.2.2 leest vier verschillende waardeberekeningen op dezelfde bronkolom onjuist in. De eigen vierfunctieberekening en standaarddataFields zijn correct; hetzelfde verlies is onafhankelijk gereproduceerd door vier functies via UNO in Calc te zetten, Calc zelf XLSX te laten schrijven en dat bestand opnieuw in Calc te openen. Bewijs: `.local/libre-multiple-native.log` en `multiple-native-fixed.xlsx`. De positieve interoperabiliteitsproef gebruikt twee berekeningen op dezelfde kolom en verifieert minimum/maximum afzonderlijk. Dit is een vastgelegde lezerbeperking, geen geslaagde vierfuncties-rondgang. Er is hiervoor geen nieuwe issue aangemaakt.

De ODS-controle bewijst de onafhankelijke conversie/rondgang en het behoud van die geconverteerde draaitabel in de browser. De desktopdialoog die een oorspronkelijk ODS-bestand opent moet nog in de centrale Windows-acceptatie worden bediend.

## Integratiebasis en platformcontrole

De eigen featurebranch bevat de vastgelegde integratiebasis `e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a` via merge `5f44f9e7`; er waren geen samenvoegconflicten. Op de gecombineerde bron slagen TypeScript, 47 gerichte echte-WASM/model-/renderproeven in zeven bestanden, de productiebuild, de vertaalcontrole en alle zes browserstappen inclusief de uit ODS afkomstige draaitabel. De vendorhash blijft `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa`.

De bestaande PR-workflow `Kantooromgeving controleren en bouwen` test en bouwt hetzelfde exacte PR-codepunt op Windows, Linux en macOS, inclusief pakketcontroles. De afzonderlijke databaseworkflow gebruikt eveneens die drie runners. De actuele uitslagen horen bij het exacte PR-hoofd en worden bij de overdracht vermeld; een niet afgeronde of ontbrekende controle geldt niet als geslaagd.

| Platform | Beschikbare functiecontrole | Nog afzonderlijk te controleren |
| --- | --- | --- |
| Windows | Lokale WASM-/modeltests, Chromium-productiebrowser en onafhankelijke Calc/UNO-rondgang; PR-CI voor volledige tests en pakketbouw | Native draaitabelvenster in de daadwerkelijk gebouwde desktopapp, inclusief oorspronkelijk ODS openen |
| Linux | PR-CI voor volledige functionele tests en pakketbouw | Native draaitabelbediening op een Linux-testhost |
| macOS | PR-CI voor volledige functionele tests en pakketbouw | Native draaitabelbediening op een Mac-testhost |
| Browser | Zes geslaagde Chromium-stappen tegen de productie-preview, inclusief standaard-XLSX en geconverteerde ODS-draaitabel | Oorspronkelijk ODS openen via een desktopconverter is geen browserfunctie |

Geen wijziging aan de centrale kandidaat, desktopinstallatie, `main` of bestaande issuestatussen. De draaitabelbranch blijft afzonderlijk voor beoordeling na de huidige freeze.
