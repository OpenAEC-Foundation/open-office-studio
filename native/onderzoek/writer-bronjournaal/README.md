# Afzonderlijke Writer-bronjournaalproef

Deze Rust-proef is niet aangesloten op de desktopapp. Zij onderzoekt of gewone
tekstinvoer een bevestigde bron als beginbestand plus delta’s kan bewaren, zodat
niet na iedere invoergroep opnieuw de volledige bron wordt geserialiseerd.

`journaal.rs` bevat de proef; `proef.rs` speelt de 21 werkelijk opgenomen aanvragen
van de openbare Writer-proefkopie af. Inhoudelijke antwoorden en de volledige
gecodeerde eindbron worden met de bestaande desktoproute vergeleken. Daarnaast
controleert de proef zestien fout-, grens- en herstelgevallen. De bewijsbestanden
staan in [het verslag](../../../docs/tests/2026-11-11-writer-bronjournaal.json).

De proef gebruikt expliciet **onderzoeksschema 3**. Zijn basis-token is een
SHA-256-keten over de bevestigde bytes; het is geen hash van een telkens opnieuw
gecodeerde volledige bron. Schema en token zijn daarom uitgezonderd van de
antwoordvergelijking, evenals de meettijd. Bestaand schema 2 blijft ongewijzigd.
Een bronvector alleen geldt nooit als inhoudelijke bevestiging.

Een voorgestelde bewerking wordt pas bevestigd wanneer exact die deltabytes
terugkomen bij dezelfde bronbinding, hetzelfde document en dezelfde client.
Bij een andere geldige delta wordt de bron opnieuw opgebouwd uit het bevestigde
journaal. Een mislukte bewerking vervangt de bevestigde bron niet. De proef
begrenst zowel opgeslagen bytes als het aantal stappen. Dit bewijst nog geen
grens voor de volledige native heap.

Voorbereiden zonder productbestanden te wijzigen:

```sh
python3 native/onderzoek/writer-bronjournaal/voorbereiden.py --uitvoer /absoluut/nieuw/proefpad
```

Dit weigert afwijkende vendorpinnen en bestaande uitvoer. Alleen in de nieuwe
kopie worden twee onderzoeksfuncties geëxporteerd: de bestaande fragmentbewerking
en import zonder identiteitsreparatie. De uitgevoerde bouw gebruikte `rustc` met
vastgelegde bestaande desktopafhankelijkheden; opdrachten en artefacthashes staan
in het bewijsarchief. Er is geen algemeen installatie- of desktopbouwscript.

De losse ABBA-proef meet ongeveer 72/18/19/73 ms als mediane tijd van de twintig
vervolggroepen. Dit is geen snelheidstest van de app: de proefprogramma’s hebben
verschillende extra controles en de deserialisatie ligt niet op exact hetzelfde
meetpunt. Undo/Redo, revisies, Unicode/IME, langdurig geheugengebruik, de GUI en de
platformvarianten moeten nog worden getoetst vóór mogelijke productintegratie.
