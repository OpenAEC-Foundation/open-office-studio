# Tijdelijke sorteerstructuur in de deterministische encoder

Afzonderlijke Linux-proef, zonder productiepatch of nieuwe appversie. Alleen
`BTreeMap` bij het binair schrijven van `Any::Map` wordt vervangen door een
vector met dezelfde oplopende sleutelvolgorde. De JSON-route, snapshotroute,
bronbinding, groottecontroles en negentien bestaande meetregels blijven gelijk.
De afgewezen algemene bronsamenvoeging wordt hier niet gebruikt.

De referentie blijft de vastgelegde Linux-binary uit `writer-invoerfasen`.
Een andere referentie, bron of bestaande proefkopie wordt geweigerd. Beide
eerdere experimenten en hun binaries blijven behouden. Deze onderzoeksopzet
vereist de eerder opgebouwde referentie op deze pc; geen algemene installer.

```sh
python3 native/onderzoek/writer-deterministische-sortering/voorbereiden.py
python3 native/onderzoek/writer-deterministische-sortering/bouwen.py
python3 native/onderzoek/writer-deterministische-sortering/controleren.py
python3 native/onderzoek/writer-deterministische-sortering/encodercontrole.py
python3 native/onderzoek/writer-deterministische-sortering/encoderfasen.py
```

De gegevensvergelijking gebruikt de oorspronkelijke proef met uitsluitend
andere binarypaden: 68 synthetische groepen, 351 tekens, alle 3.329 teksten in
1.537 verhalen, opmaak/identiteiten/selectie, Undo/Redo, uitgepakte DOCX-delen,
heropening en vier afwijzingen met geldige vervolginvoer. Vier ronden volgen
referentie/kandidaat/kandidaat/referentie. Dit is geen GUI-/IPC-/FPS-meting of
herhaling van exacte GUI-batchgrenzen. `geslaagd` in die gegevensproef betekent
geen prestatie-, regressie-, platform- of productieacceptatie.

De rechtstreekse encodercontrole compileert de echte oorspronkelijke en
gewijzigde encoderbron naast elkaar. Alleen hun algemene engine-testmodule
wordt voor dit afzonderlijke harnas weggelaten; geen encoderregel verandert.
Beide private `encode_any`-functies krijgen dezelfde testingang. De controle
vergelijkt getallen, speciale zwevendekommawaarden, buffers, grote gehele
getallen, Unicode, geneste kaarten en verschillende invoegvolgorden, plus
levende bronnen na invoegen/verwijderen en een externe update. Dezelfde al
gebouwde yrs-/serde-bibliotheken worden gebruikt; geen vervangende encoder.

Ook de bestaande `office-writer-plakken`-regressies moeten ongewijzigd slagen,
inclusief de byte-exactheidstest die de vorige kandidaat afwees. Pas daarna
kan een fysieke desktopvergelijking zinvol zijn. Deze proef sluit geen issue
of migratiegebied; de bestaande worker-/bewaarfouten blijven open.

De sorteerkandidaat behoudt de bytepoorten, maar de vier kernronden tonen geen
bewijs van snelheidswinst. Hij wordt niet in de app opgenomen. De eerste bouw
is onderbroken met exitcode 143; de gecontroleerde herhaling slaagt. Beide
bouwlogs blijven behouden. Zie `docs/tests/writer-encoder-sortering.md`.

De aanvullende fasenproef gebruikt de oorspronkelijke encoder met uitsluitend
klokken in `write_any` en `write_json`, uitgesplitst naar hun topwaardetype.
Hun recursieve subwaarden worden niet nogmaals als methodeaanroep gemeten.
De echte native `EditingDoc` importeert dezelfde eigen bron op dezelfde
laag-niveauroute als de bronvoorbereiding. Bronvector, oorspronkelijke
encoderbytes, daadwerkelijke native encoderbytes en ontvangen bronbytes worden
gecontroleerd. Drie ronden schrijven elk tien keer met en zonder klokken.
De buitenlooptijd bevat ook bytevergelijkingen en meetoverhead; dit is geen
CPU-profiel of meting van de volledige native invoer-/GUI-keten.

De eerste profileropzet weigerde terecht een dubbel methoderegelanker: ook de
tel-encoder bevat die regel. De uiteindelijke patch is begrensd tot de echte
`DeterministicEncoderV1`-implementatie; er is geen geldige profielmeting uit de
geweigerde opzet. De aanvullende proef wijst naar herhaald schrijven van
samengestelde waarden. Onderzoek daarna alleen een begrensde cache met sterke
verwijzingen naar onveranderlijke waarden, gebonden aan dezelfde native
replica. Byte-exactheid, bron-/eigenaarbinding, afwijzingen, geheugenverbruik en
fysieke invoer/selectie/bewaring blijven afzonderlijke vereisten. Deze cache is nog niet gebouwd.
