# Bevestigde Writer-bronbytes samenvoegen

Afzonderlijke Linux-kernproef voor de gemeten kosten van volledige
bronserialisatie. Geen productwijziging, GUI-meting of snelheidsacceptatie.
De bestaande app blijft 2026.45.49 / Rust alpha57.

Deze proef bouwt voort op de bronvaste `writer-invoerfasen`-proef. Haar bestaande
kopieën worden eerst volledig gecontroleerd. De bewaarde basis-ELF heeft hash
`1949bb9246b9d30ebc5999d9036f73a058bea02d4dc941236dc8e92ed8451da1`.
Een afwijkende referentie of proefkopie wordt geweigerd en blijft behouden.
Deze referentiebinary moet dus al uit die vastgelegde Linux-proef beschikbaar
zijn; dit is geen platformonafhankelijke installatieprocedure.

```sh
python3 native/onderzoek/writer-bronsamenvoeging/voorbereiden.py
python3 native/onderzoek/writer-bronsamenvoeging/bouwen.py
python3 native/onderzoek/writer-bronsamenvoeging/controleren.py
```

Alleen `doc.encode_state_as_update_v1()` wordt in een eigen gemeten kernkopie
vervangen door `yrs::merge_updates_v1` van de bevestigde bron en ontvangen
update; zonder basis blijven de reeds gevalideerde ontvangen bronbytes behouden.
Alle import-, vector-, cache-, hash-, documentbinding- en groottecontroles
blijven staan. Dit toetst een kandidaat; het bewijst niet vooraf dat de
samengevoegde bytes gelijkwaardig, begrensd of sneller zijn.

De volledige vergelijking draait de oorspronkelijke gemeten kern en de
samenvoegkopie in referentie/samenvoeging/samenvoeging/referentie-volgorde.
Iedere ronde gebruikt een nieuw proces en behoudt alle gegevenscontroles.

De bestaande gegevensproef wordt bytegetrouw overgenomen met uitsluitend een
ander pad naar de twee binaries. Zij eist alle verhalen, opmaak, identiteiten,
selectie, Undo/Redo, bronvector en alle uitgepakte DOCX-onderdelen gelijk aan de
bestaande SDK, en vier afwijzingen met geldige vervolginvoer. Alle 136 bestaande
meetregels en 67 cachehergebruiken blijven verplicht. Dezelfde 351 tekens zijn
verdeeld over 68 synthetische groepen; geen herhaling van exacte GUI-batchgrenzen.
De samenvoegkopie heeft een eigen Cargo-targetmap en moet een andere ELF opleveren.

Een geslaagde kernproef rechtvaardigt nog geen productiepatch. Eerst zijn ook
koude bronherimport, de bestaande Rust-regressies en vervolgens fysieke
invoer-/selectie-/bewaarproeven met visuele vergelijking nodig. De eerdere
tragere journaalvarianten blijven afgekeurd. Bestaande CI-worker-/bewaarfouten
blijven afzonderlijk open.

De definitieve proef is afgewezen: gemiddeld 2.26× kerntijd en één bestaande
Rust-regressie op snapshotbytes. Het veld `geslaagd` in de gegevensproef
betreft uitsluitend die gegevenspoort, geen prestatie- of regressieacceptatie.
Zie `docs/tests/writer-bronsamenvoeging.md` en het bijbehorende bewijs.
