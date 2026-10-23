# Vrije notitiepagina — 2026-W43.2

Gecontroleerd op 23 oktober 2026 in de productiefrontend op een afzonderlijke lokale testpoort.

## Automatisch

- TypeScriptcontrole en productiebuild slagen.
- 69 frontendproeven slagen. De nieuwe proeven controleren het lezen van versie 1 zonder overschrijven, behoud van inhoud bij de eerste opslag als versie 2, rondgang van posities en afmetingen, het weigeren van ongeldige coördinaten, zoeken en Markdown over meerdere tekstvakken, een lege vrije pagina en het herstellen van verwijderde tekstvakken.
- De bestaande controles voor opslaggebrek, gelijktijdige schrijvers, back-upimport, kalenderweek en export blijven groen.

## GUI

- Een bestaand profiel met notities uit de eerste uitgave geopend. De oorspronkelijke tekst, koppen, afgevinkte taak en notitieboeken verschijnen samen in één tekstvak per pagina.
- Een nieuwe sectie en pagina aangemaakt. Een tekstvak gevuld met een kop en alinea. Aan de hoek met de muis versmald van 560 naar 360 pixels; alle tekstvelden hebben voldoende hoogte voor hun volledige inhoud.
- Een tekstvak met de muis 40 pixels naar rechts en beneden versleept. Ongedaan maken herstelt de positie en behoudt de eerdere maatwijziging. Opnieuw voert de verplaatsing weer uit. Pijltjestoetsen met Shift zijn eveneens bediend.
- Bij 75% zoom door dubbelklikken op lege plaatsen twee nieuwe tekstvakken gemaakt. Een kop, twee taken en een aanvullende alinea ingevoerd. Een taak afgevinkt.
- Bij 75% zoom de formaatgreep 45 schermpixels horizontaal versleept: de opgeslagen breedte neemt correct met 60 documentpixels toe. De hoogtewijziging wordt eveneens opgeslagen.
- Een tekstvak verwijderd en met Ctrl+Z inclusief tekst hersteld.
- Een werkelijke volledige back-up gedownload en onafhankelijk als JSON gelezen. Formaatversie 2, drie tekstvakken, alle teksten en de exacte posities en afmetingen bevestigd. Na herladen en zoeken staan dezelfde maten en posities in de DOM.
- Navigatiepanelen verborgen voor een volledig breed blad. De drie tekstvakken zijn vrij naast elkaar geplaatst. Het [beeld](../screenshots/notities-vrij-2026-W43.2.jpg) is rechtstreeks uit deze werkruimte vastgelegd.
- De browserconsole bevat tijdens deze controles geen foutmelding.

## Grenzen

Dit controleert de browserbediening en de opslaglogica. Een schone native installatie en native bestandsdialoog zijn niet bediend. Handschrift, tekeningen, afbeeldingen, bijlagen, tabellen, cloudsynchronisatie en andere notitieformaten ontbreken. Vet en cursief gelden per alinea. Ongedaan maken is beperkt tot vijftig stappen binnen de geopende sessie.
