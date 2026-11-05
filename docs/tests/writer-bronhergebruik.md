# Writer: echte invoer behoudt de voorstelbinding

De trage desktopcache wordt niet alsnog opgenomen. Een nieuwe, afzonderlijke
Linux-diagnose sluit een ontbrekende voorstelbinding in deze gewone invoerproef
uit: **69 van 69** vervolgaanvragen in de referentie en **75 van 75** in de
cachebinary bevatten exact het vorige voorstel, dezelfde basis, client en
documentbinding. Alle antwoorden hebben de juiste aanvraagbinding en bronvector.
Geen `retryFull`, ontbrekende meting of engine-/GUI-/consolefout.

De bruikbare app blijft **45.49 / alpha57**. Dit is uitsluitend onderzoek met
behouden binaries en eigen documentkopieën. Geen nieuwe bouw/download/release,
productfix, gesloten issue of afgerond migratiegebied.

| Controle | Referentie 45.49 | Afgewezen cache 45.50 |
|---|---:|---:|
| Koude aanvragen | 1 | 1 |
| Exact passende vervolgaanvragen | 69 / 69 | 75 / 75 |
| Koude bron | 5.997.678 bytes | 5.997.678 bytes |
| Warme bron | 4.622–4.635 bytes | 4.622–4.634 bytes |
| Ontbrekende metingen / herstartverzoeken | 0 / 0 | 0 / 0 |
| Volledig gecontroleerde verhalen / teksten | 1.537 / 3.329 | 1.537 / 3.329 |

De sequentiële aanvraagvoorwaarden komen overeen met de controles in
`BronSpiegel` en het native `prepare_confirmed_clipboard_fragment_cached`-
filter. De observator leest geen interne `reused`-vlag of cachetrefferteller;
voorraadverdringing en werkelijk cachewerk zijn daarmee niet rechtstreeks
geprofileerd. Wel verdwijnt de aanname dat de gewone GUI steeds andere
voorstelbytes of bindingsgegevens zou aanbieden. De bron is groter dan de
5.904.487 bytes van de eerdere afzonderlijke kernproef; de gegevensvorm en
cachetreffers op precies deze GUI-bron zijn nog niet onderzocht.

De meting omwikkelt alleen `window.fetch` in de eigen test-WebView, zonder
wijziging van de read-only invoke-functie of de app. Zij logt maximaal 1.024
metadataregels: booleans, aantallen en bytegroottes. Geen tekst, document-ID,
client-ID, basisdigest, vector of base64 in de transportmetadata. Eén vorig
voorstel blijft tijdelijk in de closure; stoppen herstelt fetch. De observator
is voor deze sequentiële proef bedoeld, niet geaccepteerd voor documentwissels
met onderweg zijnde antwoorden.

De werkelijke toetsenreeks en alle oude bronasserties blijven behouden. Beide
beelden doorstaan daarnaast een exacte RGB-vergelijking van de documentuitsnede
820×740, met uitsluitend de bekende cursorzone uitgesloten: nul afwijkende
pixels. Het cachebeeld is ook visueel bekeken; tekst en donkere pagina zijn
zichtbaar. Geen volledige UI-pixelpariteit of bewaar-/heropenbewijs uit deze ronde.

De geïnstrumenteerde rastertijden zijn 36.026 en 40.059 ms. Er draaide elders
een compiler. Dit is **geen nieuwe snelheidsvergelijking**; de eerdere passieve
ABBA-afkeuring met 6,25% vertraging blijft het geldige besluit over de kandidaat.

**113 Python-tests slagen**, inclusief de echte JS-helpercontrole voor warme en
koude aanvragen, afwijkende bindingen/voorstelbytes, ongeldige antwoordbinding
of vector, herstart, vergeten, oorspronkelijke transportfouten, argument-/
antwoorddoorgifte, kopiëren en begrenzing. Geen frontend- of Rusttests opnieuw
uitgevoerd: productiecode en binaries veranderen niet. De passende eigen
fysieke proeven en bewijsverificatie zijn wel uitgevoerd.

[Exacte hashes, metadata, beeldenproeven en veertien bewijsbestanden](2026-11-06-writer-bronhergebruik.json).
De scripts staan in `native/onderzoek/writer-bronhergebruik`. Alle oorspronkelijke
bronnen, binaries, documenten en negatieve resultaten blijven behouden.

Volgende concrete stap: de eigen werkelijke GUI-bron reconstrueren in de
bronvaste replicaproef, cachetreffers/gewicht op die bron meten en het resterende
SDK-publicatie-/teken-/groeperingswerk apart profileren. Geen verzwakking van
basis-, client-, vector- of documentbewaking om snelheid te winnen. Oude
workertraps/lijstbewaarfout, meerdere grote documenten, overige platforms,
edities en de volledige Rust-interface blijven ongeaccepteerd.
