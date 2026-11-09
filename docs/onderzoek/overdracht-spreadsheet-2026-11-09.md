# Overdracht 9 november — stoppen om 15:30

De gebruiker heeft gevraagd uiterlijk 15:30 te stoppen en het werk tot morgen
te laten liggen. Na de hieronder vastgelegde checkpointcommit worden geen
bronwijzigingen meer gemaakt. Er staat geen automatische hervatting of merge gepland.

De al overgedragen bundel staat in PR #251 op `10b9ac1c7634da666498d21de3258dd3573ad397`.
De branch `codex/spreadsheet-five-e0d7` blijft exact op dat checkpoint staan.

De vervolgbranch is `codex/spreadsheet-outline-2026-11-09-e0d7` en bevat:

1. `bbbd5495`: uitsluitend de drie Spreadsheet-bestanden uit `248d5a79`
   (RekenbladKoppen, kopraster en diens tests). Sla deze hergebruikcommit over
   wanneer de integratiebranch dezelfde helper al uit de performancebundel heeft.
2. De aansluitende commit met outline-rails en de hieronder beschreven controles.

De vervolgcommit verandert geen WASM, bronpatch of bouwmetadata. De geteste kern
blijft `ad3d40536ad80eaebfa4a06dc2099885a485d850160e65e23f6306ba99abbe1e`.
Chat d410 bouwt de tabelkern boven deze bestaande vijfpatchketen; die zesde patch
wordt afzonderlijk afgestemd. De centrale integratiebranch heeft één eigenaar,
chat 9635. Neem deze vervolgcommit in de volgende batch op.

De wijziging voegt aparte +/−-rails bij de rij- en kolomkoppen toe. Ze lezen bestaande
DOM-spoorposities en doen geen extra displayList-aanroep. De kopraster-helper
verhelpt de aangetoonde 3px-scrolloscillatie van de oude extra koprasterlezing.
Een zichtbare bevestiging meldt het wissen van de undo-geschiedenis vóór toepassen.
Geneste groepen, beveiliging, opgeslagen formules en oorspronkelijke XML blijven
behouden. Metadata wordt bij gewoon typen niet opnieuw opgeslagen. Rijinhoud wordt
bij metadatalezen overgeslagen, met behoud van bronposities en onbekende XML.

Controles: 2.105 tests geslaagd in 190 bestanden, tien bestaande skips; directe
TypeScript-controle en productiebouw geslaagd; i18n 7.006 bronsleutels, dezelfde
23 bestaande mapwaarschuwingen. De negen nieuwe browsergevallen controleren
uitlijning over vijf opeenvolgende frames, geneste groepen, annuleren, vaste rij/
kolom, scrollen, 50% zoom, de beheerroute bij 10%, bescherming en echte Opslaan als
met native heropening. De bestaande acht bladgevallen, vijf CF-gevallen en vijf
groepen-/foutgevallen slagen eveneens op deze productiebouw.

De bredere hoofdissues #59/#60/#61/#66/#67 blijven open. Volgende punten zijn onder
andere volledig kopiëren van werkbladen, groepsbewerking, celverschuivingen/split
views en de echte trendlijntekenlaag. Begin morgen met het lezen van de integratie-
uitkomst en actuele taakverdeling; maak geen nieuwe WASM zonder afstemming met d410.
