# Paginametingen zonder revisies

De revisieoverlay vroeg bij iedere indeling en formaatmelding de afmetingen
van alle canvaspagina’s op, ook zonder zichtbare revisies. De vastgepinde
React-adapter slaat dit werk nu over als haar reviewlijst leeg is. Dan bestaan
geen paginametingen of actieve formaatwaarnemer voor deze overlay. Bij de eerste
revisie wordt de oorspronkelijke route weer actief; verwijderen van de laatste
revisie ruimt de geometrie en waarnemer op. Een gewijzigde zoom blijft behouden.

Vier gerichte proeven voeren de echte hookbron uit met bestuurde lifecycle-grenzen.
De oude route faalt op de lege 5.000-paginalijst en opruimen. De aangepaste route
slaagt, inclusief schaal-/bereikgeometrie, een koptekstrevisie zonder nieuwe
indeling en vernieuwde revisiebereiken. Na terugnemen van uitsluitend de nieuwe
lege-overlaygrens is de geïnstalleerde module bytegelijk aan de bewaarde eerdere
pakketbron. De actieve geometrieberekening is behouden.

De productie-GUI opent daarnaast een DOCX met twee echte XML-revisies. Beide
kaarten en hun geselecteerde verbindingslijn worden bediend bij 100% en 150%
zoom. Na de schuifanimatie blijven de kaarten binnen de documentwerkruimte.
Vervolgens worden alle revisies geaccepteerd en een gewone opmerking toegevoegd.
Onafhankelijke ZIP/XML-teruglezing bevestigt geaccepteerde tekst, afwezige
verwijderde tekst, geen revisiemarkeringen en behoud van de opmerking. Alle vijf
controles slagen zonder paginafouten. Deze aanvullende proef gebruikt Chromium.

Een eerste proef eiste ten onrechte twee verbindingslijnen zonder actieve
revisie. De gecorrigeerde proef klikt elke kaart aan en controleert haar lijn.
Een tussentijdse opname viel tijdens het schuiven en leek buiten beeld te staan;
de definitieve controle wacht op ten minste 250 ms stabiele kaartgeometrie.
Er is hiermee geen blijvende weergavefout aangetoond.

De echte Linux-app slaagt ook op acht controles van een verse 500-paginabron:
typen op pagina 500, selectie/Backspace, undo/redo, bewaren, alle 500 alinea’s
onafhankelijk teruglezen en in een nieuw proces heropenen. Dezelfde proefbytes
geven deze opeenvolgende vergelijking zonder gelijktijdige bouwbelasting:

| Grootheid | 45.12 | 45.13 |
| --- | ---: | ---: |
| Schermmetingen, inclusief vaste nawacht | 17.918 | 5.543 |
| Daarvan canvasmetingen | 13.565 | 1.483 |
| Veertien tekens, invoer plus bron-/golflijngereedheid | 4,037 s | 3,651 s |
| p95 van de frame-intervallen | 283 ms | 272 ms |
| Langste frame-interval | 303 ms | 283 ms |

**Dit is nog onvoldoende typcomfort en geen algemene snelheidsgoedkeuring.**
Een eerdere losse 45.13-ronde duurde 4,296 s, met een langste pauze van 407 ms.
Alle rondes staan in het verslag; er is geen uitschieter weggelaten om een
algemene versnelling te claimen. De teller loopt nog twee seconden door na de
afzonderlijk beëindigde invoer-/framemeting. Frame-intervallen zijn geen fysieke
beeldscherm-FPS. Invoerwachtrij en enginewerk moeten verder worden geprofileerd.

Alle **1.591 frontendtests in 142 bestanden**, TypeScript, productie- en native
Linux-bouw slagen. De Linux-workflows bewaren ook de nieuwe revisie-GUI-proef.
De browser wordt vóór de eerste suitecontrole geïnstalleerd. De volledige
Rust-/pixelmigratie, grote plakdocumenten en fysieke andere platforms blijven open.

Zie [alle meetgegevens, programma-/bronhashes en grenzen](2026-11-03-writer-revisiemeting.json)
en de ongewijzigde beelden op [100%](2026-11-03-writer-revisies-1.png),
[150%](2026-11-03-writer-revisies-1.5.png) en van de
[gewone opmerking](2026-11-03-writer-gewone-opmerking.png).
