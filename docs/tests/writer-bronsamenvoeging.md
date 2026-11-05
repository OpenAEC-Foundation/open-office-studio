# Bronsamenvoeging afgewezen

De algemene binaire samenvoeging wordt niet in de app opgenomen. Zij kost gemiddeld
2.26 keer zoveel kerntijd en 3.30 keer zoveel snapshottijd als de bestaande gemeten
kern. De app blijft 2026.45.49 / Rust alpha57; geen productcode gewijzigd.

| Ronde | Snapshot (ms) | Kern (ms) |
| --- | ---: | ---: |
| referentie-a | 3358.4 | 6032.9 |
| samenvoeging-a | 10557.2 | 13086.7 |
| samenvoeging-b | 10587.7 | 13158.2 |
| referentie-b | 3058.0 | 5563.9 |

Alle vier SDK-gegevensproeven slagen: 3.329 alinea-/celteksten in 1.537 verhalen,
alle verhalen/opmaak/identiteiten, selectie, Undo/Redo, alle uitgepakte
DOCX-onderdelen en heropening. Vier afwijzingen per variant laten geldige
vervolginvoer toe. Iedere ronde bevat 136 fasemeldingen en 67 cachehergebruiken.
Dit zijn synthetische groepen, geen exacte GUI-batchgrenzen of snelheidsacceptatie.

De ongewijzigde referentie slaagt voor alle 28 Rust-regressies. De kandidaat
faalt bij `exact_bevestigde_voorstellen_zijn_gelijk_aan_steeds_volledig_reconstrueren`:
27 slagen, één faalt op de snapshotbytes (bronspiegel.rs:256). De bestaande
assertie is niet gewijzigd. De afzonderlijke gegevensproef bewijst dus niet dat
ook het interne bytecontract behouden is; tekstverlies is hier niet aangetoond.

De helper in yrs/alt.rs decodeert de volledige inputupdates, voegt die samen en
encodeert ze opnieuw. Dat past bij de hogere kosten; deze interne onderdelen
zijn niet afzonderlijk als CPU-profiel gemeten. De oorspronkelijke appbron,
referentiebinaries, afgewezen kandidaat en regressiebinary blijven behouden.
96 Python-tests slagen. Er is geen nieuwe desktopbuild, GUI- of pixelcontrole,
platformacceptatie, opgelost issue of migratiegebied in deze stap.

[Exacte hashes, bronnen, profielen en afkeuringen](2026-11-05-writer-bronsamenvoeging.json).
Volgende stap: de deterministische encoder gericht onderzoeken, met behoud van
de byte-exacte poort. De eerdere worker-/bewaarfouten blijven afzonderlijk open.
