# ODP/OTP: medianamen en bruikbare labels (#310)

## Afgebakend probleem

Op Windows met LibreOffice 26.8.2.2 en SDK 0.5.1 behouden ODP en OTP de
oorspronkelijke namen in `draw:frame/@draw:name`, maar de teruggekeerde PPTX
bevat acht lege medianamen in een proef met vier dia's. De bestaande
mediakeuzelijst toont daardoor lege opties. Dit is zelfstandig gereproduceerd
op de bevroren PR #304-basis `2afa8c7f`; geen afleiding uit een gebruikersmelding.

Deze vervolgstap herstelt uitsluitend namen en weergavelabels. Het herstel
gebruikt bestaande conservatieve koppelingen: dezelfde dia, SHA-256 van interne
mediabytes en geometrie binnen 0,1 mm. Beide kanten moeten eenduidig zijn en
het aantal dia's moet gelijk blijven. Externe verwijzingen worden niet opgehaald.
Alleen een lege PPTX-naam krijgt de beschikbare ODF-framenaam. Betekenisvolle
doelnamen, andere attributen, kinderen en ongewijzigde ZIP-onderdelen blijven
behouden. Er komt geen extra ODF-metadata voor namen.

Werkelijk naamloze media krijgen uitsluitend bij weergave een vertaald
audio-/videolabel met het vorm-ID. De keuzelijst, dialoogtitel en toegankelijke
spelernaam gebruiken dezelfde functie. De oorspronkelijke modelnaam blijft
leeg; opslaan maakt van een weergavelabel geen verzonnen oorspronkelijke naam.
Alle negen aangeboden interfacetalen hebben de twee nieuwe vertaalsleutels.

## Herhaalbare controles

- `odf-medianamen.test.ts`: 16 tests voor ODP/OTP, Unicode/XML-tekens, ontbrekende
  namen, bescherming van doelnamen, ambiguïteit, geometrie, mediabytes,
  ongebruikelijke volgorde, externe verwijzingen, ZIP-bewaring en engine-opslag.
- `mediaNaam.test.ts`: negen tests voor de aangeboden talen, onderscheid tussen
  audio/video en ID's, behoud van bestaande namen en geen mutatie van het model.
- Samen met media, volume en overgangen: 92 gerichte tests. De integratiechat
  beheert de brede combinatiecontrole; deze fix herhaalt die niet zelfstandig.
- `OOS_PRESENTATIE_ODF_VOLUME=1 python scripts/test-presentatie-odf.py` doet echte
  native ODP/OTP-rondreizen met het veilige strikte ODF-1.3-productieprofiel.
  De vier dia's bevatten elk een WAV en synthetische VP9/Opus-MP4. Namen met
  Japanse tekens, emoji, aanhalingstekens, `<`, `>` en `&` worden gecontroleerd,
  naast de bestaande volume-, bytes-, geometrie- en notitiecontroles.
- `node scripts/proef-presentatie-medianamen.mjs dist` gebruikt de echte
  ondersteunde browserroute: bestanden openen, beide mediatypen selecteren,
  labels en toegankelijke naam controleren, afspelen, opslaan en heropenen.
  Ook werkelijk naamloze media worden opgeslagen en opnieuw geopend; hun
  opgeslagen namen moeten leeg blijven. Rapport en screenshots staan in
  `.local/presentatie-medianamen-browser/`.

De eerste Windows-iteratie slaagt met 18 controles van herstelde namen,
vier fallbackcontroles en 18 playbacks, zonder JavaScript-paginafouten.
Dit is een voorproef op de gewijzigde werkboom. De definitieve commit en
platformresultaten worden in het PR-verslag en de CI-artifacts vastgelegd.

## Platformcontrole op hetzelfde codepunt

De workflow `presentation-odf.yml` checkt expliciet de PR-head uit op Windows,
Linux en macOS. Iedere host doet dezelfde gerichte tests, TypeScript en de
productiewebbuild, de bestaande ODP/OTP/FODP-overgangsmatrix en de native
ODP/OTP-mediamatrix. Linux voert bovendien de browserproef uit. De onafhankelijke
rapporten noemen de commit, het platform, de converterversie en de profielhash.
Lokale eindcontroles gebruiken dezelfde vastgelegde commit. CI-uitvoer en
rapporten worden als artifacts per platform bewaard; niet-uitgevoerde of
geblokkeerde controles tellen niet als geslaagd.

De browserroute opent PPTX; ODP/OTP-conversie vereist de desktopconverter.
Daarom bewijst de browserproef het werken met de daadwerkelijk geconverteerde
bestanden, niet ODF-conversie in een browser. De native matrix test de echte
converter via zijn CLI. Native GUI-bediening en het installeren/starten van
de volledige desktopdistributies moeten bij integratie afzonderlijk worden
gecontroleerd op Windows, Linux en macOS. Een webbuild of CLI-rondreis bewijst
die bediening niet. Er zijn geen Rust- of pakketwijzigingen in deze fix.

Deze branch volgt PR #304 voor volumeherstel en is voor een volgende
integratieronde. De huidige Windows-kandidaat en `main` blijven ongewijzigd.
FODP-medianamen, online media en verloren afspeeltiming vallen buiten #310;
de brede issues #33 en #85 blijven open.
