# Afgekeurde tabelceloptimalisatie 45.41

De lokale kandidaat `2026.45.41` / Rust `alpha55` is niet vrijgegeven.
Tien bestaande native GUI-scenario's slagen, maar de fysieke invoerproef
geeft 23.375 / 29.165 / 29.458 / 23.091 ms voor referentie / kandidaat /
kandidaat / referentie. De kandidaat is daarmee circa 26% trager.
De tabelceloptimalisatie is uit de volgende kandidaat verwijderd.

Alle 3.329 alinea-/celteksten in 1.537 verhalen blijven in de vier ronden
exact behouden. De documentuitsnede heeft nul afwijkende pixels; de volledige
beelden verschillen met twee tot vijf pixels in navigatie-/statusinformatie.
Dit bewijst geen volledige visuele migratie of suiteacceptatie.

De RPC-opname telt nog 99 alinea-opvragingen: de herhaalde celprojecties zijn
weg, maar de gewone invoercallback vraagt nog de volledige hoofdtekstprojectie.
Dat wordt afzonderlijk onderzocht. Alleen minder oproepen of een snellere
Rust-microproef bewijst geen snellere gebruikersinvoer.

[Exacte bronidentiteit, logboeken, beelden en afkeuring](2026-11-04-writer-celidentiteiten.json).
De bronnen zijn bevroren bij de gemeten binary; latere lokale wijzigingen
worden er niet aan toegeschreven. Geen issue of migratievlag is gesloten.
