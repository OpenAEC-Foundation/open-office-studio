# Liniaal en invoer in lange documenten

Wanneer de indeling de huidige cursorpagina nog niet kent, zocht de liniaal
langs alle paginaboxen. De eigen verticale paginakolom gebruikt nu dezelfde
binaire zichtbaarheidzoektocht als de andere overlays. Alleen de relevante
boxen worden gemeten. Onbekende hosts behouden de algemene route. Metingen
worden niet tussen aanroepen bewaard.

De bestaande keuze accepteert ook fractionele negatieve overlap van minder
dan één pixel. De zoekmarge behoudt dit gedrag. Vier regressieproeven vergelijken
onder meer 5.000 pagina’s, verschillende hoogtes/zoom, gaten, grenzen, scrollen
en een onbekende fysieke volgorde. De oude route faalt met 5.000 metingen; de
nieuwe route kiest dezelfde pagina met minder dan 40 metingen.

De native proef gebruikt een nieuw gegenereerde DOCX met 500 pagina’s, een eigen
Linux-scherm en een leeg profiel. Na positioneren van de begincursor bedient zij
echte toetsen: typen op pagina 500, selectie/Backspace, undo/redo en Ctrl+S.
Alle 500 alinea’s worden exact vergeleken, onafhankelijk uit de bewaarde ZIP/XML
gelezen en in een nieuw proces heropend. Beide versies slagen op acht controles.
De normale compositor blijft ingeschakeld. Alleen een lichte teller om
`getBoundingClientRect` meet de schermlezingen.

| Opeenvolgende ronde | 45.11 metingen | 45.12 metingen | 45.11 invoerduur | 45.12 invoerduur |
| --- | ---: | ---: | ---: | ---: |
| Eerste | 36.216 | 18.670 | 4,341 s | 4,188 s |
| Definitieve scriptbytes | 35.376 | 18.888 | 5,045 s | 4,084 s |

Elke ronde gebruikt identieke scriptbytes en dezelfde bron voor beide versies.
Tussen de rondes zijn uitsluitend afsluitende lege scriptregels verwijderd.
De meting omvat veertien ingevoerde tekens met 20 ms toetsinterval, afhandeling
en bron-/golflijngereedheid. De teller loopt daarna nog twee seconden door;
de gerapporteerde invoerduur en frame-intervallen stoppen vóór die nawacht.
De volledige frontendronde slaagt op **1.587 tests in 141 bestanden**; TypeScript,
productiebouw en native Linux-bouw slagen ook.

**De app is hiermee nog niet voldoende soepel.** In de eerste ronde verslechtert
de p95-framepauze van 199 naar 284 ms; in de tweede daalt zij van 285 naar
277 ms. Dit is geen overtuigend bewijs voor algemeen betere frameprestaties.
De resterende circa vier seconden voor deze korte invoer en de grote hoeveelheid
canvasmetingen moeten verder worden onderzocht. Twee rondes op één bron/computer
zijn geen algemene benchmark of goedkeuring voor enorme plakdocumenten.

De [meetgegevens](2026-11-03-writer-liniaal.json) bewaren beide volledige rondes,
programma-/script-/bronhashes, alle controles en frame-intervallen. Twee
ongewijzigde native clientbeelden tonen de laatste pagina
[vóór](2026-11-03-writer-liniaal-voor.png) en [na](2026-11-03-writer-liniaal-na.png).
Fysieke IME, andere platforms, willekeurige documenten en de volledige
Rust-/pixelmigratie blijven open.

```sh
python3 scripts/test-writer-lang-native.py --programma src-tauri/target/release/open-office-studio --versie 2026.45.12 --uitvoer /tmp/office-langdocumentproef
```

De Linux-desktop- en uitgaveworkflows voeren deze proef uit en bewaren haar
verslag, screenshot en DOCX. Tijdmetingen hebben daar geen afkeurgrens:
verschillende CI-computers vormen geen vergelijkbare prestatiebenchmark.
