# Rust-interface met WebView

Deze migratieroute vervangt de interfacecode door Rust/Dioxus en behoudt de
bestaande HTML-klassen, CSS en interfacelettertypen. De documentkern blijft
`office-core`. De eerdere Iced-preview blijft beschikbaar als tussenstap.

```sh
cargo run --manifest-path native/Cargo.toml -p open-office-studio-webview --features desktop
```

Een bestaand document kan als pad worden meegegeven na `--`. Een ontwikkelserver,
Node of een internetverbinding is bij het starten niet nodig. De stijlen staan
in de binary. `stijlbronnen.json` bepaalt welke oorspronkelijke bestanden ook
in het herbouwbare bronpakket moeten zitten. WOFF2-bestanden en notices zijn
meegeleverd; de herkomst staat in `assets/bron.json`.

Op Linux zijn GTK 3 en WebKitGTK 4.1 nodig (`libgtk-3-dev`,
`libwebkit2gtk-4.1-dev`, `libxdo-dev`). Windows gebruikt WebView2; macOS gebruikt
de systeem-WebView. Installers en fysieke platformproeven zijn nog open.

Dit is een eerste aansluiting, **geen volledige migratie**. Start, titelbalk,
documenttabbladen, licht/donker, bestandskeuze, conservatieve opslag en de
eerste notitiebediening zijn aangesloten. Writer, Spreadsheet, Presentation en
losse EML-bestanden gebruiken voorlopig een documentbeeld met veldbediening;
hun oorspronkelijke editors en volledige linten moeten nog worden overgezet.
De database-interface en mailaccountinterface zijn nog niet aangesloten.

Ook Notities is nog onvolledig: slepen/vergroten, zoeken, hernoemdialogen,
rijke blokopmaak, Markdown-voorbeeld, automatische opslag/herstel en de
volledige toetsenbordbediening zijn nog open. Bewaren gebruikt de Rust-bron,
geen uit de DOM gereconstrueerd document. Vertraagde bediening is gebonden aan
documentidentiteit en navigatiegeneratie. Externe wijzigingen worden geweigerd.

De oorspronkelijke pixelreferenties blijven ongewijzigd. Dezelfde CSS gebruiken
is nog geen bewijs van pixelgelijkheid tussen verschillende WebView-engines.
De acceptatievlaggen in `native/docs/migratie.json` blijven daarom ongewijzigd.

De gepinde desktopinterpreter behandelt `inert=false` anders dan de SSR-renderer.
De schil laat het attribuut daarom volledig weg buiten een dialoog; de regressieproef
controleert de DOM-mutaties, naast de echte vensterbediening. De statische letterstijl
heeft een eigen component, zodat invoer die niet steeds opnieuw opbouwt.
Alpha 48 verplaatst ook openen, bewerken, navigeren en geschiedenis naar de gedeelde
`office_core::werker`. Het UI-model bevat bronkopieën en weergaven; geen `Sessie`.
Bestanden lezen en schrijven gebeurt buiten de UI. Geaccepteerde opdrachten worden
meteen in de seriële werkrij geplaatst; hun antwoordtaken blijven bij de hoofdscope.
Antwoorden worden per document in toelatingsvolgorde bevestigd, ook als een latere
future eerder wordt afgewacht. Een gesloten tab wordt niet door een laat antwoord
heropend. Openende tabs hebben al een vaste plaats en stelen later geen focus.

Gewone invoer behoudt haar bediening en generatie. Structuur-/navigatieacties
hebben een korte bedieningsbarrière; achtergronduitvoering en tabwissels blijven
mogelijk. Een geweigerd concept wordt pas vervangen nadat eerder geaccepteerde
invoer is bevestigd, zodat bron en zichtbare velden bij elkaar blijven horen.

Bewaren vraagt op zijn eigen plaats in dezelfde rij een onveranderlijke
momentopname. Dit omvat eerdere nog onbevestigde invoer en sluit latere invoer
uit. Alleen die bronhash wordt als bewaard bevestigd. Een lopende bewaaractie
blijft conservatief gewijzigd, ook bij Opslaan als van een ongewijzigde bron.
De sluitbeveiliging geldt dus tot de bestandsactie werkelijk is bevestigd.
Volledige rijke editors, linten en prestatie-/pixelpariteit blijven open.

Tekstvelden krijgen hun beginwaarde zonder elke ontvangen native update terug
naar de levende browserwaarde te schrijven. Dat voorkomt letterverlies bij snelle
invoer. Na navigatie of ongedaan maken krijgt de editor een nieuwe generatie,
zodat de Rust-bron dan wel opnieuw in de velden verschijnt.

Gerichte echte Linux-vensterproef (Python met python-xlib/Pillow, Xvfb,
xdotool, xauth en een afzonderlijke D-Bus-sessie):

```sh
python3 native/scripts/proef-webview-venster.py --programma native/target/debug/open-office-studio-webview --bron docs/voorbeelden/Notitieboek.json --uitvoer /tmp/office-vensterresultaat
```

De proef opent uitsluitend een eigen kopie in een afzonderlijk testscherm,
typt met 12 ms tussen tekens, controleert opgeslagen velden en bronexacte
undo/redo, heropent het bestand en controleert annuleren/verwerpen bij sluiten.
Meerregelige invoer gebruikt afzonderlijke Return-toetsaanslagen. Volledige
clientbeelden en negatieve resultaten blijven bewaard; geen maskers of
verklaring van volledige functie- of pixelgelijkheid.

Vijf modules via echte muis-/toetsenbediening, met een nieuw proces voor heropenen:

```sh
/usr/bin/python3 -m venv --system-site-packages .local/gui-python
.local/gui-python/bin/python -m pip install --ignore-installed -r scripts/gui/requirements.txt
.local/gui-python/bin/python native/scripts/proef-webview-documenten.py --programma native/target/debug/open-office-studio-webview --uitvoer /tmp/office-moduleproef
```

Deze proef gebruikt de gewone opdrachtregelopening en uitsluitend eigen kopieën
van de voorbeeldbestanden. Zij bewerkt een veld in Writer, Spreadsheet,
Presentation en Notities, controleert het bewaarde bronformaat onafhankelijk en
heropent alle vijf modules. E-mail is in deze preview alleen-lezen; haar volledige
MIME-bron moet bytegelijk blijven. De DOM-inspectie luistert alleen voor de eigen
proef op tijdelijke localhostpoorten. Dit is geen volledige editor-, account-,
database- of platform-GUI-acceptatie.
