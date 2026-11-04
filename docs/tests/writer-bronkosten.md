# Writer: kosten van de bevestigde bron

Een eigen bronaanvraag uit de echte 45.39-GUI is rechtstreeks nagespeeld in
een geoptimaliseerde Rust-meetutility. De bron bevat 5.997.678 bytes. Beide
ronden controleren de bronhash, de geïmporteerde vector en bij iedere
volgende bewerking de bytegelijke overname van de voorgestelde update.
De vastgelegde bron betreft uitsluitend de eigen openbare testkopie.

| Mediaan | Eerste ronde | Tweede ronde |
| --- | ---: | ---: |
| SHA-256 | 3,818 ms | 3,770 ms |
| SHA-256 met hex-uitvoer | 3,821 ms | 3,864 ms |
| Hele bron serialiseren | 37,987 ms | 38,418 ms |
| Warme voorbereiding, na eerste import | 67 ms | 65 ms |

Elke losse primitief wordt twintigmaal gemeten. De warme voorbereiding
gebruikt negentien vervolgbewerkingen; de eerste koude import telt daarbij
niet mee. Deze afzonderlijke metingen vormen geen exclusieve verdeling van
de volledige voorbereidingsduur. Ze bevatten geen renderer, IPC of GUI-FPS.

Het opnieuw serialiseren van de hele bron is hier duidelijk duurder dan
één hash. Alleen dubbele hashes verwijderen is daarom niet de belangrijkste
volgende stap. Onderzoek een begrensd journaal van bevestigde updates met
periodieke checkpoints, zodat een bytegelijk bevestigd voorstel niet telkens
een nieuwe volledige serialisatie nodig heeft. Bewaar daarbij de volledige
bron, strikte bronbinding, afhankelijkheids-/vectorcontrole en een afzonderlijk
onbevestigd voorstel. Een vector alleen mag nooit een andere inhoud bevestigen.
Een dergelijke productwijziging is in deze meetstap nog niet gemaakt.

De [meetgegevens, bron en hashes](2026-11-04-writer-bronkosten.json) bewaren de
exacte aanvraag, twee resultaten en de meetcode-identiteit. De utility staat
in `native/crates/office-writer-plakken/examples/meet_bronkosten.rs`. Ze leest
een eigen volledige schema-2-aanvraag en schrijft het meetrapport naar stdout.
De releasebouw en gerichte Clippy inclusief alle targets slagen.

## Afzonderlijke Windows-afkeuring

De [brede desktopronde van 45.39](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41880966994)
slaagt op Linux en macOS, maar faalt op Windows vóór de appbouw. Eén test,
`model > getalnotatie en tabgescheiden plakken`, overschrijdt de bestaande
vijfsecondenlimiet. Het oorspronkelijke taaklog blijft bewaard. Er is uit
deze afkeuring geen Windows-appbinary: die bouwstap is niet bereikt.

De test gebruikt kleine synchrone modelbewerkingen en bestaande gecachete
getalopmaak. De oorzaak is nog niet bewezen. De limiet en assertions zijn
behouden; een volgende groene uitvoering bewijst op zichzelf geen herstel.
De gecontroleerde Linux-devdownload staat [apart beschikbaar](../gebruik/ontwikkelbuild-linux.md).
Deze stap sluit geen issue of migratievlag en bewijst geen volledige suite-
of Rust-interfaceacceptatie.

De [afgesloten hertest op d3455b1](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41882225371)
slaagt op Linux, Windows en macOS. Ten opzichte van de afgekeurde bron is
uitsluitend de geheugenworkflow gewijzigd; de applicatie- en frontendcode
zijn gelijk. De oorspronkelijke oorzaak blijft daarom open. Het volledige
CI-resultaat is aan de bewijsbestanden toegevoegd; deze hertest is geen bewijs
van een gerichte reparatie van de time-out.
