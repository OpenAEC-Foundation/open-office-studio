# IFCX opslaan en heropenen in Office

Writer, Spreadsheet en Presentation kunnen hun bewerkbare bron bewaren in een
zelfdragend `.ifcx`-bestand. Kies **Opslaan als → IFCX Office**. Open het bestand
later via het bestandsmenu, slepen of de bestandskoppeling. De inhoud bepaalt
welke editor nodig is; een IFCX met een rekenblad wordt geen tekstdocument
omdat de extensie voor alle drie hetzelfde is.

In de desktopapp wordt het gekozen IFCX-bestand het werkbestand. Ctrl+S werkt
dat bestand bij via dezelfde atomaire opslag, controle op externe wijzigingen
en toegangsrechten als gewone Office-bestanden. In de browser is opslaan een
download; de browser bevestigt geen schrijfactie naar het oorspronkelijke pad.

## Wat het bestand bevat

Dit implementeert de **bronlaag** van het
[Office-profiel 0.1.0-draft.1](ifcx-office-voorstel.md): de volledige DOCX-,
XLSX- of PPTX-bron, met bestandsnaam, inhoudstype, byte-aantal en SHA-256.
Macrobestanden gebruiken de overeenkomstige DOCM-, XLSM- of PPTM-bron. VBA
blijft bewaard en wordt niet uitgevoerd. Formules blijven onderdeel van het
werkboek; ze worden niet door alleen hun zichtbare uitkomst vervangen.

Een ongewijzigd geopend IFCX-bestand blijft bij Ctrl+S bytegelijk, inclusief
witruimte en onbekende uitbreidingen. Na een bewerking blijft de
documentidentiteit gelijk en krijgt de bron een nieuwe inhoudshash. Oude
bronnen blijven staan zodat onbekende verwijzingen niet stukgaan. Onbekende
velden, schema's en knooppunten blijven bij opslag behouden. Opslaan als
verandert de bestandslocatie, niet de identiteit van het ingesloten document.

Bij een gewone Office-bron zonder enige bewerking gebruikt de eerste
IFCX-opslag de geopende bronbytes. Na een bewerking wordt de actuele editor
opgeslagen, ook wanneer tussentijds al normaal is opgeslagen. De bestaande
rapportage en blokkering bij aangetoond engineverlies blijven gelden.

Wachtwoordbeveiliging versleutelt de **ingesloten Office-bron**; de
IFCX-kop, bronbestandsnaam en overige dossiermetadata blijven leesbaar.
Het wachtwoord wordt niet in het bestand of in voorkeuren bewaard. Voor een
gewijzigde versleutelde bron moet het opnieuw worden opgegeven. Van zulke
documenten worden geen onversleutelde herstelkopieën gemaakt.

Een bestaand dossier met eerdere onversleutelde bronnen kan niet achteraf
alleen bij de nieuwste bron worden beveiligd: oude inhoud zou leesbaar blijven.
De app weigert die opslag vóór het schrijven. Bewaar de actuele inhoud eerst
als DOCX, XLSX of PPTX, sluit en heropen die kopie en maak daarvan een nieuw
beveiligd IFCX-dossier.
Een dossier waarvan alle bronnen al versleuteld zijn, kan beveiligd worden
bijgewerkt; eerdere bronrevisies houden hun oorspronkelijke wachtwoord.

Vensteroverdracht neemt de IFCX-context en eventuele VBA-bytes mee. Een
herstelkopie van een onversleuteld IFCX-document bevat ook het dossier, zodat
herstel de onbekende uitbreidingen niet verwijdert.

## Begrenzing

- Eén Writer-, Spreadsheet- of Presentation-document per bestand.
- Hooguit 100 MB JSON, met samen hooguit 70 MB gedecodeerde bronnen en
  maximaal 1.000 knooppunten. Door bronhistorie kan een dossier groeien; als
  de grens wordt bereikt, mislukt opslaan zonder het oude bestand te vervangen.
- Alleen het zelfdragende Office-profiel: geen externe imports, overerving
  of compositie van dubbele nodefragmenten. Er worden geen bronnen van het
  netwerk opgehaald.
- De ingebedde Office-schema's moeten overeenkomen met het vastgelegde
  profiel. Bronhash, byte-aantal, canonieke base64, verwijzingen,
  documentsoort en inhoudstype worden vóór de editor gecontroleerd.
- Niet-eindige getallen en gehele getallen buiten het veilige
  JavaScript-bereik worden geweigerd, ook in onbekende uitbreidingen, zodat
  opslag ze niet stil afrondt.
- Gewone bronformaten en hun bestaande bewerkingsbeperkingen blijven gelden.
  Dit is geen zelfstandig IFCX-model voor alinea's, cellen of vormen en geen
  algemene IFCX-/IFC5-conformiteitsverklaring. De eigen bare paden volgen het
  bestaande Office-voorstel; de padnotatie wijkt af van het hoekhakenpatroon
  in de daar vastgelegde upstream-TypeSpec-bron.
- Email, Notition, Database en Planner vallen buiten deze opslagfunctie.

De bronlaag staat los van het parallelle native Rust-traject. Er wordt geen
standaardopslag omgeschakeld: bestaande Office-bestanden en voorkeuren blijven
bruikbaar.
