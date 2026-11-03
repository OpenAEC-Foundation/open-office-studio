# Profiel van rijk plakken in Writer 45.23

Een afzonderlijke native Linux/WebKit-proef profileert de zevende echte
kopieer-/plakronde van de eigen voorbeeldkopie. De hoofdthread en documentworker
worden apart gemeten. De bestaande controles op broninhoud, tabellen, celverhalen,
bewaren, verwerpen en een nieuw document blijven actief. De stapelvolgorde is
met drie geneste functies gekalibreerd.

## Aanwijzing voor de volgende productcorrectie

Het hoofdthreadprofiel bevat 16.001 samples; de documentworker 10.935.
De hoofdthread zit voor een groot deel in de bestaande Rust/Wasm-invoegroute:

| Functie in de hoofdthreadstack | Samples met die functie |
| --- | --- |
| `wasm-stub` | 12.921 |
| `split_paragraph` | 5.917 |
| `insert_text` | 3.062 |
| `insert_table_fragment` | 940 |
| `apply_raw_ops` | 934 |

Dit zijn inclusieve tijdsamples, geen aanroeptellingen. Ze overlappen en mogen
niet bij elkaar worden opgeteld; de worker werkt bovendien tegelijk met de
hoofdthread. De gemeten ronde vraagt 17.492 ms, maar de profiler beïnvloedt de
uitvoering. Dit is geen nieuwe snelheidsbenchmark of vergelijking met 45.22.

De in deze binary geladen bron koppelt de grote invoegstack aan
`applyClipboardFragment`: die loopt de klembordalinea’s af, splitst elke volgende
alinea en voegt daarna tabellen en tekst in. De al eerder gebundelde plakopmaak
is een afzonderlijke fase. Minder UI-renders alleen is daarom geen afdoende
oplossing voor deze grote-plakvertraging. Het bundelen van structurele invoegingen
in de Rust-kern moet worden onderzocht met behoud van alinea-identiteiten,
geërfde opmaak, tabelverhalen, revisies, invoervolgorde en één correcte undo-stap.
Er is nog geen nieuwe invoegimplementatie of prestatiewinst geaccepteerd.

## Bron- en levensduurcontrole

Alle zeven rondes slagen: 65 pagina’s, 128 tabellen, 897 bodyalinea’s en 768
cellen. De onafhankelijke DOCX-controle behoudt de inhoud en gecontroleerde
opmaak. Bewaren na ronde één, verder bewerken, Niet opslaan en het nieuwe
document slagen; GUI- en consolefouten zijn leeg. Verwerpen vraagt 508 ms.

Een eerste profieladapter verloor bij de aparte processtart zijn profiler;
een tweede adapter gebruikte een onjuiste WebSocket-eigenschap. Die opzetfouten
zijn bewaard en tellen niet als productmetingen. De derde adapter legde het
profiel vast, maar liet de workerinspectie aanstaan. Het nieuwe document bleef
daarna laden. Het officiële [WebKit-workerprotocol](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Worker.json)
vereist initialisatie voordat een geïnspecteerde worker mag uitvoeren. De
meetadapter hervatte later aangemaakte workers niet. Dit was dus geen geldige toets van de gewone
productroute na sluiten.

De gecorrigeerde adapter schakelt de workerinspectie na het profiel uit. Het
bevestigde protocolantwoord en de vervolgens geslaagde volledige proef worden
vastgelegd. De eerdere afkeuring wordt niet als productherstel gepresenteerd;
de meetopstelling is gecorrigeerd. De echte geheugenafkeuring uit de aparte
CI-route blijft onverminderd open.

## Console behouden bij een late afkeuring

De publieke plakproef bewaart nu ook de al ontvangen consoleberichten wanneer
een latere controle faalt. De inspectieverbinding is dan al gesloten; er wordt
geen nieuwe opdracht na de fout uitgevoerd. Een gerichte eigen GUI-proef met
twee echte plakrondes brengt bewust een herkenbare consolemelding en een late
afkeuring aan. De oorspronkelijke afkeuring blijft staan en de melding komt
in het rapport. Dit is een geslaagde rapportageproef, geen productafkeuring of
functieacceptatie. Alle 56 Python-tests slagen opnieuw.

De [gegevens](2026-11-03-writer-plakprofiel.json) bewaren de scripts, geladen
bundels en rapporten op checksum, de profileringssamenvatting en de gerichte
rapportagecontrole. Ruwe samples blijven lokaal voor verder onderzoek; ze
worden niet als bewijs van algemene vloeiendheid of volledige migratie gebruikt.
