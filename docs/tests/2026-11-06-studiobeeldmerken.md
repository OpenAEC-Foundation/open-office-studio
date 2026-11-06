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
- De volledige app-set slaagt in 1.903 proeven, 164 bestanden; zeven bestaande
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

De zes eigen desktopproeven zijn afgerond, zoals hieronder vastgelegd. De
nieuwe normale installeruitvoer en de ondertekende vrijgave moeten nog worden
gecontroleerd. Daarom
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
Database-favicon blijft behouden. Na deze samenvoeging zijn de gezamenlijke app-set, typecontrole en alle zes
productievarianten opnieuw gecontroleerd.

## Werkelijke desktopweergave

[Zes native controlesets](studiobeeldmerken-2026-11-06/native/native.json)
leggen de werkelijk uitgevoerde frontendbronnen, opgehaalde beeldbytes,
24px-titelbalk, 32px-Over-weergave en versie 2026-W45.3 vast. De schermbeelden
per app tonen het Forge- en lichte thema, het Over-venster en de echte
Openbox/tint2-taakbalk. De door Linux aangeboden 32px-venstericonen zijn
RGBA-bytegelijk aan de eigen goedgekeurde afgeleiden. Office toont ook de
zes afzonderlijke module-ingangen. De 25 backendbronbestanden van de
proefbouw zijn bytegelijk aan deze repository.

De native frontend is die van commit `0bad08fd`; de daaropvolgende
correctie wijzigt uitsluitend de Windows-verpakking en de controles.
De proeven gebruiken bewust eigen app-id's, D-Bus, XDG-profielen en X11.
Alle proefprogramma's en X-servers zijn afgesloten. Dit zijn geen verklaringen
van reeds geïnstalleerde publieke pakketten. Een gehoste Writer-bouw met
`--base=./` slaagt eveneens in de controle op relatieve/offlinebronnen.

## Gevonden fout in de Windows-installer

Het uitpakken van de oorspronkelijke Windows-CI-uitvoer bewijst een verschil:
de zes icoonframes in het programma zijn correct, maar de buitenste
NSIS-installer gebruikt nog het standaardicoon. `bundle.icon` alleen is
onvoldoende. De platformconfiguratie en alle vijf variantconfiguraties
wijzen nu ook `installerIcon` en `uninstallerIcon` naar hun eigen ICO.

De bouwcontrole weigert ontbrekende of verkeerde installatie-/verwijdericonen.
Zes kleine werkelijk gecompileerde NSIS-proeven bevestigen dat alle
[icoonframes bytegelijk worden ingebed](studiobeeldmerken-2026-11-06/nsis.json).
De nieuwe PE-controle weigert de oorspronkelijke foutieve installer. De
normale Windows-pakketcontrole onderzoekt voortaan zowel de installer als
het ingepakte programma. De ondertekende uitgave installeert bovendien ieder
pakket en controleert ook de werkelijk aangemaakte uninstaller vóór verwijdering.
Deze laatste uitgavecontrole moet nog slagen; de kleine proeven voeren geen
installatie op een gebruikerscomputer uit.

De oorspronkelijke Linux-DEB bevat vier bytegelijke launcher-PNG's en de
juiste desktopverwijzing. Dit staat in de [Linux-pakketcontrole](studiobeeldmerken-2026-11-06/pakket-linux.json).
De [Windows-programmacontrole](studiobeeldmerken-2026-11-06/pakket-windows.json)
bewijst de zes correcte appframes; zij zegt niet dat de oorspronkelijke
installer al correct was. De eerste conceptbouw van .3 is daarom vóór
publicatie bewust geannuleerd. Er is daarbij geen .3-tag of download
gepubliceerd. De volledige app-set slaagt na het herstel in 1.903 proeven
(zeven bestaande corpusgevallen overgeslagen), de UI-typecontrole en alle
50 Python-proeven slagen.
