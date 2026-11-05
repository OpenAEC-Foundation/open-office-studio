# Writer: encodercache op de bevestigde bronreplica

De aansluiting op de werkelijke Rust-bronvoorbereiding slaagt in een
**afzonderlijke kernkopie**. Onder rustiger belasting kost de volledige gemeten
voorbereiding gemiddeld 16,0% minder tijd; de snapshotfase kost 33,9% minder.
Dit bewijst nog geen snellere desktopinvoer. App 45.49 / native alpha57 blijven
ongewijzigd; geen worker-/bewaarprobleem of migratiegebied is voltooid verklaard.

De cache verhuist samen met `PreparedClipboardReplica.doc`, uitsluitend na de
bestaande exacte controle van clientnummer, basisdigest en voorstelbytes. Koude
reconstructie krijgt een nieuwe cache. Bronvector, pending-/groottecontroles,
voorstelmutatie en bevestigde bron blijven gescheiden zoals in de referentie.
Er zijn geen nieuwe observers, timers, asynchrone stappen of globale caches.
De bestaande deterministische sortering/JSON-conversie en de negentien meetregels
blijven gelijk. De algemene encoder-testmodule is in deze kopie behouden.

`BronSpiegel::bytes` telt het cachegewicht bij bron en voorstel op. De bestaande
bronvoorraad van 64 MiB kan daardoor ook cachegewicht verdringen. De cache heeft
een begroting van 32 MiB, inclusief vaste index en recursief vastgehouden waarden.
Dit is conservatieve boekhouding, **geen harde RSS-/allocatorgrens**. Het extra
gewicht kan andere bronspiegels eerder verdringen; afwisselend werken met
meerdere grote documenten moet nog op werkelijk geheugen en snelheid worden
getoetst. De defaultencoder blijft pending updates behouden; de gecachte functie
valt daarvoor op dezelfde route terug. De bevestigde invoerroute weigert deze
bronnen al vóór serialisatie.

De eerste bouw slaagt in 396,1 seconden. De kandidaat heeft een eigen targetmap
en een afwijkende ELF-hash. De referentieregressies gebruiken een afzonderlijke
kopie van de eerdere Cargo-cache; oorspronkelijke targets/binaries blijven
behouden. De kandidaatregressies wachten op Cargo's bouwslot; hun totale
looptijd is geen meting van de test-CPU-tijd.

- Referentie: alle **28 bestaande Rust-kernregressies** ongewijzigd geslaagd.
- Kandidaat: **29/29** geslaagd. De extra proef controleert meegeteld cachegewicht,
  vrijgeven na een afgewezen vector en koude terugval bij geldige vervolginvoer.
- **109 Python-tests** geslaagd, waaronder vijf nieuwe controles op bronbinding,
  boekhouding, behoud van encoderregels, ankers en onveranderlijke proefkopieën.
- Twee volledige ABBA-reeksen slagen: per reeks vier ronden met 68 synthetische
  groepen/351 tekens, 1.537 verhalen en 3.329 teksten, alle opmaak/identiteiten,
  selectie, Undo/Redo, alle uitgepakte DOCX-delen en heropening. Iedere variant
  doorstaat vier afwijzingen met geldige vervolginvoer. Elke ronde bewaart de
  verwachte 136 fasemeldingen en 67 hergebruikte bevestigde replica's.

De eerste reeks liep deels tegelijk met zware builds/tests in een andere
werkmap. De referentiekern varieerde daar van 12.558 naar 5.115 ms. De gegevens-
controles zijn geldig, maar de schijnbare ratio 0,501× is **geen overtuigend
snelheidsbewijs**. De belasting is vastgelegd; andere processen zijn niet gestopt.
De herhaling startte zonder waargenomen zware bouw-/testprocessen. Ook die
herhaling is geen volledig geïsoleerde hostmeting.

| Rustiger ronde | Volledige gemeten kern | Snapshotfase |
|---|---:|---:|
| Referentie A | 5.034,0 ms | 2.760,0 ms |
| Cache A | 4.545,7 ms | 1.954,5 ms |
| Cache B | 3.951,1 ms | 1.705,4 ms |
| Referentie B | 5.080,1 ms | 2.779,8 ms |

Verhouding kandidaat/referentie: kern **0,840×**, snapshot **0,661×**. De
kernklok omvat aanvraagdecodering en `BronSpiegel::bereid_voor`, niet het volledige
Tauri-transport, de documentwerker, SDK-publicatie of tekenen. Dit zijn
synthetische groepen op één vaste eigen bron, geen exacte fysieke GUI-batchgrenzen
of bewijs voor alle bestanden. De eerdere rechtstreekse encodercacheproef en
haar drie specifieke waardetests zijn niet opnieuw uitgevoerd in deze ronde;
hun vastgelegde bron wordt gecontroleerd hergebruikt.

[Exacte bronnen, metingen, bouw-/testlogs en hashes](2026-11-05-writer-replicacache.json)
bevatten 95 gzipbestanden; hash en uitgepakte bytes zijn gecontroleerd. Vier
binaries zijn onafhankelijk bewaard buiten de herbruikbare Cargo-caches. De
onderzoeksopzet staat in `native/onderzoek/writer-replicacache`.

Volgende stap: deze aansluiting als desktopkandidaat bouwen en passende volledige
checks uitvoeren. Daarna fysiek ABBA toetsen op invoer/selectie, bewaren,
heropenen, broninhoud en documentpixels; ook meerdere grote documenten en
werkelijk geheugen controleren. Deze ronde bevat geen nieuwe appbuild,
frontend-/TypeScript-hertest, GUI-/FPS-/pixel-/RSS-meting, algemene volledige
encoder-testsuite, Windows/macOS- of editieacceptatie. Geen release gepubliceerd;
de eerdere workertraps en lijstbewaarfout blijven open.
