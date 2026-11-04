# Afgekeurde invoercallbackoptimalisatie 45.42

De lokale kandidaat `2026.45.42` / Rust `alpha56` is niet vrijgegeven.
Tien native GUI-scenario's slagen, maar fysieke invoer geeft
23.148 / 30.407 / 30.473 / 22.953 ms voor referentie / kandidaat /
kandidaat / referentie. De kandidaat is ongeveer 32% trager.
Alle 3.329 alinea-/celteksten in 1.537 verhalen blijven exact behouden.
Buiten de knipperende cursor is de documentuitsnede pixelgelijk.

De callback slaat bij een gewone native invoegpositie een opvraging van de
alineakaart over. Een gerichte callbacktest faalt vóór de wijziging en slaagt
erna; alle 1.820 frontendtests slagen. De werkelijke app vraagt echter nog
steeds de volledige kaart voor de cursorpublicatie na de mutatie. De RPC-proef
telt 98 batches en 1.863 alinea-opvragingen, inclusief tabelcellen. De lokale
callbacktest bewijst daarom geen snellere applicatie-invoer.

De afgekeurde bronjournaal- en invoercallbackwijzigingen zijn niet behouden in
de volgende kandidaat. De oorspronkelijke bronroute blijft; het afzonderlijke
[revisieherstel](2026-11-04-writer-revisie-identiteiten.json) vraagt eigen
regressie-, protocol-, GUI- en platformcontroles. Geen snelheidsacceptatie,
volledige Rust-migratie, gesloten issue of nieuwe download wordt geclaimd.

[Exacte bronnen, logboeken, beelden en controles](2026-11-04-writer-nativepunt.json).
De bronnen zijn aan de gemeten binary gebonden en bevroren vóór de volgende
wijzigingen. Deze Linux-proef bewijst geen volledige suite- of platformpariteit.
