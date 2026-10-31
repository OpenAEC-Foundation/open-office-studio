# Aanvullende desktopreferentie 2026-W44.8

`writer.png` komt uit de oorspronkelijke, via GitHub gedownloade Linux-AppImage. `writer-herhaald.png` is een tweede volledige X11-opname met identieke PNG-bytes. Geen maskers, herschaling, kleurcorrectie of getekende onderdelen. De bestaande browserreferenties blijven behouden en blijven de oorspronkelijke vergelijkingsbasis.

De releasebron is `0fc4d2bbf94bb6025d8d8517d53631d5f830cd1e`; de frontend, desktopcode, vensterconfiguratie, templates en voorbeelden zijn bytegelijk aan de eerdere webreferentiebron `b5492ef79b0e7cd7c70134924fd5250e78bdfe28`. De officiële AppImage-SHA-256, programmahash, voorkeuren, bediening en opnamehashes staan in [writer.json](writer.json). De opname gebruikt 1058 × 892 pixels, Nederlands en Forge. De voorbeeldkaart opent Ontwerpnotitie; meldingen zijn via hun echte sluitknoppen gesloten en het documenttabblad heeft de tekstcursorfocus verwijderd.

De eigen XDG-configuratie, gegevens, cache en runtime zijn ingesteld vóór een eigen sessie-D-Bus. Een eigen Xvfb voorkomt bediening van gebruikersvensters. Voor de oorspronkelijke WebKit-weergave zijn DMABUF en compositing uitgeschakeld; zonder die softwareweergave werd de documentcanvas in deze omgeving zwart. Eerdere proefopnamen met zwart beeld, onvoltooide weergave of meldingen zijn niet goedgekeurd. De [opnamebron](opname.py) en [startbron](start.py) leggen de precieze proefopzet vast; paden verwijzen naar de lokale controlemap en het geverifieerde uitgepakte pakket.

Dit is één aanvullende Writer-referentie. Het is geen native suitegoedkeuring, fysieke platformproef of bewijs van pixelgelijkheid van de Rust-migratie. Andere modules en de oorspronkelijke browservergelijkingen blijven afzonderlijk te controleren.
