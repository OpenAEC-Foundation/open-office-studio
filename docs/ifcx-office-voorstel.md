# Voorstel: IFCX voor de Office-studio’s

Status: **eerste OpenAEC-voorstel, profiel 0.1.0-draft.1, 30 oktober 2026**. Dit
document en het werkende bewaarvoorbeeld zijn nog geen opslagfunctie in de apps.
De installers van 2026-W44.8 behouden hun bestaande bestandsopslag.

## Doel en uitgangspunt

Eén verbonden dossier waarin teksten, werkmappen, presentaties, e-mails en
notities zelfstandige documenten zijn, met blijvende identiteiten en onderlinge
verwijzingen. Een e-mail moet zelf in IFCX kunnen worden bewaard, inclusief de
oorspronkelijke berichtbron en bijlagen. Een verwijzing naar een postvak of alleen
een leesbare kopie van de berichttekst is daarvoor onvoldoende.

We gebruiken de IFCX-alpha-envelop met `header`, `imports`, `schemas` en `data`,
en knooppunten met `path`, `children`, `attributes` en eventueel `inherits`.
Dit is een eigen Office-profiel, geen vastgestelde Office-module van
buildingSMART en geen IFC5-certificering. De alpha kan nog veranderen.
[Upstream-stand en beperkingen](https://github.com/buildingSMART/IFC5-development/tree/1a63082ada967c683cfacee2005f8f749c8e1b79),
[onderzochte TypeSpec-bron](https://github.com/buildingSMART/IFC5-development/blob/1a63082ada967c683cfacee2005f8f749c8e1b79/schema/ifcx.tsp).

Voor het experiment volgen bare paden de onderzochte openbare
[OpenAEC-profielconventie](https://github.com/OpenAEC-Foundation/ifccad/blob/2e8bd5ff45c33107f022d9abffcfd94dcc569305/schemas/ifccad/experimental-contract-0.2.0.md).
De upstream-TypeSpec toont bij zijn padpatroon hoekhaken; dit verschil moet vóór
een algemene interoperabiliteitsclaim expliciet met de gekozen kern worden
vastgelegd. Het voorbeeld claimt daarom uitsluitend geldigheid voor het
hieronder beschreven, begrensde bewaarprofiel.

## Twee lagen die samen worden opgeslagen

1. **Bronlaag:** de volledige oorspronkelijke bytes, inhoudstype, bestandsnaam,
   byte-aantal en SHA-256. Bij opnieuw openen zonder bewerking blijven deze bytes
   gelijk. Ook onbekende opmaak, macro’s en ingesloten onderdelen blijven zo
   beschikbaar; bewaren betekent niet dat de app ze kan uitvoeren of bewerken.
2. **Documentlaag:** een getypeerde structuur om te zoeken, koppelen en later
   rechtstreeks te bewerken. Bewaar bij elke afleiding de hash van de bron en de
   versie van de omzetter. Een afleiding van een oude bron is verouderd en mag
   geen nieuwe bron overschrijven.

De eerste uitvoerbare proef hieronder implementeert alleen de bronlaag en de
documentidentiteit. Volledige inhoudelijke modellen zijn vervolgstappen; een
ingepakte DOCX is nog geen zelfstandig bewerkbaar IFCX-tekstmodel.

| Studio | Documentstructuur in het voorgestelde inhoudelijke profiel | Volledig te bewaren bron |
| --- | --- | --- |
| Writer | Document → secties → alinea’s, tekstsegmenten, tabellen; stijlen, afbeeldingen, voetnoten, opmerkingen en wijzigingen | DOCX/ODT/Markdown of het werkelijk geopende formaat |
| Spreadsheet | Werkmap → bladen → cellen en bereiken; formule, getypeerde waarde, foutwaarde, getalnotatie, stijlen en grafieken | XLSX/ODS/CSV; geen omzetting van formules naar alleen hun uitkomst |
| Presentation | Presentatie → dia’s → vormen, tekst en media; diaformaat, posities, thema en sprekersnotities | PPTX/ODP plus ingesloten onderdelen |
| Email | Bericht → geordende headers, MIME-boom en bijlagen; threadverwijzingen en afzonderlijke postvakstatus | Oorspronkelijke EML/MIME-bytes, byte voor byte |
| Notition | Notitieboek → secties → pagina’s; canvasvakken met coördinaten/grootte, of letterlijke Markdown | Huidige `.openaec-notities`-gegevens en oorspronkelijke media |
| Database | Catalogus → tabellen, kolommen, relaties en queries; herkomst en uitleesstatus van modules | Oorspronkelijke database en aanwezige scripts; laagste prioriteit |

Elke bewerking die een nieuwe bron oplevert krijgt een nieuwe bronhash en
revisie. De identiteit van het document blijft gelijk; kopiëren maakt een nieuwe
identiteit. Verwijderen of herschikken verandert geen ids van andere onderdelen.
Onbekende knooppunten en attributen mogen niet ongemerkt verdwijnen bij opslaan.
Een editor die een verplicht onderdeel niet kan behouden, opent alleen-lezen of
biedt expliciet een afgeleide export aan.

## E-mail wordt werkelijk in IFCX bewaard

Het voorgestelde normale archief bestaat uit één `.ifcx` per bericht, niet uit
één voortdurend herschreven bestand voor een heel postvak. De EML zit in dat
bestand als base64-bronpayload. MIME bevat onder meer meervoudige berichtdelen
en bijlagen; heropbouw uit uitsluitend zichtbare velden is dus geen gelijkwaardige
bronbewaring. Zie [berichtformaat](https://www.rfc-editor.org/rfc/rfc5322) en
[MIME](https://www.rfc-editor.org/rfc/rfc2045).

- **Ontvangen:** haal de volledige bron op, maak en controleer IFCX, schrijf
  atomair en duurzaam, werk daarna de herbouwbare zoekindex bij. Een alleen
  gedownloade berichtkop heeft de status `incomplete`, niet `archived`.
- **Onveranderlijke bron:** behoud CRLF, gevouwen en herhaalde headers,
  transfercodering, oorspronkelijke tekensets, inline Content-ID’s en eventueel
  ondertekende of versleutelde MIME-delen. De bron nooit stil saneren of herschrijven.
  De HTML-leesweergave blijft een afzonderlijke afgeschermde afleiding.
- **Bijlagen:** de originele MIME-bron bewaart ze al. Uitgepakte bijlagen krijgen
  daarnaast een eigen inhoudshash en verwijzing naar het betreffende MIME-deel.
  Een uitgepakt document kan een zelfstandig Office-document worden; die
  bewerkbare kopie vervangt de oorspronkelijke bijlage niet.
- **Identiteit en threads:** gebruik een eigen blijvend document-id. `Message-ID`,
  `In-Reply-To` en `References` zijn bronvelden, niet gegarandeerd unieke lokale
  primaire sleutels. Onbekende of ontbrekende threaddoelen blijven expliciet
  onopgelost. IMAP-UID/UIDVALIDITY dienen alleen voor bron-/synchronisatiekoppeling.
- **Concept en verzonden bericht:** een concept krijgt revisies. Leg vóór
  verzending de werkelijk aangeboden MIME-bytes vast als `prepared`; registreer
  daarna `submitted`, `failed` of `uncertain`. Een crash rond SMTP mag geen
  automatische dubbele verzending veroorzaken. Een later opgehaalde serverkopie
  kan andere bytes hebben en wordt als afzonderlijke bronrevisie bewaard.
- **Status:** gelezen, vlaggen, mapindeling en lokale labels staan los van de
  berichtbron. Ze mogen die bronhash niet veranderen. SQLite mag zoeken en
  synchronisatie versnellen; het is niet de enige kopie van de e-mailinhoud.
- **Gegevens:** accountwachtwoorden, OAuth-tokens en sleutelhangergegevens horen
  niet in een IFCX-export. Het archief zelf bevat wel berichtinhoud en adressen;
  een gedeelde, geredigeerde kopie krijgt een eigen identiteit en hash.

De huidige backend heeft al `email::imap::bron` en de opdracht `email_bron` voor
de oorspronkelijke bytes. Dat is het aansluitpunt voor een volgende implementatie.
De bestaande `Bericht`-weergave met tekst, HTML en bijlagebeschrijvingen is geen
vervanging voor die bron. Dit voorstel schakelt de opslag nog niet om.

## Bewaarprofiel 0.1.0-draft.1

Profiel-id: `urn:example:openaec:office:0.1.0-draft.1`. Dit is een tijdelijke
experimentnaam, geen reeds geregistreerde of gepubliceerde standaard-URI.
Eigen schema-attributen gebruiken de namespace `openaec::office::`.

- Een dossierroot heeft `openaec::office::collection` met `profileVersion` en
  `title`; zijn `children` verwijzen naar documenten.
- Een document heeft `openaec::office::document` met `kind`, `title` en `source`.
  `kind` is `writer`, `spreadsheet`, `presentation`, `email`, `notition` of `database`.
- Een bronknooppunt heeft `openaec::office::payload` met `fileName`, `mediaType`,
  `byteLength`, `sha256`, `encoding: "base64"` en `content`.
- Bronpaden zijn `/office/payload/<sha256>`. Gelijke bytes kunnen binnen een
  dossier dezelfde payload delen. De hash bewijst byte-integriteit, geen afzender
  of juridische authenticiteit.
- Het kleinste mailarchief is een dossierroot, één document van `kind: "email"`
  en een volledige payload van `mediaType: "message/rfc822"`.
- De proef heeft geen imports, overervingen, dubbele nodefragmenten of
  conflictcompositie. Een proeflezer weigert die in plaats van ze half te verwerken.
  Dit beperkt de proef; het verbiedt zulke constructies niet in algemene IFCX.

De ingebedde `schemas` beschrijven deze attributen met IFCX-waardetypen. De
proefcontrole vult ze aan met bronhashes en verwijzingen. Zij is geen algemene
IFCX-validator, MIME-validator, documentrenderer of productie-importeur.

Voor kleine voorbeelden is één zelfdragende JSON handig. Voor grote dossiers is
een afzonderlijk versiegebonden pakketprofiel nodig met een manifest en blobs op
inhoudshash, bijvoorbeeld in een `.ifcx.zip`. Dat is nog geen definitief gekozen
container. De losse `.ifcx` moet in het eerste stadium offline volledig leesbaar
blijven, zonder stil gegevens vanaf internet op te halen.

## Werkend voorbeeld

[Genereer- en controleproef](../experiments/ifcx-office/proef.mjs) bouwt een
zelfdragend bestand met een Writer-, Spreadsheet-, Presentation-, Email- en
Notition-document. De drie kantoorbronnen zijn de bestaande lege templates.
De mail is volledig synthetisch en bevat een MIME-bijlage; de notitie bevat zowel
canvas- als Markdown-gegevens. Er worden geen echte postvakken of accounts gebruikt.

```sh
node experiments/ifcx-office/proef.mjs
```

De uitvoer staat in `.local/ifcx-office-voorstel/`. De proef opent het JSON-resultaat
opnieuw, vergelijkt iedere oorspronkelijke byte, controleert de verwijzingen en
weigert bewust een beschadigde bronhash, verkeerde byte-lengte, ontbrekende bron,
verkeerd gecodeerde base64, een onbekende profielversie en een e-mail zonder EML.
Een onbekend extra attribuut blijft bij de controle behouden. De proef controleert
niet of de apps deze nieuwe bestanden al kunnen openen.

Een [klein e-mailvoorbeeld](../experiments/ifcx-office/email-bewaarproef.ifcx) is
meegeleverd om de echte ingesloten MIME-bron direct te kunnen beoordelen. Het
grotere gecombineerde voorbeeld wordt gegenereerd, zodat de drie oorspronkelijke
templates niet nogmaals als base64 in de repository hoeven te staan.

## Voorgestelde bouwvolgorde en acceptatie

1. **Gedeelde Rust-bewaarkern:** getypeerd Office-profiel, begrensde offline
   import, exacte ids, onbekende velden behouden, hashes, atomair schrijven,
   herstel na schrijfonderbreking en expliciete profielmigraties. Sluit de
   envelop aan op de gekozen IFCX-kern; leg eerst de pad-/compositieafspraken vast.
2. **Email als eerste:** EML import/export en volledige berichtbewaring, daarna
   ontvangen/verzenden en oude mail migreren. Vergelijk de gereconstrueerde bron
   byte voor byte; test MIME-varianten, bijlagen, Unicode, ontbrekende ids,
   bronlimieten, offline gebruik en crashherstel. Geen bron verwijderen voordat
   het gecontroleerde archief en een herstelbare back-up bestaan.
3. **Writer, Spreadsheet en Presentation:** eerst de bestaande bron bewaren en
   opnieuw openen, daarna per inhoudelijke functie het native IFCX-model
   uitwerken. Aparte afspraken voor rich text, formules en coördinaten. Een
   formulecache krijgt een status en engineversie, geen ongefundeerde waarheid.
4. **Notition:** huidig canvas-/Markdown-model omzetten met behoud van tekst,
   blokposities, sectietypen, afbeeldingen en verwijzingen. De huidige back-up
   blijft beschikbaar als onafhankelijke herstelroute.
5. **Verbonden dossier:** verwijzen naar document, werkblad/celbereik, dia/vorm,
   bericht/bijlage en eventueel een extern modelobject. Externe bronnen krijgen
   een bron-id en revisie/hash; geen zoekkoppeling op alleen een zichtbare naam.
6. **Database later:** eerst behoud en gecontroleerd uitlezen; scriptbewaring en
   scriptuitvoering blijven afzonderlijke mogelijkheden.

Voor omschakeling van de standaardopslag moeten minimaal heen-en-terugproeven,
schrijffout/herstel, onbekende uitbreidingen, grote bronnen en native bestandsdialogen
op Windows, Linux en macOS slagen. IFCX-opslag lost de bestaande rekenkern- en
GUI-afwijkingen uit de [vrijgavecontrole](tests/2026-10-30-vrijgavecontrole.md)
niet automatisch op.
