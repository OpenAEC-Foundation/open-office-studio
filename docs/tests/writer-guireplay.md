# Writer: cachehergebruik op de echte GUI-bron aangetoond

De fysieke Writer-opname is nu rechtstreeks door beide behouden Rust-kernen
herhaald, met **dezelfde 63 invoergroepen en 5.997.678 bronbytes**. Alle antwoorden
zijn bytegelijk aan die uit de GUI, behalve de gemeten voorbereidingsduur en de
bestaande schemaverpakking. De kern bevestigt 62 keer hergebruik. Dit maakt de
vorige verklaring door ontbrekende voorstelbinding voor deze route onaannemelijk.

De app blijft **45.49 / alpha57**. De eerder afgewezen desktopcache wordt niet
gepromoveerd: de passieve desktop-ABBA kostte 6,25% meer tijd. Deze nieuwe
kernproef bewijst geen desktopverbetering en verklaart de volledige vertraging
nog niet. Geen nieuwe download, officiële release, gesloten issue of afgerond
migratiegebied.

De opname draait op een eigen documentkopie in een afzonderlijke Xvfb-/DBus-/
XDG-omgeving. Werkelijke toetsen, alle 1.537 verhalen/3.329 teksten en de bestaande
tekstpixelpoort slagen; de uiteindelijke documentuitsnede is daarnaast RGB-exact
aan de eerdere referentie, met alleen de bekende cursorzone uitgesloten. Het
beeld is visueel bekeken: tekst en donkere pagina zijn zichtbaar. Geen volledige
UI-pixelpariteit. Alleen deze eigen fixture wordt opgenomen, nooit een
gebruikersdocument. De opname bevat bewust de volledige eerste bron en echte
tekst, met maximaal 256 sequentiële aanvragen en 16 MiB JSON-tekens.

De eerste ABBA-reeks heeft geen waargenomen andere compiler bij aanvang:

| Ronde | Gemeten kerntijd | Snapshotfase | Native hergebruik |
|---|---:|---:|---:|
| Referentie A | 4.507 ms | 2.457 ms | 62 / 63 |
| Cache A | 3.644 ms | 1.574 ms | 62 / 63 |
| Cache B | 3.644 ms | 1.574 ms | 62 / 63 |
| Referentie B | 4.550 ms | 2.490 ms | 62 / 63 |

De kernratio is **0,80471×**, circa 19,5% minder kerntijd op deze opname. Dit is
één geïsoleerde ABBA-reeks, geen algemene snelheidsacceptatie. De snapshotfase
is ongeveer 36% korter. De aanvraaggrenzen, oorspronkelijke client, vector,
basis, documentbinding en antwoordbytes worden ongewijzigd herhaald. De bronhash
is `b11a6f66b3797a080af2e70477e601ede9fd2e0fad9c2547ba160820a5200e74`.

Een onafhankelijke SDK-sessie voert dezelfde tekstacties uit. Vier eerste
kernronden, vier extra ronden op de definitieve proefcode en één tellerronde
slagen voor alle verhaalstructuren/opmaak/identiteiten, alle teksten, selectie,
Undo/Redo, alle veertien uitgepakte DOCX-onderdelen en heropening van alle teksten.
Er worden geen asserties of tijdgrenzen versoepeld.

De extra ABBA-reeks op de definitieve proefcode geeft 5.635 / 4.628 / 4.783 /
5.753 ms. Tijdens die reeks is een andere Cargo-bouw in een afzonderlijke
bronkopie waargenomen. Deze ronde telt **uitsluitend als gegevenscontrole**;
geen zuivere snelheidsherhaling. Het andere proces is niet gestopt of gewijzigd.
De waarneming en beide reeksen blijven afzonderlijk behouden.

De aparte tellerversie verandert precies twee kernbestanden in een eigen kopie:
een leesaccessor op bestaande cachetellers en extra stderr-metadata. Zij behoudt
de encoder, cache, grenzen, bronbinding en antwoordbytes. Eigen Cargo-target,
gepinde oorspronkelijke bronhashes en een aparte ELF; de app en oude targets
blijven gelijk. De bouw en de volledige echte gegevenspoort slagen. Teller-ELF:
`34a96bf4bb6701eced45b5706aebc456834c1acf7f5f85c806f82639022c58c4`.

| Teller | Uitkomst |
|---|---:|
| Koude snapshot | 0 treffers / 24.067 missers |
| Iedere warme snapshot | 16.196 treffers / 7.871 missers |
| Totaal na 63 snapshots | 1.004.152 treffers / 512.069 missers |
| Geteld cachegewicht | 30.553.098 bytes, circa 29,14 MiB |
| Ingestelde boekhoudgrens | 32 MiB |

Het gewicht blijft binnen de grens. Dit is geen allocator-/RSS-grens, lekproef
of meerdere-documentenacceptatie. De interne GUI-`reused`-vlag is niet uitgelezen;
het rechtstreekse hergebruikbewijs geldt voor de exacte kernherhaling. De
extra tellerduur wordt niet als vergelijkende snelheidsmeting gebruikt.

**114 Python-tests slagen**, ook na de definitieve proefcode, inclusief de echte
JS-opnamecontrole voor doorgifte, sequentie, aantals-/omvangsgrenzen, foutbehoud
en herstel. De nieuwe Linux-tellerbinary is gebouwd en functioneel getoetst
zoals hierboven. Geen volledige frontend-/Rustregressies, andere platforms of
releasevarianten opnieuw uitgevoerd: productiecode verandert niet.

[Exacte opname, hashes, negen kernronden en 49 gecontroleerde bewijsbestanden](2026-11-06-writer-guireplay.json).
Bronnen, opgenomen eigen fixture, beelden, DOCX-bestanden, fasegegevens, beide
scriptversies en de vastgestelde achtergrondbelasting zijn behouden. Scripts:
`native/onderzoek/writer-guireplay`.

Volgende concrete stap: SDK-publicatie, tekenen en de daadwerkelijke
invoergroepering tijdens de desktoproute afbakenen. Kernhergebruik en
cachetreffers zijn op de echte aanvragen aangetoond; nog een cachepromotie
zonder fysieke winst is niet gerechtvaardigd. De oorspronkelijke workertraps,
lijstbewaarfout, overige functies/platforms/edities en volledige Rust-interface
blijven open.
