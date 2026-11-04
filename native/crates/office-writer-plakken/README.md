# Gedeelde Writer-plakvoorbereiding

Deze bibliotheek bereidt een volledige gestructureerde plakactie in een eigen
Rust-replica voor. Zij schrijft geen bestanden en kent geen vensters of levende
editors. Tauri roept `bereid_voor` buiten de WebView aan met `spawn_blocking`;
de Rust-kern exporteert dezelfde bibliotheek als `writer_plakken`.

De aanvraag bevat een versienummer, opdracht- en documentidentiteit, bronversie,
snapshot met SHA-256, clientidentiteit, selectie, klembordfragment en eventueel
een revisieauteur. Een antwoord bindt de delta en eindcursor aan precies die
aanvraag. De volledige bestaande tekst-, alinea-, tabel-, afbeelding-,
bladwijzer- en revisieregels blijven gelden. Een fout geeft geen gedeeltelijke
delta terug. `keep_deleted` staat vóór de snapshotimport aan, zodat een
voorbereidingsreplica geen oorspronkelijke verwijderingsinformatie opruimt.

## Voorwaarde voor overnemen

**De clientidentiteit is dezelfde als die van de aanvragende editor.** De
aanroeper moet daarom de documentlevensduur én alle bronwijzigingen gedurende
hashen en voorbereiden bewaken. Een antwoord mag uitsluitend op de nog
identieke bron worden toegepast. Alleen de bronversietekst controleren is
onvoldoende: registreer ook de wijzigingsmeldingen, inclusief verwijderingen.
Anders kunnen onafhankelijk toegekende klokken botsen en inhoud verloren gaan.

De Tauri-koppeling houdt de oorspronkelijke SDK-invoerwachtrij vast, bewaart
het oorspronkelijke doel met sticky posities en weigert verouderde antwoorden.
Na drie mislukte voorbereidingen of bij een snapshot groter dan 100 MiB blijft
de volledige bestaande plakroute beschikbaar. Inhoud wordt niet ingekort.
Sluiten maakt late antwoorden ongeldig. De lokale opname gebruikt
`applyLocalUpdate`; tekst en de eigen bronopmaak horen bij één Undo-stap.
Een latere, rechtstreeks gewijzigde selectie wordt niet overschreven.

## Gerichte controles

```sh
cargo test --release --locked --manifest-path native/Cargo.toml -p office-writer-plakken
cargo build --release --locked --manifest-path native/Cargo.toml -p office-writer-plakken --example plak_protocol
export OFFICE_PLAKBATCH_BIN="$PWD/native/scripts/proef-writer-plak-protocol.py"
export OFFICE_PLAK_PROTOCOL_BIN="$PWD/native/target/release/examples/plak_protocol"
node native/onderzoek/writer-plakbatch/controleer-randgevallen.mjs
node native/onderzoek/writer-plakbatch/controleer-afwijzingen.mjs
node native/onderzoek/writer-plakbatch/controleer-groot.mjs
```

De protocoladapter zet de bestaande onafhankelijke SDK-/DOCX-proeven om naar
de werkelijke desktopaanvraag; de berekening komt uit deze bibliotheek.
Met `OFFICE_PLAKBATCH_UIT` krijgen de drie Node-proeven een afzonderlijke
uitvoermap; dezelfde map wordt voor randgevallen, afwijzingen en de grote
proef gebruikt. Zo blijven eerdere bewijsbestanden behouden bij een hertest.
De 41 inhoudsgevallen, acht foutgevallen, grote bronproef, acht tekst-/plakprotocoltests
en twee leeslaagentests hebben ieder een eigen omvang. Zij vervangen geen
GUI-, platform-, geheugen- of volledige suiteacceptatie. De voorbereiding
maakt nog een volledige bronreplica; verdere schaalbaarheid blijft nodig.

De twee gewijzigde bibliotheken staan onder `native/vendor`, met vastgelegde
herkomst, oorspronkelijke licentieteksten en wijzigingsvermeldingen.

Bij invoeging aan een alinea-einde gebruikt de kern waar mogelijk de reeds
gelezen afsluitmarkering. Zonder bladwijzers op die markering is geen nieuwe
verhaalwandeling nodig; met bladwijzers blijft de volledige grensbewerking
gelden. Bij splitsen aan het verhaaleinde wordt geen volgend blok opgevraagd.
Dit kort geen broninhoud in en verandert de invoeg-/revisieregels niet. De tien
extra inhoudsgevallen toetsen eindposities bij bladwijzers, revisies, lege
inlines, afbeeldingen, tabellen, tabelcellen en de laatste alinea.
