# Rust-WebView alpha48: gedeelde documentwerker

Openen, bewerken, navigatie en geschiedenis worden buiten de UI uitgevoerd door
`office_core::werker`. De UI bewaart documentidentiteit, bronkopieën, weergaven en
opdrachtstatus, zonder eigen `Sessie`. Bestandslezen en -schrijven gebeuren via
de gedeelde achtergrondvoorziening. Geen UI-borrow blijft over een `await` bestaan.

## Volgorde en eigenaarschap

Elke toegelaten engineopdracht staat meteen in de seriële rij. Antwoorden worden
per document in toelatingsvolgorde verwerkt, ook wanneer hun futures omgekeerd
worden afgewacht. Gewone tekstinvoer blijft beschikbaar en houdt de levende
browserwaarde. Navigatie, geschiedenis en structuurbediening hebben een eigen
korte barrière. Late antwoorden verplaatsen geen focus, heropenen geen gesloten
document en plaatsen fouten niet bij een andere tab.

Een nieuwe tab reserveert haar plaats vóór het bestandslezen. Voltooien in een
andere volgorde verandert de oorspronkelijke tabvolgorde niet. De antwoordtaken
leven in de hoofdscope, zodat het verlaten van een kindbediening ze niet afbreekt.

Bewaren vraagt een `Stand` op zijn eigen plaats in dezelfde rij: eerdere invoer
zit erin, latere invoer niet. Alleen die bronhash wordt schoon gemeld. De bestaande
conservatieve schijfcontrole blijft gelden. Ook Opslaan als van een ongewijzigde
bron verhindert schoon sluiten totdat de bestandsactie werkelijk is bevestigd.

## Controles

De volledige Rust-werkruimte met desktopcode slaagt in één uitvoering op **488
tests**, met zes expliciet optionele tests overgeslagen. De kernproef controleert
dat `Stand` het actieve onderdeel en de geschiedenis intact laat. Tien nieuwe
werkrijproeven testen onder meer omgekeerde antwoorden, snelle concepten,
bewaarsnapshots tussen twee concepten, sluiten, foutbezit, navigatiebarrières,
openingsvolgorde en de sluitbeveiliging tijdens Opslaan als.

De extra echte componentproef houdt de werker tegen met een testklok. De
hoofdcomponent blijft bereikbaar terwijl de kindbediening verdwijnt. Na vrijgave
bevestigt zij het antwoord. De versie met een scoped antwoordtaak faalt hierop;
de hoofdscopetaak slaagt. De oudere opslaan-levensduurproef blijft ook slagen.

Twee verdere negatieve regressieproeven vonden de te vroege sluiting tijdens
Opslaan als en de omgekeerde tabvolgorde. De aangepaste bron slaagt op beide.
De bronpakketproef vond daarnaast ontbrekende gedeelde GUI-hulpbestanden; de
pakketlijst neemt ze nu bytegelijk op. Negen Python-proeven en de controle op
74 letterbestanden plus 16 stijl-/merk-/testbronnen slagen.

De afzonderlijke debugvensterproeven slagen voor 45 Notities-stappen en tien
inhouds-/sluitcontroles, plus tien bewaar-/heropenstappen over vijf modules. De
moduleproef opent eigen kopieën via de gewone opdrachtregel, typt met echte
X11-toetsen, bewaart vier bewerkte velden en de volledige alleen-lezen EML-bron,
en heropent alles in een nieuw proces. DOCX, XLSX en PPTX worden onafhankelijk
als XML-pakket teruggelezen. Een eerste proef vergeleek ten onrechte een letterlijke
XML-substring: een DOCX kan één tekst over meerdere opmaakruns verdelen. De
gecorrigeerde proef vergelijkt de samengevoegde tekst; het oorspronkelijke
negatieve resultaat blijft lokaal bewaard.

De afzonderlijke **geoptimaliseerde Linux-releasebuild** slaagt daarna op dezelfde
45 Notities-stappen en tien controles, plus alle tien vijfmodule-stappen. Het
[Notities-verslag](notities-release.json) en [moduleverslag](modules-release.json)
leggen de daadwerkelijke programma-/script-/bronhashes vast. De native beeldopnames
zijn volledig en ongewijzigd; zeven geselecteerde beelden staan bij dit verslag.
De [WebView-CI op a32b081](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41581980111)
slaagt op Linux, Windows en macOS, inclusief beide gerichte Linux-releasevensterproeven.
De afzonderlijke [bredere native-CI](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41581980043)
bouwt en test alle drie platforms succesvol, maar faalt daarna op de exacte
pakketbronvergelijking: Windows verandert de regelafbrekingen van de gedeelde
GUI-hulpbronnen. De bestaande Windows-checkoutproef is uitgebreid met de echte
hulpbronnen en reproduceert dit. Met expliciete LF-attributen slagen die proef
en alle negen Python-proeven lokaal. De nieuwe platformvergelijking blijft nodig.
De actuele
[meetgegevens en grenzen](rapport.json) onderscheiden debug, release en CI.

## Resterend

Dit is geen volledige migratie of pixelgoedkeuring. De oorspronkelijke rijke
module-editors en linten ontbreken nog in deze WebView-preview. E-mail is
alleen-lezen; account- en verzendbediening ontbreken. Database blijft laagste
prioriteit. De worker werkt serieel en kent geen annulering of voorrang: een zware
opdracht kan andere documenten laten wachten. Grote-plakprestatie, fysieke IME,
alle snelle muis-/toetswisselingen, installers en fysieke GUI-proeven op de andere
platforms blijven open. Alle dertig acceptatievlaggen blijven `false`.
