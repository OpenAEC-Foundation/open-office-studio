# Open Notities Studio

Notities is een ingebouwde module van Office Studio. Open deze vanuit Start. De module heeft notitieboeken, secties en pagina’s; de drie kolommen volgen die indeling. De bediening en het compacte lint gebruiken dezelfde OpenAEC-stijl als de andere modules.

## Sectietypen

Vanaf **2026-W43.4** kies je bij **Nieuwe sectie** het type **Canvas** of **Markdown**. Alle pagina’s in de sectie gebruiken dat type. Bestaande notities worden canvassecties.

- **Canvas**: vrij geplaatste tekstvakken met alinea’s, koppen en taken. Raster en zoom horen bij dit type.
- **Markdown**: een teksteditor met **Bron**, **Naast elkaar** en **Voorbeeld**. Koppen, vet, cursief, links, code, tabellen en takenlijsten verschijnen in het voorbeeld. Opmaakknoppen werken op de selectie; Ctrl+B, Ctrl+I en Ctrl+K voegen vet, cursief en een link toe. Taken worden in de bron met `- [ ]` en `- [x]` bewerkt.

Met **Bewaren → Markdown openen** voeg je een `.md`-bestand als nieuwe pagina aan de gekozen Markdownsectie toe. Bestaande pagina’s blijven staan. **Markdown** boven de pagina of **Pagina als Markdown** bewaart de oorspronkelijke Markdownbron, zonder toegevoegde titel, extra escapes of aangepaste regelafbrekingen. Een lege Markdownpagina kan ook als leeg bestand worden geëxporteerd.

De typekiezer bij de paginalijst en het potlood bij de sectie openen de sectie-instellingen. Een ander type maakt een **kopie**; de oorspronkelijke sectie blijft intact. Canvas naar Markdown neemt de inhoud over in leesvolgorde, inclusief koppen, opmaak en taken. Markdown naar Canvas neemt de volledige broncode over als tekstvakken. De bestaande indeling of Markdownbron wordt nergens stilzwijgend vervangen. Een nieuwe sectie annuleren laat geen lege sectie achter.

Het Markdownvoorbeeld gebruikt [react-markdown](https://github.com/remarkjs/react-markdown) met [remark-gfm](https://github.com/remarkjs/remark-gfm). HTML wordt niet uitgevoerd en externe afbeeldingen worden als tekstverwijzing getoond. Het voorbeeld is alleen lezen; de bron blijft bewerkbaar. Er geldt maximaal 500.000 tekens per Markdownpagina. Boven 100.000 tekens blijft de bron volledig beschikbaar, maar wordt het directe voorbeeld overgeslagen om de editor bruikbaar te houden.

## Schrijven en organiseren

- Maak een notitieboek of sectie met de knoppen in het lint. Geef de naam op in het venster. Het potlood bij een bestaand notitieboek of een sectie wijzigt de naam.
- Maak pagina’s, wijzig hun titel en schrijf in tekstblokken. Enter begint een nieuw blok, Shift+Enter een regel binnen hetzelfde blok. Backspace in een leeg blok verwijdert dat blok; er blijft altijd één blok over.
- De pagina is vrij in te delen. Dubbelklik op een lege plek of kies **Start → Tekstvak**. Een tekstvak kan meerdere alinea’s, koppen en taken bevatten. Sleep aan de bovenrand om het vak te verplaatsen; sleep rechtsonder om de breedte en minimale hoogte te wijzigen. Tekst blijft volledig zichtbaar wanneer meer hoogte nodig is.
- De verplaats- en formaatgrepen werken ook met pijltjestoetsen: één pixel per stap, tien met Shift. Escape annuleert een sleepbeweging. Het kruisje verwijdert het hele tekstvak. **Ongedaan maken / Opnieuw**, Ctrl+Z, Ctrl+Shift+Z en Ctrl+Y herstellen de laatste bewerkingen, inclusief verwijderde vakken. Er zijn maximaal vijftig stappen tijdens de geopende sessie; samenhangend typen vormt één stap.
- **Start → Navigatie** verbergt of toont de notitieboeken en paginalijst voor meer ruimte. **Beeld** bevat het raster en zoom van 50% tot 200%. Ctrl+Shift+F toont de navigatie en zet de cursor in het zoekveld.
- Kies een blok en gebruik Tekst, Kop, Vet of Cursief. De opmaak geldt voor het hele blok. Taak en Opsomming voegen een nieuw blok toe. Taken kunnen worden afgevinkt; Datum voegt de huidige datum toe.
- Zoeken doorloopt titels en tekst in alle notitieboeken en secties. Alle zoekwoorden moeten aanwezig zijn. Ctrl+Shift+F opent het zoekveld. Vastgezette pagina’s staan bovenaan.
- Prullenbak verplaatst een pagina naar de herstelbare prullenbak. Herstellen brengt deze terug. Er is geen opdracht om notities permanent te wissen.

## Bewaren en meenemen

Wijzigingen worden na 350 milliseconden automatisch in het lokale toepassingsprofiel bewaard. Ctrl+S schrijft direct. Bij een modulewissel worden nog wachtende wijzigingen eerst opgeslagen. De status onderaan bevestigt het resultaat; een opslagfout laat de huidige invoer staan en activeert de sluitbeveiliging.

In de browser is deze opslag gekoppeld aan het gebruikte adres en de poort. De desktopapp heeft een eigen profiel. Dit is geen cloudopslag of synchronisatie tussen computers. Een browserprofiel, applicatieprofiel of browsergegevens wissen kan deze lokale gegevens verwijderen. Maak daarom een back-up via **Bewaren → Back-up opslaan**. De desktop gebruikt een native bestandsdialoog en een atomaire schrijfactie; de browser vraagt een download aan.

Een `.openaec-notities`-back-up bevat alle notitieboeken en pagina’s, inclusief taken, opmaak en prullenbak. **Back-up toevoegen** of Ctrl+O leest dit bestand en voegt de notitieboeken toe. Bestaande gegevens worden behouden. Nieuwe identificaties en zo nodig een volgnummer bij de boeknaam voorkomen botsingen. Ongeldige, te grote en onbekende versies worden geweigerd. Het maximum is 10 MB per back-up, 100 notitieboeken, 5.000 pagina’s en 30.000 tekstblokken in totaal. De ruimte van het lokale profiel kan eerder vol raken; dan blijft exporteren beschikbaar.

Twee vensters mogen elkaars wijzigingen niet stilzwijgend overschrijven. Een schone werkruimte neemt een externe wijziging over. Bij eigen nog niet opgeslagen invoer wordt schrijven geblokkeerd en blijft die invoer staan; maak daarvan een back-up voordat je de lokale versie opnieuw opent. Onleesbare bestaande gegevens worden niet automatisch vervangen door een leeg notitieboek.

**Pagina als Markdown** bewaart bij een canvassectie de huidige titel, tekst, koppen, opmaak en takenlijst uit alle tekstvakken. De leesvolgorde is van boven naar beneden en bij gelijke hoogte van links naar rechts. Vrije posities en de volledige notitieboekstructuur blijven in het eigen back-upformaat behouden.

Vanaf weekuitgave 2026-W43.2 gebruikt de notitieback-up formaatversie 2, met posities, breedte en minimale hoogte per tekstvak. Oudere notities en back-ups van formaatversie 1 worden gelezen als één tekstvak per pagina. Alle alinea’s, taken, markeringen en titels blijven behouden. Vanaf 2026-W43.4 gebruikt de back-up formaatversie 3, met het sectietype en de Markdownbron per pagina. Formaatversies 1 en 2 worden gelezen als canvassecties, met behoud van alle bestaande inhoud en coördinaten. De oorspronkelijke lokale gegevens worden bij het lezen niet herschreven; de volgende geslaagde opslag schrijft versie 3. Oudere appversies kunnen deze nieuwe back-ups niet openen.

## Grenzen

De vrije canvaspagina ondersteunt tekstvakken met alinea’s en taken; tabellen horen bij Markdownsecties. Tekeningen, handschrift, OCR, ingesloten afbeeldingen, bijlagen, samenwerking, cloudsynchronisatie en andere notitieformaten worden nog niet ondersteund. Op het canvas gelden vet en cursief per alinea; Markdown kan losse woorden opmaken. Invoer is tekst en wordt nooit als HTML uitgevoerd. Tekstvakken kunnen elkaar overlappen; posities zijn begrensd op 10.000 pixels horizontaal en 20.000 pixels verticaal. Hoogte past zich aan de inhoud aan, ook wanneer de ingestelde minimumhoogte kleiner is.
