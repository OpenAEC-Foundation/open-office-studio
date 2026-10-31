# Writer-releasevensterproef alpha 22

De lokale release `2026.44.9-alpha.22` slaagt op **achttien gerichte stappen** in een eigen Xvfb-/sessie-D-Bus-omgeving. Configuratie, gegevens, cache en runtime zijn vóór de sessiebus op afzonderlijke paden gezet. Het programma en de bron komen uit het vaste Git-archief `37bc80b903bd6f921c4fb0b951d52713ba1b99ef`; beide releaseprogramma’s zijn met versie en SHA-256 vastgezet vóór de volgende build.

De proef opent de synthetische zespaginabron. Echte X11-toetsen navigeren van pagina 1 naar 6 en terug. Op elke bereikte pagina selecteren Home/Shift+End de werkelijke regel; het systeemklembord bevestigt de volledige tekst met café en 🏠. Snelle reeksen van drie pijlen omlaag en twee omhoog bereiken de bedoelde pagina. End en direct typen wijzigen uitsluitend de tweede bronalinea; bewaren wordt onafhankelijk via DOCX-XML gecontroleerd. Undo herstelt de oorspronkelijke pakketbytes exact. Bestand dekt de documentbediening af en het eigen venster sluit met procescode 0.

[rapport.json](rapport.json) bevat alle stappen, bronhashes en ruwe opnamehashes. [herkomst.json](herkomst.json) benoemt broncommit, beide programmaversies, hashes en bouwduur. [proefbron.py](proefbron.py) en [startbron.py](startbron.py) leggen de bediening en geïsoleerde proefopzet vast. De scripts bevatten lokale controlepaden; de geteste bron en programmahashes zijn vastgelegd.

Dit is een gerichte echte Linux-vensterproef van deze lokale build. Geen volledige suitebediening, fysieke hardware, Windows/macOS-bediening, echte IME-compositie, systeemdialoog, schermlezer of volledige functie-/pixelpariteit.
