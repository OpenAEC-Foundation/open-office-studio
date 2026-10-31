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

## Verliesvrije referentie van de bestaande Writer

Een afzonderlijk Chromium-profiel opent de ongewijzigde webbundel van de
referentiesuite met het eigen voorbeelddocument. De viewport is 1058 × 892 bij
schaal 1, de taal Nederlands en het thema Forge. `Page.captureScreenshot` levert
de oorspronkelijke PNG. `Animation.setPlaybackRate(0)` vóór navigatie bevriest
de CSS-knipperfase; de gewone sluitknoppen sluiten documentmeldingen. Er worden
geen pixels vervangen, geen regio's gemaskeerd en geen beelden geschaald.

Twee opeenvolgende oorspronkelijke opnamen verschillen nul pixels. Deze
[referentie en herkomst](referentie-2026-W44.8/writer.json) is bruikbaar voor
één vaste toestand. De native Writer-opname gebruikt dezelfde documentbron,
viewport en het donkere thema. De [vergelijking](writer-alpha6-pixelcontrole.json)
meet 350.976 afwijkende pixels van 943.736, met nultolerantie. Dit is een
mislukte pariteitscontrole; met name lint, tabbladen, linialen en statusbalk
verschillen. Het is geen controle van alle interfacefuncties of documenten.
De eerdere JPEG-beperking van de in-app browser geldt nog steeds, maar verhindert
deze afzonderlijke oorspronkelijke PNG-route niet meer.

Het meegeleverde `scripts/maak-webreferentie.mjs` maakt dezelfde opname zonder
extra JavaScript-pakketten (Node 24 en een lokaal Chromium zijn vereist).
Een herhaling met dit script in een tweede nieuw profiel levert eveneens exact
dezelfde PNG-bytes en nul afwijkende pixels. De bundelversie en hashes staan in
het rapport; het script verifieert geen volledige buildherkomst.

## Build- en pakketcontrole

De lokale Linux-releasebuild slaagt in 25 minuten en 12 seconden. Het
uitgepakte pakket slaagt voor programmaversies, ZIP-CRC, SHA-256, bronhashes,
compileerinclusies en licenties. Codecommit
`7340c91f1f472d141b31c8d02c50a314e9defab9` wordt gecontroleerd in
[bouwronde 41155324619](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41155324619).
Linux en macOS zijn daarin gebouwd, getest en verpakt; Windows bouwt op het
moment van dit verslag nog. De afzonderlijke Linux-conversietaak slaagt.
De CI-uitvoer is aanvullend onafhankelijk teruggelezen: zes voorbeeldrondgangen
houden tekst, tabellen, celinhoud/formules en diatekst gelijk, drie PDF's hebben
de verwachte handtekening. Zie [metingen en omvang](conversie-2026-10-31-alpha6-ci.json).

Alle 27 lokale native beelden zijn pixelgelijk aan zowel Linux-CI als macOS-CI.
De [Linux-meting](nativebeelden-2026-10-31-alpha6-Linux.json) en
[macOS-meting](nativebeelden-2026-10-31-alpha6-macOS.json) bevestigen ook dat de
eerdere systeemfontafwijking van de notitiegrepen is verdwenen. Dit vergelijkt
native builds onderling; de hierboven vastgelegde vergelijking met de bestaande
Writer blijft rood. Schone installatie en fysieke GUI-bediening zijn hiermee
niet bewezen.
