# Echte Spreadsheet-vensterproef alpha 26

Het **lokale releaseprogramma 2026.44.9-alpha.26** slaagt op veertien gerichte stappen in een eigen Xvfb-/D-Bus-sessie. XDG-configuratie, gegevens, cache en runtime zijn vóór de sessiebus geïsoleerd. [herkomst.json](herkomst.json) koppelt broncommit, beide versies en programmahashes. Dit zijn de lokale binaries; de CI-programma’s hebben afzonderlijke hashes.

Echte muisinvoer selecteert B2:D4. Het systeemklembord bevestigt het adres; bereikopmaak maakt alle negen cellen vet met behoud van formules en lege cellen. Snelle Shift-pijlen en Shift-klik houden het anker vast. Undo herstelt de bronbytes. **Down, 78 en Enter zonder onderlinge pauzes** bewaren B2=3, wijzigen B3 naar 78 en bereiken B4. Daarna controleert en herhaalt de proef zo nodig opslaan. Eén undo herstelt de oorspronkelijke bronbytes.

Het systeemklembord plakt café en het huisteken in G10. Bevestiging en bewaren gebeuren afzonderlijk. Ook die bewerking heeft bronexacte undo. Bestand opent en sluit zonder bronwijziging. Het eigen venster sluit schoon. Een bewaarde kopie opent daarna in een nieuw venster; F2, selecteren en het systeemklembord controleren de volledige celtekst. Escape behoudt de bewaarde bron en ook dit venster sluit met procescode 0.

De volledige onbewerkte beelden zijn bekeken: het huisteken staat ook na heropenen zichtbaar in het raster; het snelle-invoerbeeld toont B2=3, B3=78 en bestemming B4. Dit is gerichte visuele goedkeuring, geen volledige pixelpariteit. [automatisch-rapport.json](automatisch-rapport.json) blijft ongewijzigd; [rapport.json](rapport.json) voegt de visuele controle toe. De scripts staan in [proefbron.py](proefbron.py) en [startbron.py](startbron.py).

De [eerste afkeuring](eerste-afgekeurd/rapport.json) blijft behouden. Een te brede vervanging in het testscript herhaalde de nieuwe invoerreeks onbedoeld in het heropende tweede document, terwijl de controle nog het eerste bestand las. Onafhankelijke XML-/bytecontrole bevestigt dat eerste bestand bronexact en B3=78 in het tweede bestand. [De diagnose](eerste-afgekeurd/diagnose.json), oorspronkelijke scripts en alle beelden blijven bewaard. De tweede proef verwijdert uitsluitend die onbedoelde herhaling en behoudt alle veertien bedoelde controles; de eerste uitvoer is niet omgezet naar geslaagd.

Geen volledige invoerwachtrij, directe asynchrone plak/Enter/bewaargoedkeuring, fysieke hardware, Windows/macOS-bediening, echte IME-compositie, systeemdialoog of schermlezerproef.
