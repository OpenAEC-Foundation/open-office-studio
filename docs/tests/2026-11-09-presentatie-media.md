# Presentatiemedia — eerste stap voor #85

De knop **Invoegen → Video en audio** voegt een lokaal MP4-, WebM-, MP3-,
M4A- of WAV-bestand toe aan de huidige dia (maximaal 50 MiB per bestand).
Het pakket bevat het oorspronkelijke bestand, een PNG-poster, standaard
audio-/videorelaties, de Office 2010-mediarelatie en standaard tijdlijngegevens.
Toepassen valideert ook het uiteindelijke PPTX-pakket. Er is geen transcodering.

De dialoog biedt starten met een klik of automatisch, herhalen, volume,
een beginpositie en het aantal seconden dat van het einde wordt afgehaald.
Die laatste waarde is een duur, overeenkomstig `p14:trim/@end`, geen absolute
eindtijd. Bijsnijden verandert de mediabytes niet. Bij video kan een huidig
videoframe de poster vervangen. Een nieuwe poster krijgt een nieuwe relatie,
zodat een afbeelding die elders gebruikt wordt niet verandert. De ingevoegde
poster houdt zijn verhouding en past binnen 60% van de dia (audio: 14%).

Bekende media verschijnen in de voorstelling als HTML-video op de diageometrie
en audiobediening onderaan het diabeeld. Audiospelers delen één bedieningsstrook
zodat een later ingevoegde video hun bediening niet afdekt.
Zwart/wit scherm en einde voorstelling pauzeren media; een diawissel of sluiten
stopt en ontkoppelt de speler. Alleen lopende media gebruiken een interval
voor de bijsnijgrens (40 ms). Stilstaande spelers poll-en niet. De speler is
alleen op het publiekbeeld actief, of in de enkelvoudige/native presentatorweergave.
Een browser-presentatorvenster start geen tweede geluidsbron.

## Behoud en grenzen

Media staan onder `p:timing/p:tnLst/p:par/p:cTn/p:childTnLst` naast de
animatiereeks. `p:tnLst` heeft volgens het Open XML SDK-schema één root-`par`.
De animatie-editor bewaart de afzonderlijke herkende mediatakken exact en
kent bij herschrijven unieke nieuwe tijdlijn-ID's toe. Invoegen of aanpassen
van media bewaart de bestaande animatiereeks. Onbekende timing wordt niet
vereenvoudigd. Ongewijzigd toepassen retourneert de oorspronkelijke bytes en
herlaadt de editor niet. Gewijzigde gegevens herladen de presentatie en
beginnen een nieuwe undo-geschiedenis; de dialoog meldt dit vooraf.

De eerste bewerkbare subset is bewust beperkt tot onafhankelijke mediatakken
met eenvoudige klik-/automatische start, zichtbaar wanneer gestopt en optionele
oneindige herhaling. Andere bestaande structuren blijven bewaard en kunnen
waar mogelijk in de dialoog worden bekeken, met een melding dat instellingen
niet bewerkbaar zijn. Externe relaties worden nooit automatisch opgehaald.

Inline video is beperkt tot een gewone afbeelding bovenaan de objectvolgorde,
zonder groeps-/spiegelgeometrie of objectanimatie op die video. Anders blijft
de poster staan met een melding en is de preview via de mediadialoog bereikbaar.
Complexe triggers, afspelen over meerdere dia's, mediafades en onlinevideo
invoegen blijven vervolgwerk. Codecs hangen af van browser/WebView en platform;
een decoderfout meldt dat het oorspronkelijke ingesloten bestand behouden blijft.
Het afzonderlijke Tauri-publiekvenster ontvangt nog een statische poster;
de presentatorweergave meldt dit. Twee fysieke schermen en Microsoft PowerPoint
zijn niet gecontroleerd. #85 wordt dus niet gesloten.

## Uitgevoerde controles

- Zestien pakketproeven: invoegen, ongewijzigd toepassen, correcte tijdlijnroot,
  verhouding van de poster, unieke ID's, animaties/media in beide bewerkingsrichtingen,
  onbekende timing, extensies, interne/externe relaties, nieuwe gedeelde posters,
  enkele aanhalingstekens, bytebehoud van andere onderdelen en ongeldige invoer.
- Bestaande achttien animatieproeven blijven groen.
- Volledige suite: 179 bestanden, 2.044 geslaagd en 10 overgeslagen.
- TypeScript, productiebuild en de presentatievertalingen van alle negen
  aangeboden talen gecontroleerd.
- Echte productie-Chromiumproef op P3: ongeldige bestanden, ongeldige trim,
  WAV automatisch/herhalen/volume 35%/begin 0,5 s/einde 1,5 s afhalen,
  pauzeren/hervatten met zwart scherm, MP4 invoegen en afspelen, frame als poster,
  bewerkbare bestaande animatie, opslaan/heropenen en exact dezelfde WAV-/MP4-bytes.
- Tweede productieproef: MP3, M4A en WebM decoderen en spelen; starten op klik
  en stoppen bij een diawissel. MP4/WebM en M4A zijn lokaal synthetisch opgenomen;
  de MP3 is de sinusfixture uit de primaire Web Platform Tests-repository.
- Donker thema op desktop en 390 px mobiel visueel bekeken; bediening en
  invoervelden hebben eigen themakleuren.

De zelfstandige ontwikkelproeven staan in `.local/presentation-media-browser.mjs`
en `.local/media-extra.mjs`. Ze maken een tijdelijke localhost-server aan;
`const root` verwijst naar de productie-dist. Zij schrijven uitsluitend lokale
testbestanden/schermafbeeldingen. Het native rapport staat lokaal in
`.local/media-native-interop/report.json`.

## Native uitwisseling

LibreOffice 26.8.2.2 heeft het via de app opgeslagen PPTX geïmporteerd en weer
als PPTX geëxporteerd in 17,969 s. Met een geïsoleerd profiel, de gedeelde
ODF 1.3-profielinstelling en uitgeschakelde printerdetectie bleven beide
mediabestanden byte-identiek. Ook de twee `p14:media`-verwijzingen, de audio-/videotakken
en de bestaande ingangsanimering bleven aanwezig. Volume 35%, de begin-/eindtrim
en overige start-/herhaalinstellingen zijn daarmee niet als behouden bewezen:
`p14:trim` en `vol` ontbreken na deze conversie. Deze route is dus geen bewijs
van volledig afspeelbehoud voor #33/#36. De directe app-opslag bewaart ze wel.

Specificaties:
[CommonMediaNode](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commonmedianode?view=openxml-3.0.1),
[MediaTrim](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.mediatrim?view=openxml-3.0.1),
[Open XML SDK-schema](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_presentationml_2006_main.json),
[MP3-testfixture](https://github.com/web-platform-tests/wpt/blob/master/media/sine440.mp3).
