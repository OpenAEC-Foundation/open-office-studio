# Native controle, 31 oktober 2026: alpha 6

**2026.44.9-alpha.6** voegt conversie-export toe aan de gedeeltelijke Rust-suite.
De referentie blijft 2026-W44.8. Alle tien acceptatiegebieden blijven open:
de suite heeft nog geen volledige functiepariteit of pixelgelijkheid.

## Export vanuit de native interface

De bestaande conversiekern is losgemaakt van de vensterhost als
`office-conversie`. De bron komt uit `src-tauri/src/conversie.rs` en `taal.rs`;
de conversiecatalogus, het profiel en acht foutentalen zijn meegeleverd.
De Tauri-opdrachten en instellingenadapter zijn verwijderd. De bestaande suite
blijft ongewijzigd. De nieuwe kern heeft geen webview of JavaScript nodig.

Writer biedt 13 exportkeuzes, Spreadsheet 12 en Presentation 9. De catalogus
bevat onder meer PDF, ODF, oudere documentformaten en CSV/TSV. De eigen
bronformaten en macrovarianten staan niet tussen deze conversiekeuzes.
CSV ondersteunt scheidingsteken, codering en bladnummer. TSV dwingt een tab af.
PDF ondersteunt paginabereik, bladwijzers en PDF/A-keuze.

Een exportplan bewaart de bronbytes op het moment van openen van de dialoog.
Een nog niet toegepaste tekstwijziging verhindert openen. Export maakt een
afzonderlijk bestand, weigert hetzelfde oorspronkelijke pad of een
gecanonicaliseerde alias en controleert de doelhash vóór en na conversie.
De bestaande beperkte race tussen hashcontrole en vervangen blijft gelden.
Annuleren, fouten en succesvol exporteren veranderen de documentopslagstatus
niet. De dialoog blokkeert achterliggende documentacties; benodigde antwoorden
van achtergrondtaken blijven wel verwerkt worden.

Een afzonderlijk proces gebruikt de geïnstalleerde kantoorruntime met een
tijdelijk gebruikersprofiel. Macro's staan uit en externe koppelingen worden
niet ververst. Na de tijdslimiet wordt de eigen procesgroep beëindigd.
Het draagbare pakket bevat deze externe runtime niet. Handmatige selectie
ervan in instellingen is nog niet overgezet.

De PDF-layout komt van de conversieruntime en kan verschillen van de native
documentweergave. Een aanwezige PDF/A-markering is geen volledige
standaardvalidatie. Ondersteunde filters bewijzen geen verliesvrije omzetting
van ieder mogelijk bronbestand. Overige import, afdrukken, versleuteling en
volledige formaatpariteit zijn nog open.

## Lokale controles

De reguliere werkruimteronde slaagt met **142 tests**. Zes proeven vereisen
een geïnstalleerde runtime en worden daarom standaard overgeslagen; deze zijn
daarnaast expliciet uitgevoerd en slagen lokaal. Vijf controleren de
conversiekern: detectie/versie, drie ODF-rondgangen, een document met grafiek,
alle catalogusfilters en eigen voorbeelden via ODF, oudere formaten en PDF.

De zesde runtimeproef bedient de echte native berichtenketen, het exportplan,
de bestandsdialooguitkomst en de achtergrondtaak. Een Writer-export levert
PDF; een Spreadsheet-export met komma en UTF-8-BOM levert de verwachte CSV.
Bronbytes en opslagstatus blijven gelijk. Dit is een integratietest van de
interfacecode, geen fysieke bediening van een systeemdialoog.

De voorbeeldrondgangen zijn onafhankelijk teruggelezen op alineatekst en
tabellen, celinhoud en formules, en diatekst. Dit is een beperkte inhoudsproef,
geen volledige stijl-, grafiek-, paginerings- of pixelcontrole. Ook de bestaande
onafhankelijke kernrondgang, vier Python-beeldcontroletests, rustfmt, Clippy met
waarschuwingen als fouten en de bronhashcontroles slagen.

De nieuwe Linux-CI-taak voert de conversieproeven uit met een geïnstalleerde
runtime. De gewone platformmatrix voert deze zes voorwaardelijke proeven niet
uit. De interfacetest met PDF en CSV is lokaal expliciet uitgevoerd.

## Schermen en resterende grenzen

De systeemfonttekens voor slepen en vergroten van notitieblokken zijn vervangen
door eigen SVG-iconen. De 27 schermopnamen komen uit de echte Iced-renderer;
de exportdialoog en aangepaste notitiegrepen zijn visueel bekeken. Vergelijking
met Windows en macOS moet nog bevestigen dat de eerdere tekenafwijking weg is.
Dit bewijst geen pixelgelijkheid met de bestaande webinterface.

De [alpha-5-corpusronde](corpus-2026-10-31-alpha5-release.json) blijft de laatst
vastgelegde volledige ronde van de 648 geselecteerde OOXML-bronnen:
578 geslaagd, 68 geweigerd en twee tijdslimieten. De documentkern is in alpha 6
niet gewijzigd. Dit is geen nieuwe corpusronde en de 918 overige manifestbronnen
blijven buiten die controle. De twee grote-documentproblemen blijven open.

Directe documentinvoer, de volledige modulelinten, herstelkopieën, overige
mailbediening, de database-interface, schone installers, echte GUI/IME- en
schermlezertests en de overige acceptatiepunten blijven noodzakelijk.
Een stabiele native vrijgave blijft daarom geblokkeerd.
