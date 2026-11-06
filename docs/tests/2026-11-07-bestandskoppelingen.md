# Bestandskoppelingen: bestaande uitvoering en werkelijke bouwcontrole

Vervolg op issue #25. De bestaande platformconfiguraties koppelen op Windows,
macOS en Linux dezelfde 31 extensies. De systeemroute verwerkt opstartargumenten,
het doorgeven vanuit een tweede Windows-/Linux-instantie en macOS-gebeurtenissen
`RunEvent::Opened` via dezelfde bestandsregistratie en pad-tokens.

## Native Linux gemeten

De eigen, ongewijzigde Tauri-app uit de statusbalkproef is gebruikt; eigen X11,
eigen profiel en uitsluitend synthetische bestanden.

1. Start met `Bestand met spaties %.xlsx`: precies één rekenbladtab actief.
2. Start hetzelfde programma met `Tweede document.docx`: tweede proces eindigt
   met 0; het bestaande venster opent het document met de verwachte negen woorden.
3. Bied het eerste pad opnieuw aan: het bestaande rekenblad wordt actief; er
   blijven precies twee documenttabbladen, naast Start.
4. Bewerk A1 naar 13 en druk Ctrl+S. Er verschijnt geen nieuwe bestandskiezer.
   Onafhankelijke ZIP/XML-controle leest A1 = 13 en de ongewijzigde T1 = 11 uit
   precies het opgegeven pad. Het tekstdocument blijft bytegelijk.

De proef wacht op de daadwerkelijk geladen documentstatus. Een eerdere
harnaspoging las die te vroeg na het zichtbaar worden van het tabblad; deze
meting telt niet mee. De geslaagde eindproef bevat geen vaste aanname over de
laadtijd. Alle eigen proefprocessen zijn daarna afgesloten.

De oorspronkelijke synthetische bronnen staan bij
[de statusbalkproef](statusbalk-passend); het werkelijk via Ctrl+S bewaarde
[rekenblad](bestandskoppelingen/Opgeslagen-rekenblad.xlsx) is afzonderlijk opgenomen.
[Gemeten stappen en hashes](bestandskoppelingen-controle.json).

## macOS-poorten in de bouwstraat

Tot deze wijziging controleerden de Python-proeven de configuratie, maar werd
de werkelijk gebouwde macOS-plist niet uitgelezen. De bouwstraat controleert nu
na het maken van de DMG ook de `.app`:

- Alle 31 extensies moeten met de juiste documentnaam, rol en rang voorkomen.
  Ontbrekende, dubbele en onverwachte extensies worden afgekeurd, evenals een
  UTI-lijst die de extensieregistratie kan verdringen.
- Een afzonderlijke native proef opent via LaunchServices eerst een rekenblad
  met spaties en `%` in de naam, en daarna een tekstdocument in de draaiende app.
  De proef geeft geen bestand rechtstreeks als programma-argument door. Zij
  controleert dat de echte webview-/systeembestandsroute beide paden verwerkt,
  precies één eigen app-proces draait en de bronbestanden gelijk blijven.
- Beide rapporten worden als macOS-pakketcontrole bij de workflow bewaard.
  De native proef draait uitsluitend op de eigen macOS-bouwrunner en stopt
  alleen processen met het exacte pad van de daar gebouwde app.

De native macOS-proef is in deze Linux-omgeving niet uitgevoerd. Een geslaagde
macOS-job op de exacte PR-versie is vereist voordat dit onderdeel wordt
samengevoegd of issue #25 wordt gesloten. Dit is geautomatiseerde bediening van
LaunchServices; er wordt geen handmatige Finder-proef geclaimd.

Alle **57 lokale Python-controles slagen**. De vijf nieuwe controles testen ook
de negatieve plistgevallen. De Linux-pakketcontroles behouden hun bestaande
controle van de werkelijke `.desktop`-bestanden, MIME-lijst en `Exec ... %F` in
DEB en AppImage. De applicatiecode voor de systeemroute is niet gewijzigd.
