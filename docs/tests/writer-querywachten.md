# Correcte querybinding is hier te langzaam

De lokale 45.46-proef is afgekeurd en exact teruggedraaid. De nieuwe
regressietest voert de echte rendererpublicatie uit. Zij faalt op de oude
resolver met timeout in plaats van ready en slaagt wanneer bronmetadata en
gereedheid op `snapshot.queries` worden gelezen. Alle 34 gerichte en 1.835
volledige tests en de productiebouw slagen. Dit bewijst correcte bronbinding,
maar geen bruikbare snelheid.

De vier fysieke ronden 43/46/46/43 tonen de volledige getypte alinea na
22.398 / 72.524 / 73.061 / 22.944 ms. Beide kandidaten leveren precies 56
ready-meldingen zonder timeout, annulering of ontbrekende bron. Alle 3.329
alinea-/celteksten en 1.537 verhalen blijven exact. De documentuitsnede van
820 × 740 pixels is in alle eindbeelden exact gelijk, afgezien van alleen
de vooraf bekende cursorzone. Het volledige venster en andere toestanden
zijn daarmee niet visueel geaccepteerd.

De kandidaat is gemiddeld 3,21 maal zo langzaam. De publicatie-/queryfase
vraagt in beide kandidaten ongeveer vijftig seconden opgeteld; zij bevat
ook `yt()` en is dus geen geïsoleerde layout- of CPU-meting. Wachten op iedere
brongebonden query is hier een verkeerde optimalisatie. De tien aanvullende
native scenario's zijn daarom niet als productacceptatie op deze kandidaat
gedraaid. De negatieve ELF blijft lokaal bewaard met SHA-256
`68564779708401d92a2f1b67b323db1ba9fe8a32603da733491e011798beac4b`.
[Exacte bronnen, rood/groen-regressie, logs en beelden](2026-11-05-writer-querywachten.json).

Een aparte tijdelijke runtimeproef op dezelfde behouden 45.43-binary geeft
één MessageChannel-taak vóór de bestaande native enqueue-callback. De vier
ronden geven 24.050 / 23.284 / 24.479 / 22.613 ms. Ook dat levert geen bewezen
winst op en is niet in de productcode opgenomen. Dit was geen nieuwe build.
[Afzonderlijke meetopzet, bron, counters en beelden](2026-11-05-writer-invoertaak.json).

De bruikbare appbron blijft 45.43. De ernstige invoervertraging en de aparte
Rust/Wasm-sluitafkeuring blijven open. Eerst werkelijk werk per bronwijziging
profileren; geen nieuwe volledige layoutbarrière of speculatieve cache zonder
versie-/bronbewaking toevoegen.
