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
meetpunt. De in dit eerste verslag nog openstaande geschiedenis- en grensproeven zijn
hieronder afzonderlijk uitgebreid. Dat geeft geen productintegratie of
platformacceptatie.


## Aanvullende controles van 11 november

`geschiedenis.rs` speelt de echte native reeks na van typen, Ctrl+Z, Ctrl+Y,
nogmaals Ctrl+Z en een nieuwe invoertak. Alle 25 antwoorden en de volledige bron
na iedere groep zijn gelijk; de afwijkende geschiedenisdelta dwingt één extra
herbouw af. De originele route en het journaal gebruiken hetzelfde opgenomen
invoerbestand. Een opname zonder afwijkende vervolgdeltareeks wordt expliciet
afgekeurd: alleen een gewone typereeks bewijst deze geschiedenisroute niet.

`unicode.rs` leidt twee native proeven af van die eigen reeks. Alleen de laatste
tekst wordt ` café, naïef — € 😀 漢字`; met `--revisie` krijgt zij ook een vaste,
fictieve revisieauteur. De bestaande Rust-route berekent de verwachte antwoorden.
Beide afleidingen geven 25 gelijke antwoorden en bronnen; de cursor moet in
UTF-16 tellen. Dit bewijst geen fysieke Unicode- of IME-invoer via de GUI.

De aparte GUI-revisieproef toont wel een wijziging, maar haar laatste tekst komt
niet bij `writer_tekst_voorbereiden` terecht. De vastgezette SDK selecteert deze
route alleen bij gewone ASCII-invoer buiten de suggestiemodus. Haar journaaltest
faalt terecht op de ontbrekende afwijkende vervolgdeltareeks. Deze opname is
bewaard als dekkingsgrens en telt niet als geslaagde journaal-revisie-GUItest.

`grenzen.rs` vergelijkt op een kleine eigen bron 257 aanvragen, met Unicode,
tegen de bestaande route. Daarna weigert de standaardlimiet van 256 bevestigde
vervolgstappen de volgende delta zonder bron of voorstel te verliezen. Een
volledige bronreset slaagt vervolgens exact. Dit is geen langdurige grote
native-heaptest.

Zie [het aanvullende bewijs](../../../docs/tests/2026-11-11-writer-geschiedenis.json).
Opslaan/heropenen/verwerpen met het geïntegreerde journaal, echte Unicode/IME,
revisie-aanvaarden en -verwerpen, lange sessies, heapgebruik, de nieuwe desktop-GUI
en alle platformen/edities blijven open. De bestaande app en schema 2 blijven
ongewijzigd.

## Getypeerde middelengrens

`bereid_getypeerd` onderscheidt `Ongeldig` van `BestaandeRouteNodig`, met
aparte redenen voor bron, bevestigd journaal en journaal plus voorstel.
`Ok(None)` blijft uitsluitend een verzoek om een volledige bronbinding (ook
bij de stapgrens). De bestaande `bereid`-hulpmethode behoudt haar oude
String-foutinterface voor de eerder vastgelegde proeven.

Transportvalidatie behoudt de bestaande grens van 100 MiB; het journaalbudget
blijft 64 MiB. Een passend verpakte bron boven het journaalbudget geeft alleen
een capaciteitsadvies, geen goedkeuring van het CRDT-document. Een toekomstige
adapter moet de volledige actuele bron via schema 2 opnieuw laten valideren,
zonder schema-3-token en zonder automatische herhaling van ongeldige aanvragen.
Er is nog geen desktopadapter aangesloten.

`middelen.rs` verlaagt de onderzoekscaps op de bestaande eigen aanvraagreeks en
bereikt alle drie capaciteitspaden. De bevestigde token blijft behouden; de
ongewijzigde schema-2-route geeft dezelfde delta en cursor. Na een volledige
reset geeft het journaal een bytegelijke volledige bron. Zes transport-/schema-
en bindingsfouten worden afzonderlijk afgekeurd; een onbekende vervolgbinding
vraagt volledige bron. Ook een beschadigd CRDT met correcte transporthash wordt
bij de onafhankelijke schema-2-validatie afgekeurd. Dit bewijst geen verwerking
van echte 64–100 MiB-documenten of grens voor de volledige native heap. Na een
fout tijdens voorbereiding wordt uitsluitend behoud van de bevestigde bron
gegarandeerd; een voorstel kan worden verlaten en vereist dan een herbouw.

Zie [middelentoelating en regressiebewijs](../../../docs/tests/2026-11-11-writer-middelen.json).
