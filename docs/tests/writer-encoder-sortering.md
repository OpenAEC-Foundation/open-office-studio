# Encodercontrole: bytes gelijk, snelheidswinst niet aangetoond

De tijdelijke `BTreeMap` bij binair schrijven van `Any::Map` is in een eigen
kernkopie vervangen door een gesorteerde vector. Alleen deterministic.rs
verschilt van de oorspronkelijke gemeten kern. De app blijft 2026.45.49 /
Rust alpha57; geen productiepatch.

| Ronde | Snapshot (ms) | Kern (ms) |
| --- | ---: | ---: |
| referentie-a | 4094.6 | 7275.3 |
| sortering-a | 3601.7 | 6769.9 |
| sortering-b | 3425.7 | 6439.5 |
| referentie-b | 3168.3 | 5750.3 |

Gemiddelde kandidaat/referentie: 1.014× kerntijd en 0.968× snapshottijd.
De referentieronden verschillen onderling sterk; dit toont geen overtuigende
snelheidswinst. De kandidaat wordt daarom niet in de app opgenomen.

Alle vier volledige SDK-/DOCX-proeven slagen, inclusief 3.329 teksten in
1.537 verhalen, opmaak/identiteiten/selectie, Undo/Redo, bronvectoren, alle
uitgepakte DOCX-delen en heropening. Elke ronde houdt 136 fasemeldingen en
67 cachehergebruiken; vier afwijzingen laten geldige vervolginvoer toe.
Alle 28 bestaande Rust-regressies, twee rechtstreekse encoderproeven en
100 Python-tests slagen. De vorige byte-exactheidstest is niet versoepeld.

De eerste bouw is onderbroken met exitcode 143 zonder Rust-fout; oorzaak
onbekend. Het log is bewaard. De geverifieerde herhaling slaagt met een eigen
ELF. De eerste profileropzet weigerde een dubbel regelanker en voerde dus geen
profiel uit. De definitieve patch begrenst de klokken tot de echte encoder.

Een aanvullende proef importeert dezelfde bron van 5.904.487 bytes in een
werkelijke native `EditingDoc`, langs dezelfde lage importlaag als de bronkern.
Bronvector, ontvangen bytes, oorspronkelijke encoder, werkelijke native encoder
en encoder met klokken zijn exact gecontroleerd. Drie ronden schrijven elk tien
keer met en zonder klokken. De gemeten buitenlooptijd bevat ook bytecontroles;
het is geen volledig invoer-, CPU- of GUI-profiel.

| Topmethode / waardetype | Aanroepen | Deel gemeten buitenlooptijd |
| --- | ---: | ---: |
| write_any / Map | 307110 | 20.5% |
| write_any / Array | 115230 | 23.2% |
| write_any / String | 406830 | 1.5% |
| write_any / Number | 299520 | 1.0% |
| write_any / Bool | 99990 | 0.3% |
| write_json / Map | 299670 | 20.2% |
| write_json / Bool | 23160 | 0.1% |
| write_json / Null | 322830 | 1.7% |

De drie samengestelde groepen samen nemen circa 63.9% van de geïnstrumenteerde
buitenlooptijd in; de meetoverhead bedraagt 5.3%. Recursieve subwaarden worden
niet nogmaals als topmethode geteld. De aantallen/kosten wijzen dus vooral naar
herhaald schrijven van onveranderlijke samengestelde waarden, niet naar één
losse sorteerstap.

Onderzoek vervolgens een begrensde cache binnen dezelfde native replica, met
sterke verwijzingen naar onveranderlijke kaarten/arrays en verschillende sleutels
voor binair en JSON schrijven. Geheugen moet worden geteld en begrensd. Behoud
bron-/eigenaarbinding, koude terugval en de bestaande byte-exacte snapshotcontrole.
Deze cache is nog niet geïmplementeerd. Alleen bij overtuigende kernwinst volgt
een fysieke desktopvergelijking met invoer, selectie, opslaan en visuele controle.

Geen nieuwe desktopbuild, GUI-/pixel-/platformacceptatie, opgelost issue of
voltooid migratiegebied. Eerdere worker-/bewaarfouten blijven open.
[Exacte bronnen, hashes, profielen en afkeuringen](2026-11-05-writer-encoder-sortering.json).
