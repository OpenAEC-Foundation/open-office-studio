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

## Werkelijke grote bronbytes

`grote_bron.rs` maakt uitsluitend eigen synthetische bronnen: één kleine
alinea en een opaque binaire metadatabuffer van 63, 65, 99 of 101 MiB. De
gecodeerde CRDT-bron bevat aantoonbaar de volledige buffer. Er worden geen
gebruikersdocumenten geopend of bestanden met deze grote buffers geschreven.

63 MiB past in het journaal. Voor 65 en 99 MiB wordt expliciet een nieuwe,
ongewijzigde schema-2-spiegel met de volledige bron aangeroepen. De delta en
cursor worden vergeleken met de fragmentbewerking; een onafhankelijke import
van bron plus antwoord geeft de volledige bytegelijke bron, inclusief metadata.
Beide routes weigeren de 101-MiB-buffer boven de bestaande transportlimiet.

De tweede parameter is een begrensd aantal vervolgbewerkingen, alleen bij
63 MiB, maximaal 1.028. De proef wisselt gewone tekst en emoji af, controleert
iedere delta en UTF-16-cursor en vergelijkt de volledige bron iedere 64 stappen
en aan het einde. Bij 1.028 vervolgen worden vier volledige bronherstarts en
zeventien volledige bronvergelijkingen bereikt. De 256-stappengrens blijft
ongewijzigd. Op vaste meetpunten worden opgeslagen bytes en proces-RSS gemeld.

De vastgelegde uitvoerder start elke proef in een eigen proces met maximaal
3 GiB adresruimte, 120 seconden looptijd en een bewakingsgrens van 1,5 GiB
bemonsterde RSS. Ook beschikbaar systeemgeheugen en vrije schijfruimte worden
bewaakt. `/usr/bin/time` geeft daarnaast de maximale proces-RSS. Dit omvat
fixture, orakel en onafhankelijke kopieën; het is geen gemeten appgeheugen of
algemene heapgarantie. De 1.028-groepenreeks duurt enkele seconden, geen uren.
Veel tekstpagina’s, rijke tabellen, GUI-invoer en langdurige lekproeven blijven
apart nodig. Zie [uitvoering, bronhashes en grenzen](../../../docs/tests/2026-11-11-writer-grote-bron.json).

## Afzonderlijk adaptercontract

`adapter.rs` is een per-documentcontract voor een toekomstige opt-in route,
nog zonder Tauri-handler, frontend of productvoorraad. Aanmaken vereist expliciet
`ingeschakeld = true`. De host moet eigenaar en documentidentiteit zelf binden,
en bij heropenen een nieuwe, nooit hergebruikte levensduur leveren; deze velden
mogen niet blind uit een WebView-aanvraag worden vertrouwd. De adapter moet op
de documentwerker worden aangemaakt, gebruikt en vernietigd.

Schema 1 en 2 blijven buiten deze adapter. Een aanvaarde schema-3-opdracht heeft
een opeenvolgend volgnummer; ook een kernfout of bronverzoek verbruikt dat nummer.
Een verkeerd venster/document, oude levensduur, herhaalde of overgeslagen opdracht
wordt geweigerd. `vergeet` maakt de adapter ongeldig en ruimt het journaal op.
Een nieuw document krijgt een nieuwe adapter, geen stille heropening.

Alle geslaagde antwoordsoorten herhalen de bestaande bron-/opdrachtvelden plus
`levensduur` en `volgnummer`. `route = gereed` bevat de delta; `volledigeBron`
bevat uitsluitend `retryFull = true`; `bestaandeRoute` bevat uitsluitend een
capaciteitsadvies met `fallbackSchema = 2` en `requiresFull = true`. Dat advies
bevat geen delta, bron-token of algemene retry. Ongeldige aanvragen blijven
fouten. Deze adapter voert zelf geen schema-2-fallback uit: dat moet expliciet
met de volledige actuele bron en onafhankelijke validatie gebeuren.

`antwoord_actueel` controleert uitsluitend de levensduur. Een toekomstige
frontend moet daarnaast de oorspronkelijke bronversie, opdracht, sessie en
selectie toetsen vóór toepassen, en resultaten in invoervolgorde verwerken.
Dit is nog geen implementatie of bewijs van die frontendcontroles, een
begrensde wachtrij, globale cache of selectie-/sluitgedrag in de app.

`adapterproef.rs` bevat negen Rust-tests: expliciete inschakeling, binding,
volgorde en fouttoelating, beide bronverzoeken, vergeten/heropenen, twee eigen
werkerthreads, scheiding van oudere protocollen en alle 25 inhoudelijke
antwoorden van de werkelijk opgenomen geschiedenisreeks. De twee bewuste
weglatingen van levensduurbewaking en corruptie-afkeur laten hun gerichte proef
falen. [Exact bewijs en resterende integratie](../../../docs/tests/2026-11-11-writer-adapter.json).

## Begrensde documentwerker

`werker.rs` voert de onderzoeksadapter uit op een eigen Rust-thread met precies
één wachtende kanaalopdracht. De adapter en haar EditingDocs worden op die thread
aangemaakt, gebruikt en vernietigd. Alleen aanvragen/antwoorden en atomaire
boekhouding gaan over de threadgrens. `stuur` kan op een volle wachtrij wachten
en mag daarom uitsluitend buiten de UI worden aangeroepen. Aanroepen voor
hetzelfde document moeten vooraf in invoervolgorde staan; deze werker herschikt
geen verkeerd aangeboden opdrachten.

`vergeet` trekt alle gekloonde handles in en wekt een idle werker zonder te wachten
op een volle wachtrij. Een lopende kernbewerking wordt niet hard onderbroken;
haar antwoord wordt achteraf geweigerd. Ook al verzonden, nog niet overgenomen
antwoorden worden bij `ontvang` opnieuw tegen intrekking gecontroleerd. Bij
intrekking worden geblokkeerde zenders vrijgegeven zodra de lopende bewerking
eindigt en de ontvanger opruimt. Een verdwenen antwoordontvanger blokkeert de
volgende opdracht niet. Het laatste handle laten vallen sluit eveneens af.
Een onverwacht gestopte werker levert `Gestopt`, geen normaal `Verouderd`.

De byteboekhouding blijft de nog levende kern meetellen tot opruiming op de
werker. Zij omvat opgeslagen bron-/voorstelbytes, niet alle heap, geblokkeerde
producenten of transportpayloads. Dit is nog geen globale geheugenbegrenzing of
productvoorraad. Een toekomstige voorraad moet bij verwijderen expliciet
`vergeet` aanroepen, ook wanneer lopende aanvragers nog een handle hebben.

`werkerproef.rs` bevat elf tests met eigen gecontroleerde wachtpoorten, waaronder
één wachtende opdracht, geblokkeerde zender bij intrekking, een al verzonden echt
antwoord, intrekking tussen voorstel en antwoord, verdwenen aanvrager, laatste
handle, opzettelijke threadpanic, onafhankelijk tweede document en alle 25 echte
geschiedenisaanvragen. Opruiming wordt pas gemeld na het vernietigen van de kern.
De negen adaptertests slagen opnieuw. Twee bewuste mutanten (twee kanaalplaatsen
of geen late antwoordcontrole) worden afgekeurd. Een aparte gewone bouw zonder
`cfg(test)` voert ook een echte tekstbewerking uit; de wacht-/paniekhooks zijn
uitsluitend aanwezig in de testbouw.

Geen Tauri-/productvoorraad-/frontendintegratie, evictie, GUI, appversnelling of
platformacceptatie. Zie [werkerbewijs en resterende aansluiting](../../../docs/tests/2026-11-11-writer-werker.json).

## Begrensde voorraad van onderzoekskoppelingen

`voorraad.rs` beheert expliciet geopende werkerkoppelingen per host-eigenaar en
document. Een procesbrede teller geeft iedere opening een nieuwe levensduur,
ook bij een nieuwe voorraad. Een dubbel geopende koppeling wordt geweigerd.
Een volle voorraad geeft `Capaciteit`; zij verdringt niet stilzwijgend een ander
document. De host moet sluiten of verdringen expliciet via `vergeet` uitvoeren.
Er is geen LRU-beleid of automatische heropening. Dit is een voorraad van
werkerleases, geen registratie of sluitactie van de gebruikersdocumenttabs.

Verwijderen trekt de werker in. Een verwijderde maar nog levende werker blijft
meetellen in de werkerlimiet én bron-/voorstelboekhouding. Het aparte atomaire
`afgerond` wordt pas gezet nadat de kern op haar eigen thread is vernietigd.
Een nieuwe koppeling wordt geweigerd zolang die capaciteit niet is vrijgekomen.
Een oud sluitbericht of laat afgeronde opdracht kan een nieuwe koppeling met
dezelfde namen niet verwijderen, overschrijven of opnieuw registreren.
Venstersluiting trekt uitsluitend de eigen koppelingen in.

Het globale voorraadslot is vrij tijdens `stuur`/`ontvang`. De bytegrens is een
retentiecontrole **na** voorbereiding. Bij overschrijding wordt het huidige
voorstel geweigerd, de koppeling ingetrokken en `Capaciteit` teruggegeven; er
wordt niets toegepast of automatisch herhaald. Dit is geen harde piek-/heapgrens:
ook gelijktijdige voorbereidingen, transportpayloads en producenten buiten het
kanaal vallen nog buiten die garantie.

De toekomstige frontend mag een ingetrokken lease niet blind heropenen: zij
moet eerst de actuele documentsessie/bron/selectie controleren, dan expliciet
een nieuwe hostbinding en volledige bron aanbieden, of expliciet de bestaande
schema-2-route met onafhankelijke bronvalidatie kiezen. Het aantal en de retentie
aan schema-3-koppelingen mogen de bestaande 100-MiB-route niet vervangen of
beperken. De echte desktopfallback en dat herbindingsgesprek zijn nog niet
geïmplementeerd of geaccepteerd.

`voorraadproef.rs` bevat tien tests, inclusief gecontroleerde intrekking na
voorstel, wachten zonder globaal slot, oude afronding na heropenen, byte-/slot-
capaciteit, hostisolatie, venstersluiting, nieuwe levensduur over voorraden en
alle 25 echte geschiedenisaanvragen. Elf werker- en negen adaptertests slagen
opnieuw. Twee mutanten, zonder meetellen van verlaten werkers en zonder
generatiecontrole bij afronding, worden afgekeurd. De gewone niet-testbouw
bewerkt tekst en wacht op de werkelijke asynchrone opruiming.

Zie [voorraadbewijs en resterende productkoppeling](../../../docs/tests/2026-11-11-writer-voorraad.json).
De volgende integratiestap is de geteste kern/adapter/werker/voorraad achter een
expliciete Rust-feature in de echte desktoplaag onderbrengen, met veilige
vendor-API's, standaard schema 2 behouden, daarna frontendprotocol en echte GUI.

## Port naar de echte Writer-crate

De geteste kern, adapter, werker en voorraad staan nu ook in
`native/crates/office-writer-plakken/src/bronjournaal`. De expliciete Cargo-feature
`writer-bronjournaal` is standaard uitgeschakeld en wordt door `src-tauri`
doorgegeven. Zonder die feature bestaat de publieke module niet. Inschakelen
bouwt de Rust-API; het schakelt nog geen Tauri-opdracht of frontendprotocol om.
Het is dus nog geen gebruikersoptie of nieuwe snellere desktopversie.

De vendorbron heeft twee permanente, eveneens featuregebonden replica-API's.
Er is voor deze port geen gekopieerde of tijdens uitvoeren gepatchte vendorbron
meer nodig. Bronimport behoudt expliciet de bestaande verbatim-identiteiten;
fragmentvoorbereiding gebruikt dezelfde interne implementatie en validatie.
De bevestigde bron blijft van de aanroeper; deze API's horen uitsluitend op de
afzonderlijke documentwerker thuis.

De port houdt algoritme en protocol van de proef aan. Alleen importpaden/API-namen
zijn aangepast, niet gebruikte onderzoekshulpen zijn test-only gemaakt en het
kanaal verstuurt de aanvraag in een Box om een grote enumvariant te vermijden.
De featuretests gebruiken een vastgelegde kopie van de echte 25-aanvragengeschiedenis
in de crate, zonder afhankelijkheid van lokale `.local`-paden. Een extra kernproef
gebruikt de twintig gewone invoergroepen vóór de vastgelegde geschiedenisdelta
en controleert ook zestien fout-/grens-/herstelgevallen en de volledige eindbron.

Gericht controleren met Cargo:

```sh
cargo test --manifest-path native/Cargo.toml -p office-writer-plakken --locked
cargo test --manifest-path native/Cargo.toml -p office-writer-plakken --features writer-bronjournaal --locked -- --test-threads=1
cargo clippy --manifest-path native/Cargo.toml -p office-writer-plakken --features writer-bronjournaal --locked --lib -- -D warnings
```

De lokale uitvoering gebruikte `rustc`/Clippy met vastgelegde bestaande
afhankelijkheidsbibliotheken en beide rechtstreeks uit de echte vendorbron
gebouwde varianten: 28 standaardtests en 59 featuretests slagen. Cargo's volledige
Linux-resolutie met `--locked` slaagt voor beide werkruimten; dit is geen volledige
Cargo-desktopbouw. De platformworkflow test de feature voortaan afzonderlijk.
Tauri-hostbinding, frontendlease/bronversie/selectie/volgorde, echte GUI-invoer,
bewaren/heropenen/verwerpen en fysieke snelheid blijven open.

De eerdere `voorbereiden.py` en `bron-pinnen.json` zijn historische proeven op
hun vastgezette bronrevisie. Zij weigeren de nu gewijzigde vendorbron bewust;
gebruik voor de port de bovenstaande echte crate, niet een versoepelde pincontrole.
Zie [port, concrete opdrachten en grenzen](../../../docs/tests/2026-11-11-writer-feature.json).
