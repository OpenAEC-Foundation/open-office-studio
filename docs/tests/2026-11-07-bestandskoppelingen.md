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
na het maken van de DMG ook de `.app`. Beide bundels worden expliciet gevraagd
(`app,dmg`), zodat Tauri de app na het maken van uitsluitend een DMG niet
opruimt vóór de controles:

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

Alle **58 lokale Python-controles slagen**. De zes nieuwe controles testen ook
de negatieve plistgevallen. De Linux-pakketcontroles behouden hun bestaande
controle van de werkelijke `.desktop`-bestanden, MIME-lijst en `Exec ... %F` in
DEB en AppImage. De applicatiecode voor de systeemroute is niet gewijzigd.

## Werkelijke macOS-plist en de RTF-groep

De controle op de gebouwde app ontdekte een afwijking die niet in de
JSON-configuratie zichtbaar was: de gebruikte Tauri-bundelaar leidt bij RTF
zelf `LSItemContentTypes = [public.rtf]` af. Die lijst stond bij de hele groep
van negen tekstextensies. Omdat macOS deze lijst voorrang geeft op
`CFBundleTypeExtensions`, konden de acht overige tekstformaten verdrongen
worden. De plist van de ongewijzigde openbare v2026.45.4-DMG bevestigt deze
registratie; de historische installer is niet vervangen.

Alleen op macOS krijgt RTF nu een eigen documenttype met dezelfde naam, rol en
rang. De overige acht tekstformaten houden hun extensieregistratie. De controle
van de werkelijke plist staat `public.rtf` uitsluitend bij deze afzonderlijke
RTF-registratie toe en blijft andere UTI-overrides weigeren. De negatieve proef
bevat ook de oorspronkelijke gemengde registratie. De controles op alle 31
extensies en gelijke platformdekking blijven behouden.

Bronnen: [Tauri: afleiden van inhoudstypen](https://docs.rs/tauri-utils/2.9.2/src/tauri_utils/config.rs.html)
en [Apple: CFBundleDocumentTypes](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundledocumenttypes).
De native macOS-controle moet deze aangepaste registratie nog op de exacte
PR-versie valideren voordat issue #25 gesloten kan worden.

## Afgeronde macOS-poorten op 7 november 2026

Beide controles slagen in de macOS Office-job op exacte PR-versie
`56c20a95bb20c41f59fc85879e3031cbcf936e36`. De werkelijke app heeft alle 31
verwachte registraties; de plist-hash is
`d8e5f858c89e6912a38f75999ad70d91d1c987329be0eccf8c4ea570e924d80d`.
LaunchServices verwerkt eerst het rekenblad met spaties en `%` bij starten en
daarna het tekstdocument in dezelfde draaiende app. De bronnen blijven gelijk,
er is precies één app-proces en het eigen proces wordt na afloop afgesloten.

De [ongewijzigde rapporten en herkomst](bestandskoppelingen-macos-2026-11-07)
zijn uit de [workflowrun](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42317423504)
overgenomen. Dit bevestigt de eerder voorbereide poorten; een handmatige
Finder-proef wordt hiermee niet geclaimd.
