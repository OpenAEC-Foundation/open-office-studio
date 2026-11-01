# Native controle, 1 november 2026: alpha 37

**2026.44.9-alpha.37** zet sectiekopieën en directe tekstinvoer in Notition verder over. Een andere sectiesoort maakt een gevulde kopie met eigen pagina-identiteit; de oorspronkelijke sectie blijft intact. De nieuwe sectie of pagina wordt geopend. Ongedaan maken herstelt de bron en kiest een bestaande pagina.

Tekstvakken hebben vanaf de eerste klik hun eigen editor. Meerdere tekstvakken kunnen samen als één brontransactie worden toegepast. Een toetsenbordgebeurtenis met meerdere Unicode-tekens blijft volledig behouden; oude invoer van een andere bronversie wordt genegeerd. De Markdown-preview volgt de conceptinvoer.

Negen gerichte tests slagen, waaronder vijf UI-tests. Deze controleren bronbehoud, volgorde en opmaak bij conversie, veilige Unicode-splitsing, atomair weigeren, nieuwe paginadoelen, directe eerste invoer, snelle invoer in twee vakken, heropenen en undo. De oorspronkelijke twee GUI-/regressiefouten en de aanvullende Unicode-afkeuring zijn behouden.

De volledige definitieve ronde loopt nog. Platformbouwen en de werkelijke alpha37-vensterproef zijn nog niet gecontroleerd. De eerdere afgebroken schijfronde en de onderbroken onderzoeksronde tellen niet als geslaagde volledige controles.

Alle tien [migratieacceptatiegebieden](migratie.json) blijven open. Automatische opslag/herstel, zoeken en volledige boek-/sectiebediening in Notition blijven ontbreken. De oorspronkelijke UI is nog niet pixelgelijk; de volledige suite is nog niet gemigreerd of vrijgegeven.
