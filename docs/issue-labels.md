# Labels voor issues

Elk issue krijgt ten minste één **onderdeel** en één **soort werk**.
Gebruik titel en beschrijving samen; de aanwezigheid van een woord is geen
bewijs dat een module betrokken is. Een gekoppeld issue of een mogelijke
herbruikbare component is op zichzelf geen reden om een extra module te labelen.

## Onderdeel

| Label | Bereik |
| --- | --- |
| `tekst` | Writer / tekstverwerker |
| `rekenblad` | Spreadsheet / Excel-achtige editor |
| `presentatie` | Presentatie-editor |
| `notities` | Notition, notitieboeken, secties en pagina's |
| `algemeen` | Suite, gedeelde functies, installatie, werkruimte en integratie |
| `agenda` | Agenda |
| `database` | Database Studio |

Gebruik `algemeen` voor gedeelde suitefuncties. Gebruik meerdere modulelabels
als een probleem specifiek die modules raakt. Presentatornotities horen bij
`presentatie`; celnotities bij `rekenblad`. Voor modules zonder eigen label,
zoals e-mail, gebruik je voorlopig `algemeen` en noem je de module in de titel.

## Soort werk

| Label | Gebruik |
| --- | --- |
| `bug` | Bestaande functionaliteit werkt verkeerd |
| `enhancement` | Nieuwe functie of verbetering |
| `documentation` | Documentatie maken of corrigeren |
| `onderzoek` | Onderzoek, validatie of technische routekeuze |
| `routekaart` | Planning en verzamelissues |

Meerdere soorten mogen samen als het issue aantoonbaar beide bevat. Gebruik
geen apart `bugfix`-label. Een nog niet gereproduceerde foutmelding kan `bug`
krijgen, maar vermeld de onzekerheid in de beschrijving.

## Aanvullende onderwerpen

- `ui`: knoppen, lint, dialogen, panelen, zichtbaarheid, toegankelijkheid of
  bediening staan centraal. Dit kan samen met `bug` of `enhancement`.
- `formaten`: openen, opslaan, import, export of bestandsbehoud staan centraal.
  Alleen de vermelding van een DOCX/XLSX/PPTX-bestand is onvoldoende.

Bestaande labels zoals `duplicate`, `question`, `help wanted`, `invalid` en
`wontfix` blijven bruikbaar als aanvullende aanduiding. Ze vervangen de
onderdeel- en soortlabels niet. Voeg prioriteiten pas na inhoudelijke triage toe.

## Voorbeelden

- Labels bij Writer-tabelknoppen verbeteren: `tekst`, `enhancement`, `ui`.
- Lettergroottepijltjes doen niets: `tekst`, `bug`, `ui`.
- Formule veroorzaakt een onbruikbare werkmapsessie: `rekenblad`, `bug`.
- XLS/XLSB import/export toevoegen: `rekenblad`, `enhancement`, `formaten`.

## Automatische controle

Gebruik het issueformulier, of geef labels mee via CLI/API. De workflow draait
bij aanmaken, heropenen, inhoud wijzigen en labels wijzigen. Bij ontbrekende
categorieën neemt hij geldige keuzes uit de vaste formuliervelden over. Daarna
controleert hij of onderdeel en soort aanwezig zijn. `UI / bediening: Ja`
voegt `ui` toe; `Bestandsformaten: Ja` voegt `formaten` toe.

De workflow raadt geen labels uit vrije tekst en verwijdert geen bestaande
labels. Een ontbrekende categorie wordt als fout in de Actions-run vermeld;
er worden geen automatische issuecomments geplaatst. Controleer na aanmaken
of de labels zichtbaar zijn en de workflow slaagt. De workflow heeft
`issues: write` nodig en wordt actief zodra hij op de standaardbranch staat.
Een mislukte controle blokkeert het aanmaken van een issue niet.
