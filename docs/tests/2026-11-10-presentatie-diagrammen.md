# Diagramtekst en vormengroepen — eerste stap voor #86

Basis is de vaste integratiesnapshot `0d860e9d5487ff3b87dc079f943d31aef8fe5871`
met de publieke Presentation SDK 0.5.1. De uitbreiding verandert geen
slideshow-, notitie-, converter- of SDK-contracten.

## Bediening

**Invoegen → Diagrammen** biedt twee routes:

- **Nieuw diagram**: proces, cyclus of hiërarchie uit tekst. Het resultaat
  bestaat uit gewone PresentationML-vormen in een groep, met verbonden lijnen
  en bewerkbare tekst. Een proces/cyclus bevat 2–12 onderdelen; een hiërarchie
  één hoofdonderdeel, maximaal 24 onderdelen en vijf niveaus. Gebruik twee
  spaties of één tab voor elk hiërarchieniveau. Het structuurvoorbeeld volgt
  dezelfde posities en verbindingspunten als het opgeslagen diagram.
- **Bestaand diagram**: leest de SmartArt-datapunten van de huidige dia.
  Tekstbewerking werkt de brondata én gekoppelde opgeslagen tekening bij.
  De bestaande alinea-indeling en runopmaak blijven behouden. Een echt
  diavoorbeeld toont de wijzigingen vóór toepassen.

Een beschikbare eenvoudige opgeslagen SmartArt-tekening kan expliciet worden
omgezet naar een gewone vormengroep. Vorm- en teksttransformaties blijven
afzonderlijk behouden, ook bij `dsp:txXfrm`. De groep behoudt de oorspronkelijke
dia-object-ID; kinderen krijgen nieuwe unieke ID's. De oude SmartArt-pakketdelen
blijven aanwezig en andere diagrammen blijven ongewijzigd. De geselecteerde
groep heeft na deze keuze geen instelbare SmartArt-indeling meer.

Gewone groepen zijn via **Schikken** op te heffen. De bestaande groepsregels
blijven gelden: een verwijzing/animatie naar de hele groep of bijzondere
niet-visuele eigenschappen kunnen opheffen blokkeren, om die informatie te
bewaren. Een oude PowerPoint-modificatiestempel wordt bij omzetting verwijderd;
die stempel beschrijft het oorspronkelijke diagram en verhindert anders het
normale opheffen van de nieuwe groep. Overige niet-visuele gegevens blijven staan.

Toepassen van gewijzigde pakketgegevens herlaadt de presentatie en begint een
nieuwe undo-geschiedenis; de dialoog meldt dit vooraf. Ongewijzigd toepassen
retourneert dezelfde bytes en herlaadt niet. Nieuwe diagrammen worden op de
huidige dia geplaatst; bestaande tekst en andere objecten worden niet verwijderd
of automatisch verplaatst. Het structuurvoorbeeld toont alleen het diagram.

## Behoud en beperkingen

De koppeling naar tekenbuffertekst gebruikt `presOf` en de oorspronkelijke
model-ID's; uitsluitend `presAssocID` is onvoldoende. Meerdere runs behouden hun
opmaak, met nieuwe tekst verdeeld over dezelfde runs. Unicode-codepunten worden
niet tussen runs gesplitst. Velden, hyperlinks, afwijkende of slechts gedeeltelijk
te koppelen teksten blijven alleen-lezen. Gedeelde brondata of gedeelde
tekenbuffers worden niet gewijzigd. De dialoog meldt die grens.

Omzetting vereist een gewone, niet-geneste SmartArt-frame en een eenvoudige
opgeslagen tekening met maximaal 200 vormen, zonder gekoppelde media/afbeeldingen,
groepsgeometrie of SmartArt-deelanimaties. Onbekende constructies worden geweigerd;
er worden dan geen gewijzigde bytes toegepast. Een lege/ontbrekende tekenbuffer
kan wel tekstbewerking ondersteunen, maar nog geen omzetting.

Er is geen automatische reparatie van de bestaande SmartArt-weergave. In de
onderzochte Venn-fixture gebruikt SDK 0.5.1 de cirkelgeometrie voor de tekst,
terwijl de bron aparte `txXfrm`-tekstrechthoeken heeft. Na expliciete omzetting
worden die aparte rechthoeken correct als gewone tekstvormen weergegeven.
Een algemene rendercorrectie en bredere SmartArt-layoutondersteuning blijven
open binnen #86; de oorspronkelijke data worden hiervoor niet stilzwijgend
vervangen. Microsoft PowerPoint zelf is niet getest.

## Validatie

- 22 gecommitteerde proeven voor data/cache-koppeling, ongewijzigde bytes,
  run-/alineaopmaak, Unicode, gedeelde data, velden/hyperlinks, ontbrekende en
  gekoppelde caches, nieuwe ID's, afzonderlijke tekstgeometrie, native tekst,
  fontgrootte, lijnen/verbindingen, groepsopheffing en echte engine save/reopen.
- Volledige suite: 270 bestanden, **2.815 geslaagd, 10 overgeslagen**.
- TypeScript, productiebuild en alle negen aangeboden presentatievertalingen
  slagen. De proef draait op de 0.5.1-dependencies van de integratiebasis.
- Productie-Chromium: bestaande org-charttekst en twee alinea's bewerken,
  ongeldige alinea-aantallen, echt tekstvoorbeeld, opslag/heropenen,
  cacheconversie met tekstwijziging, alle drie nieuwe diagramtypen,
  ongeldige tekst/hiërarchie, behoud van diagramdelen, gedeelde-data-blokkade,
  390 px mobiel, Esc en donker thema. Geen browser-pageerrors.
- LibreOffice 26.8.2.2: SVG-vergelijking van originele en omgezette geneste
  cirkels toont behoud van vorm- en tekstplaatsing; invoer 15,484 s en
  omgezet 4,735 s. SVG-weergave voor deze vergelijking zet de door LibreOffice
  standaard verborgen dia zichtbaar, zonder de SVG-presentatiescripts uit te voeren.
- De drie via de app opgeslagen nieuwe diagrammen doorlopen PPTX → ODP → PPTX.
  Alle labels, verbindingslijnen en beide gekoppelde uiteinden blijven bewaard.
  **18 officiële ODF 1.3-pakket-/schemacontroles slagen**. Proces: 24,891/15,078 s;
  cyclus: 14,156/12,344 s; hiërarchie: 16,000/10,890 s. Dit bewijst uitsluitend
  deze nieuwe gewone diagrammen, geen volledig behoud van willekeurige SmartArt,
  overgangen of animaties via de ODP-route.

De native controles gebruiken een eigen tijdelijk profiel, het gedeelde
ODF 1.3-profiel en de twee printerdetectievariabelen uit de bestaande converter.
Elke conversie blijft onder dezelfde grens van 45 s; alleen eigen subprocessen
worden gestart en zo nodig beëindigd. De desktopapp en centrale checkout zijn
niet bediend of gewijzigd.

De lokale productieproef staat in `.local/diagram-browser.mjs`; alleen `const root`
wijst naar de dist. Deze maakt zelf een localhost-server met fonts. De twee
primaire fixtures staan lokaal in `.local/diagram-research/`. De nieuwe eigen
synthetische unitfixture vereist geen download. Native resultaten staan in
`.local/diagram-roundtrip/report.json` en `.local/diagram-native/report.json`.

Primaire bronnen:
[Microsoft CT_Shape, inclusief txXfrm](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/060cdb7c-1d52-4a9f-9319-bf1849c1f830),
[diagram layout](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/db259186-40a2-4e1e-89e5-92557363f03f),
[LibreOffice org-chart-fixture](https://github.com/LibreOffice/core/blob/master/sd/qa/unit/data/pptx/smartart-org-chart.pptx),
[LibreOffice Venn-/teksttransform-fixture](https://github.com/LibreOffice/core/blob/master/sd/qa/unit/data/pptx/smartart-tdf134221.pptx).
