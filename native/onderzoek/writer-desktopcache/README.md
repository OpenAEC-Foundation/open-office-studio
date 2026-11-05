# Afzonderlijke desktopkandidaat met Writer-encodercache

Linux-onderzoek op een bronvaste kopie van `c9118b61`; geen automatische wijziging
van de bruikbare app, gebruikersprofielen of documenten. Kandidaat 2026.45.50 /
alpha58 gebruikt dezelfde cacheaansluiting als de getoetste replicaproef,
uitsluitend zonder negentien klokregels en de extra proefmodule. Alle overige
2.442 gecontroleerde applicatiebronnen blijven bytegelijk aan de vastgelegde
revisie of de expliciet vastgelegde versie-/cachepatch.

De bronkopie en eigen beschrijfbare Cargo-target staan buiten de native
workspace in `.local/doorwerk-2026-11-05/desktopcache`. `node_modules` verwijst
naar de al geïnstalleerde afhankelijkheden. De oorspronkelijke targets en
referentiebinary worden niet overschreven. Vereist deze behouden Linux-bronnen,
binaries en GUI-hulpmiddelen op deze pc; geen algemene installer/bouwroute.

```sh
python3 native/onderzoek/writer-desktopcache/voorbereiden.py
python3 native/onderzoek/writer-desktopcache/broncontrole.py
python3 native/onderzoek/writer-desktopcache/bouwen.py
python3 native/onderzoek/writer-desktopcache/controleren.py
python3 native/onderzoek/writer-desktopcache/fysiek.py
python3 native/onderzoek/writer-desktopcache/selectie.py
```

Elke bouwronde bewaart een eigen map. In deze ontwikkeling zijn vier opzetafkeuringen
behouden: één bestaande PDF-lettertypetest overschreed zijn ongewijzigde
vijfsecondenlimiet; de eerste bronlocatie viel onder een onbedoelde bovenliggende
Cargo-workspace; daarna wees de Rust-testaanroep naar de desktop- in plaats van
de native workspace; een eigen `gui.py` overschaduwde het inspectiepakket en is
hernoemd naar `fysiek.py`. De gerichte en volledige frontendherhalingen wijzigen geen
assertie/tijdgrens. De verplaatsing wijzigt geen workspace-manifest. De hervatoptie
`bouwen.py --hervat-bouwpoorten` neemt alleen de vijf geslaagde frontendpoorten
van controles-3 over na volledige broncontrole, met oorspronkelijke logs en
herkomst; zij slaat geen ongecontroleerde Rust-/bouwpoort over.

`controleren.py` vereist de volledige acht bouwpoorten, 1.850 geslaagde en tien
overal expliciet overgeslagen frontendtests, 28 ongefilterde kernregressies,
112 Python-tests en de exacte binary-/bronidentiteit. Geen GUI-acceptatie op
basis van een bouw alleen.

De fysieke invoerproef behoudt alle asserties van de eerdere passieve raster-
proef; alleen het repositorypad is van een vaste naar een afgeleide locatie
omgezet. Volgorde 49/50/50/49, echte toetsen, dezelfde bron en tekst, exacte
controle van 1.537 verhalen/3.329 teksten en documentpixels. Elk proces heeft
een eigen Xvfb-/DBus-/XDG-testomgeving en werkt op een documentkopie. Geen
profilering tijdens de rastermeting. De runner bemonstert daarnaast uitsluitend
de eigen procesboom op RSS, met afzonderlijke native-binaryherkenning. De
boomsom telt gedeelde pagina's dubbel en omvat de testomgeving; geen PSS,
harde RAM-grens of lekbewijs.

De selectieproef voert de bestaande echte toetsen-/selectie-/bewaar-/verwerpproef
uit, inclusief antwoorden vasthouden en later vrijgeven. De aanvullende
fasenroute gebruikt de al bestaande begrensde optionele invoermeting; zij is
geen vervanging van de vier passieve ronden. De 500-pagina-/herstel-/twintig-GC-
ronde, rijke plak-/lijstproeven en meerdere grote documenten worden niet op deze
kandidaat geaccepteerd: de fysieke snelheidsproef wijst hem al af. De aanvankelijk
voorbereide vervolgopzet blijft lokaal behouden, maar is niet uitgevoerd.

Geen officiële release, Windows/macOS-/editieacceptatie, herstel van alle oude
werkerfouten of volledige Rust-interface op grond van deze Linux-proef.
Exacte uitslagen en eventuele afkeuring staan in `docs/tests/writer-desktopcache.md`.

Uitkomst: 6,25% tragere fysieke invoer ondanks correcte bron-/documentpixels;
geen productiepatch of nieuwe testdownload. Zie het bewijsverslag.
