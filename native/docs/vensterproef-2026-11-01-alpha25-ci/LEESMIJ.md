# Spreadsheet-releasevensterproef alpha 25, 1 november 2026

Het CI-Linux-releaseprogramma `2026.44.9-alpha.25` slaagt op **twaalf gerichte stappen** in een eigen Xvfb-/sessie-D-Bus-omgeving. Configuratie, gegevens, cache en runtime zijn vóór de sessiebus geïsoleerd. De volledige uitgepakte pakketbron is bytegelijk aan Git-archief `3aa197019e8d5b07702252a8bc4a50701c7c59aa` gecontroleerd. Beide programma’s zijn met versies en SHA-256 vastgezet. Dit zijn de **CI-binaries**, onderscheiden van de afzonderlijk vastgelegde lokale build.

Echte X11-invoer selecteert B2:D4 met slepen, controleert het adres via het systeemklembord, maakt alle negen cellen vet, bewaart oorspronkelijke formules en houdt lege B4/C4 leeg. Shift+pijlen en Shift+klik behouden het anker. Undo herstelt de oorspronkelijke bronbytes. Het systeemklembord voert café en 🏠 in G10 in; Enter en bewaren gebeuren afzonderlijk. Ook die bewerking heeft bronexacte undo. Bestand opent en sluit zonder bronwijziging; het eigen venster sluit schoon.

Een afzonderlijke kopie van de bewaarde Unicode-bron opent daarna in een nieuw venster. F2, selecteren en het systeemklembord controleren de volledige celtekst; Escape behoudt de bewaarde bron. Ook dit venster sluit met procescode 0. **De onbewerkte opname is visueel gecontroleerd: het huisteken staat echt in het raster, ook na opnieuw openen.** De historische alpha-23-afkeuring blijft behouden en is niet omgezet naar geslaagd.

[automatisch-rapport.json](automatisch-rapport.json) bewaart de oorspronkelijke automatische uitvoer. [rapport.json](rapport.json) voegt de beperkte visuele controle toe. [herkomst.json](herkomst.json), [proefbron.py](proefbron.py) en [startbron.py](startbron.py) koppelen versie, bron, programmahashes en proefopzet. De beelden zijn volledig en onbewerkt. De scripts bevatten lokale controlepaden.

Deze proef wacht tussen invoerstappen en bewijst geen foutloze directe plak/Enter/bewaarreeks, geen volledige snelle-invoerwachtrij en geen volledige suite-, Unicode- of pixelpariteit. Geen fysieke hardware, Windows/macOS-bediening, echte IME-compositie, systeemdialoog of schermlezerproef.
