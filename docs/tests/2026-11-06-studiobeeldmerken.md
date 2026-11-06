# Studiobeeldmerken en voorbereiding 2026-W45.3

Bundel voor #165–#170. De zes goedgekeurde Store-PNG's en hun checksums staan
in de studiocatalogus; iedere app krijgt haar eigen bron, platformiconen en
favicon. De aparte Database-identiteit blijft behouden. De
[werkwijze](../beeldmerken.md) beschrijft reproductie en de bouwcontrole.

## Afgeronde bron- en bouwcontrole

- Twee genormaliseerde herbouwrondes leveren bytegelijk dezelfde 120
  platformbestanden en zes favicons op.
- Onafhankelijke pixelcontrole van alle zes ruwe CLI-uitvoeren bevestigt dat
  uitsluitend de vier bijna-transparante alphakanalen op 24 px wijzigen.
  Alle RGB-waarden en alle overige pixels blijven gelijk. PNG- en ICO-hoeken
  op 24/32/48 px zijn volledig transparant; de ICNS-bestanden openen correct.
- De volledige app-set slaagt in 1.902 proeven, 164 bestanden; zeven bestaande
  corpusgevallen zijn overgeslagen. De definitieve UI-typecontrole slaagt.
- De daaropvolgende metadatawijziging naar 2026-W45.3 slaagt in de
  versiecontrole en 29 gerichte versie-/configuratie-/assetproeven.
- Alle zes productievarianten zijn gebouwd. Hun HTML verwijst naar de
  juiste eigen favicon en bevat de bijbehorende productnaam.
- Appnamen, programma-/app-id's, modules, bestandstoewijzingen, profielen en
  updaterinstellingen zijn inhoudelijk gelijk gebleven. Alleen
  beeldmerkgegevens, icoonpaden en de gezamenlijke versiemetadata wijzigen.

Zie de [controlegegevens](studiobeeldmerken-2026-11-06/controle.json) en de
[onafhankelijke pixelvergelijking](studiobeeldmerken-2026-11-06/pixels.json).

## Openstaande vrijgave

De werkelijke native weergave, launcher-/taakbalkiconen en normale
installeruitvoer moeten nog afzonderlijk worden gecontroleerd. Daarom
blijven de zes issues open en is er nog geen nieuwe publieke downloadlink
voor deze beelden. De reeds gepubliceerde 2026-W45.1/45.2-installers blijven
ongewijzigd beschikbaar.

2026-W45.3 wordt voorbereid met het gemergede naambeheer (#163),
werkmapregio/getalnotatie (#164), nootomzetting (#171), PDF-koppelingen
(#172) en deze eigen app-identiteiten. De brede issues #37 en #51 blijven
open voor hun resterende criteria. Het parallelle native interfacetraject
#116 wordt niet meegenomen.

## Samenvoeging met de gelijktijdige bronronde

PR #173 levert dezelfde goedgekeurde masters en versie 2026-W45.3. Die
commit is opgenomen in deze branch. De oorspronkelijke bronadministratie
blijft behouden; de Python-ingang en de Node-ingang voeren dezelfde
gecontroleerde pipeline uit. De oude Office-iconenmap wordt als
compatibiliteitskopie bijgehouden. De faviconkeuze gebeurt één keer in
Vite en wordt niet achteraf door de variantbouwer vervangen. De generieke
Database-favicon blijft behouden. Na deze samenvoeging worden de gezamenlijke
app-set en productievarianten opnieuw gecontroleerd.
