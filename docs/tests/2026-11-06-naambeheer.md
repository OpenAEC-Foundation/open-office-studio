# Naambeheer en aanvullen van naamdefinities

De bestaande Tauri-/webeditor heeft nu een naambeheervenster onder Invoegen en
Gegevens. Alle vijf criteria van #70 zijn geverifieerd. De eerdere navigatiefout
is na zes geslaagde platformcontroles gemerged via PR #162 als `c3e9acc7`;
zie de [platformcontrole](naamvak-platformen-2026-11-06.json).

De openbare installers van v2026.45.2 bevatten dit nieuwe naambeheer nog niet.
Het parallelle native interfacetraject #116 valt buiten de wijziging. PR #163
is na zes geslaagde platformcontroles gemerged; #70 is gesloten. Zie het
[platformbewijs](naambeheer-platformen-2026-11-06.json).

## Gedrag en acceptatie

| Criterium van #70 | Gecontroleerd gedrag |
| --- | --- |
| Bereik, constante of formule definiëren | Nieuwe naam begint met de geselecteerde absolute bladverwijzing; ook `=0.21` en `=SUM('Eerste'!$B$2:$B$3)` zijn aangemaakt. |
| Lijst, bewerken, verwijderen; werkmap of blad | Namen, definities, bereik en verborgen status zijn zichtbaar en doorzoekbaar. Definitie en bladbereik zijn aangepast; verwijderen vraagt bevestiging en is ongedaan gemaakt. |
| Namen in formules aanvullen | Bereiken, constanten en benoemde formules staan naast de functievoorstellen, met lokale voorrang. Namen worden zonder functiehaakje ingevoegd. |
| Namen uit selectiekoppen | Boven-, onder-, linker- en rechterkoppen zijn ondersteund. De getoonde voorstellen sluiten de kopcellen uit en worden als één geschiedenisstap toegepast. |
| Behouden bij openen en bewaren | Browserdownload en echte native bestandsopslag zijn heropend; tien naamdefinities, lokale scope, exacte formules en waarden blijven behouden. |

Bij bewerken blijft de naam zelf behouden; de verwijzing, scope en verborgen
status kunnen veranderen. Ingebouwde `_xlnm`-namen zijn afgeschermd. Verborgen
lokale namen schermen gelijknamige globale namen ook bij aanvullen af.

Nieuwe naamdefinities overschrijven geen bestaande naam binnen dezelfde scope.
Een verouderde definitie of gewijzigde bladindeling weigert de bewerking.
Ook wanneer lopende invoer tussen lezen en schrijven alsnog de werkmapversie
verandert, blijft de naamwijziging achterwege. Alleen-lezen wordt vóór en na het
wachten gecontroleerd. Een wijziging van de scope is één ongedaan-maakstap.

Een kopvoorstel gebruikt hooguit 5.000 kopcellen; de gegevenscellen worden niet
allemaal gelezen. Spaties en ongeldige naamtekens worden underscores. Niet-tekstuele
en lege koppen worden overgeslagen; overgeslagen niet-lege cellen worden vermeld.
Botsende namen geven een fout zonder bestaande definities te overschrijven.
Voor toepassen wordt de versie van het getoonde voorstel opnieuw gecontroleerd.

## Automatische en browserproeven

De 41 naamproeven gebruiken de echte XLSX-kern: bereik-, constante- en
formuleberekening, beide scopes, bewaren/heropenen, Undo/Redo, dubbele namen,
verouderde bewerkingen, wijzigende bladen, alleen-lezen en een versie die tijdens
wachten verandert. Ook `Ömzet`, `名前` en een naam met een punt zijn werkelijk
aangemaakt en in formules berekend. Vijf aanvullende proeven bewaken de
voorstellen, gelijknamige functies en namen, verborgen lokale definities en
niet-ASCII-invoer.

De volledige app-set slaagt met `vitest run --maxWorkers=2 --minWorkers=1`:
155 bestanden, 1.806 tests en zeven bestaande overgeslagen corpusgevallen.
Een eerdere gelijktijdige bouwronde bereikte bij twee bestaande Writer-proeven
de grens van vijf seconden. Beide bestanden slagen daarna afzonderlijk in acht
tests; de volledige ronde met twee workers slaagt zonder hogere tijdslimieten
of gewijzigde verwachtingen. Typecontrole, productie-/native bouw, de vijftig
Python-proeven en de vertaalcontrole slagen.

De browserproef bedient de productiefrontend via echte invoervelden en knoppen.
Zij maakt een bereiknaam, constante en benoemde formule, bewerkt de constante
en scope, verwijdert een naam en herstelt die met Undo. Daarna maakt zij vier
namen uit boven- en linkerkoppen. `=Tot` wordt aangevuld tot `=Totaal` en rekent
30; `=Facto` via F2 wordt `=Factor` en rekent de lokale waarde 3. Na de gewone
Opslaan-als-dialoog wordt de download in een herladen app geopend. Alle nieuwe
namen blijven aanwezig; er zijn geen browserconsolefouten.

Zie het [kopvoorstel](../screenshots/test-naambeheer-koppen-browser-2026-11-06.png),
[heropende naambeheer](../screenshots/test-naambeheer-heropend-browser-2026-11-06.png)
en de [browserwerkmap](naambeheer-browser-2026-11-06.xlsx).

## Native bediening, opslag en heropening

De Tauri-proef gebruikt een eigen applicatie-id, X11-server, D-Bus-sessie en
opslagprofiel. Alleen de synthetische
[bronwerkmap](naambeheer-bron-2026-11-06.xlsx) wordt gebruikt. Het harnas en de
bedieningscontroleurs slagen; de eigen app en X11-server zijn afgesloten.

Toets- en muisinvoer maken dezelfde bereiknaam, constante, formule en vier
kopnamen. Bewerken, verwijderen en Undo slagen. De formulebalk en de F2-invoer
vullen namen zonder haakje aan; de uitkomsten zijn opnieuw 30 en 3. Ctrl+S
schrijft naar het echte werkbestand en herstelt de schone bewaartitel.

De aanvullende ronde verplaatst `Tarief` van werkmap- naar bladbereik Eerste.
Daarna wordt de tab gesloten en dezelfde werkmap via de native bestandskiezer
heropend. De tien definities, lokale scope en waarden blijven behouden.
Onafhankelijke ZIP-/XML-controle bevestigt beide scopes van `Factor` (2 en 3),
de lokale `Tarief=0.25` en E2=`Totaal`/30 en E3=`Factor`/3.

Zie het [native kopvoorstel](../screenshots/test-naambeheer-koppen-native-2026-11-06.png),
[heropende native venster](../screenshots/test-naambeheer-heropend-native-2026-11-06.png)
en de [opgeslagen native werkmap](naambeheer-native-2026-11-06.xlsx).
Alle vier beelden zijn visueel bekeken.

De eerste automatische toetsinjectie klikte Opslaan voordat alle tekens van de
formule waren verwerkt. De app weigerde die onvolledige definitie. De definitieve
proef gebruikt een normaal toetsinterval en wacht op de volledige veldwaarde.
De native bouw leest een vaste frontendkopie, zodat een volgende frontendbouw
zijn invoerbestanden niet tussentijds kan vervangen.

## Herkomst en grenzen

De backend is ongewijzigd op `c3e9acc74827a7d83253cb740829dca1baa88892`.
De uit de native app opgehaalde editors-bundel heeft SHA-256
`581cd91ae62cad9de625582d94911aa0c6a24bf7461b77aabe4a727603f1cb40`.
De XLSX-kern blijft bytegelijk:
`385e2c53ddcbddded2060cb1d749b6c0e9b3b84f87f73290c71e82932271a702`.
Er is geen nieuwe kernelpatch of wijziging van rekenwaarden.

Het [gezamenlijke bewijs](naambeheer-native-2026-11-06.json) bevat de bron- en
assethashes, bediening, onafhankelijke bestandscontroles en opruimuitkomsten.
Nieuwe teksten zijn in Nederlands en Engels toegevoegd; andere talen gebruiken
volgens `docs/i18n.md` voorlopig de Engelse tekst. Er is geen afzonderlijke
moedertaalreview uitgevoerd. Native bediening is op Linux getest; Windows en
macOS krijgen hun controles in de PR.

## Platformcontrole en afronding

[PR #163](https://github.com/OpenAEC-Foundation/open-office-studio/pull/163)
is op 6 november 2026 gemerged als `6d19f37b853a486172e41f83f2030777007c6b0f`.
Alle zes controles op Windows, macOS en Linux zijn geslaagd voor broncommit
`10250154e1321a73c31919fa4a88576d9d929ba9`. Issue #70 is daarna gesloten en
alle vijf oorspronkelijke criteria zijn afgetekend. Het [platformbewijs](naambeheer-platformen-2026-11-06.json)
bewaart de bron, merge, uitkomsten en uiteindelijke issuebeschrijving.
De platformbouw vervangt geen afzonderlijke native bedieningstest op Windows
of macOS; de beschreven bediening is op Linux uitgevoerd.
