# Diamodellen, indelingen, thema's en achtergronden (#77/#78)

Onder Dia staan drie nieuwe vensters. Diamodellen en indelingen kunnen worden
hernoemd en gekopieerd, met behoud van relaties naar media en andere onderdelen.
Ongebruikte indelingen kunnen worden verwijderd; gebruikte en laatste
indelingen worden beschermd. Een indeling kan op één, alle of een reeks dia's
worden toegepast. De hersteloptie verwijdert uitsluitend de eigen geometrie
van bestaande tekstplaceholders; tekst en eigen objecten blijven behouden.

Drie ingebouwde thema's hebben kleuren- en lettertypevoorbeelden. Alle twaalf
schemakleuren, kop-/tekstlettertypen en achtergrondkleur zijn aanpasbaar. Een
eigen thema kan op het apparaat worden bewaard en opnieuw gekozen. Toepassen
op een diareeks maakt onafhankelijke kopieën van de gebruikte diamodellen,
indelingen en thema's. Andere dia's houden hun oorspronkelijke relaties en
onderdelen. De IDs van gekopieerde indelingen zijn presentatiebreed uniek.

Achtergronden ondersteunen effen kleuren, een lineair verloop, PNG/JPEG en
terugkeer naar overerving. Naast dia's kan de gebruiker de huidige indeling
of het huidige diamodel wijzigen. Gekoppelde dia's erven die achtergrond
alleen als zij geen eigen achtergrond hebben. De vensters melden vooraf
dat pakketbewerkingen de presentatie herladen en een nieuwe ongedaanmaakgeschiedenis
beginnen. Wijzigingen aan een inmiddels veranderde editor worden geweigerd.

## Validatie

- 14 nieuwe tests met de echte PPTX-engine: relaties, unieke IDs, masterkopieën,
  gerichte wijzigingen, escaping, gebruikte indelingen, placeholdergeometrie,
  meerdere masters, drie thema's en kleur/verloop/PNG, inclusief bewaren/heropenen.
- Volledige suite op deze integratie: **2042 geslaagd, 10 bestaande skips,
  179 bestanden**, met twee workers en 15 seconden per test.
- TypeScript, Vite-productiebuild en i18n-controles geslaagd.
- `scripts/test-presentatie-ontwerp.mjs`: vijf Chromium-scenario's op de
  volledige productieapp. Indelingkopie op dia's 2–3, ongeldige reeks zonder
  wijziging, thema met aangepaste kleuren/lettertypen op dia 3, lokaal bewaard
  thema, verloop/masterachtergrond en PNG met echte Opslaan als-download en
  onafhankelijke heropening. Geen JavaScript-paginafouten.
- Donkere vensters en themavoorbeelden visueel gecontroleerd. Browserproeven
  vonden en verifieerden expliciete toegankelijke namen voor keuzelijsten en
  themaknoppen. De heropenproef wacht op de nieuwe editorinstantie.

De onderliggende OOXML-structuur volgt Microsofts documentatie over
[diamodellen](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-slide-masters)
en [indelingen](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-slide-layouts).

## Resterende criteria

#77 blijft open: een grafische diamodel-/placeholdereditor, logo's invoegen,
volledig opmaakherstel en een gecontroleerde ODP-rondgang ontbreken nog.
#78 blijft open: themakleuren in alle bestaande kleurkiezers, thema-uitwisseling
als bestand en de organisatiebrede huisstijlroute (#27) zijn nog niet afgerond.
Eigen thema's worden nu op het apparaat bewaard. Expliciete lokale opmaak van
bestaande tekst blijft bij themawijzigingen behouden. Native installatiepakketten
en ODP/PPT-conversies zijn hier niet opnieuw gebouwd of getest.

PR237 met dianummers/voetteksten is lokaal geïntegreerd; de gekoppelde velden
blijven zoals daarin gedocumenteerd opgeslagen waarden. Dit ontwerpwerk claimt
geen automatische veldverversing of levende koppeling van gekopieerde voetstijlen.
