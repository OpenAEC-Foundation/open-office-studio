# ODP/OTP: mediavolume behouden (#298)

## Reproductie en bereik

Een echte native ODP-rondreis op Windows met LibreOffice 26.8.2.2 verandert
een ingesloten WAV op 35% volume naar 100%. De MP4 op 100% blijft op 100% en
beide mediabestanden blijven bytegelijk. De ODP-plugin bevat `VolumeDB=0` en
`Mute=false`. De teruggekeerde PPTX bevat geen bijbehorende `cMediaNode`.
Deze meting gebruikt de huidige productielezer, SDK 0.5.1, een geïsoleerd
veilig productieprofiel en de bestaande proceslimiet van 45 seconden.

Deze stap herstelt uitsluitend volume en dempen voor eenduidig ingesloten
media in ODP en OTP. Trim, oorspronkelijk automatisch starten/herhalen,
FODP-media en online media vallen buiten #298. Die verliezen zijn geen
onderdeel van de hier geclaimde reparatie.

## Uitwerking

De gewone ODF-pluginparameters `VolumeDB` en `Mute` krijgen de broninstelling.
Een integer decibelniveau kan een lineair percentage niet altijd exact
uitdrukken. Daarom staat de precieze waarde daarnaast in een standaard
`meta:user-defined`-eigenschap, `OpenOfficeStudio.Presentation.MediaVolume.v1`.
Andere ODF-programma’s krijgen de gebruikelijke benadering in decibels; de app
kan bij direct heropenen het exacte niveau terugzetten.

De precisiegegevens gelden alleen bij dezelfde SHA-256 van `content.xml` en
`styles.xml`, en alleen voor een unieke koppeling op dia, mediabestands-hash en
geometrie. De tolerantie voor de native geometrieafronding is 0,1 mm. Andere
bestandsnamen zijn toegestaan; het mediabestand zelf moet gelijk zijn. Bij
externe wijzigingen worden de oude precisiegegevens genegeerd en tellen de
actuele pluginparameters. Dubbele/ongeldige metadata, externe verwijzingen,
onbekende transformaties en dubbelzinnige objecten worden niet als exacte
koppeling gebruikt. Er worden geen externe bestanden opgehaald. De metadata
is begrensd op 200 koppelingen en 65.536 tekens JSON bij het lezen.

Import wijzigt alleen `vol`/`mute` op bestaande PresentationML-medianodes.
Ontbreekt zo’n node na conversie, dan kan een minimale standaard mediatak
voor de bestaande media-afbeelding worden toegevoegd met de bestaande native
klikstart als uitgangspunt. Onbekende conflicterende timing wordt niet
omgebouwd. Er worden geen oorspronkelijke start-/herhaalkeuzes gegokt.
Andere onderdelen, notities, media en opmaak blijven behouden; ongewijzigde
ZIP-onderdelen worden gecomprimeerd overgenomen.

## Gerichte validatie op 10 november 2026

Eerste basis: bevroren PR #278, `ddb5c063`. Het vervolg is een eigen branch
voor de volgende integratieronde; de huidige Windows-kandidaat is ongewijzigd.

- 21 nieuwe tests: audio/video, 0/35/90/100%, afzonderlijk dempen met behoud van
  het niet-gedempte niveau, gedeelde mediabytes op verschillende posities,
  ambiguïteit, externe/stijlbewerking, ongeldige metadata, verkeerde media,
  onbekende timing, kindvolgorde, exacte ZIP-bewaring en echte engine-opslag.
- Samen met de bestaande overgangs- en mediatests: 67 gerichte tests geslaagd.
- De native matrix maakt vier dia’s met een WAV en een echte VP9/Opus-MP4
  per dia. Hun volumes doorlopen in beide richtingen 0, 35, 90 en 100%.
  De fixture is volledig synthetisch; zie de README bij de testbestanden.
- ODP: native export 10125 ms, import 8641 ms; zes officiële ODF 1.3-controles
  geslaagd; acht exacte volumes, mediabytes, geometrie en notitie behouden.
- OTP: native export 10812 ms, import 10657 ms; zes officiële ODF 1.3-controles
  geslaagd; dezelfde acht exacte volumes en behoudcontroles geslaagd.
- De echte PPTX-engine slaat de teruggekeerde bestanden op en opent ze opnieuw.
  Een onafhankelijke Python/XML-lezer controleert diarelaties, mediabytes,
  vorm-ID’s, `vol`/`mute` en de bewaarde presentatornotitie.

Herhalen: `OOS_PRESENTATIE_ODF_VOLUME=1 python scripts/test-presentatie-odf.py`.
De bestaande native ODF-workflow krijgt deze afzonderlijke gerichte matrix
naast de overgangsmatrix. Lokale invoer, uitvoer en rapporten staan in
`.local/presentatie-odf-volume/`.

## Controle op de bijgewerkte integratiebasis

De eigen branch is zonder conflicten bijgewerkt met de bevroren integratiebasis
`e9eabc3c`; mergecommit `58d6ae54`. Dit verandert de huidige Windows-kandidaat
niet. Alle 67 gerichte tests slagen ook op die combinatie. Beide native
terugkeerbestanden zijn opnieuw met de bijgewerkte productiemodule verwerkt:
opslag, heropenen, alle zestien volumecontroles en het behoud van media en
geometrie slagen. TypeScript en de Vite-productiebuild slagen.

Chromium op die productiebuild controleert achttien echte playbacks: audio en
video op elk van de vier teruggekeerde ODP- en OTP-dia’s, gevolgd door opslaan,
downloaden en heropenen met nog twee controles. Het werkelijke HTML-mediaelement
en de bestaande volumeslider hebben steeds exact de verwachte waarde. Video
decodeert op 320 × 180 pixels; ook bij volume nul loopt de afspeeltijd door.
Er zijn geen JavaScript-paginafouten. De dialoog is visueel gecontroleerd.

De MP4-samplebeschrijvingen bevestigen VP9 (`vp09`) en Opus. Een generieke
`video/mp4`-recorder kiest in deze Chromium-versie deze codecs; er wordt geen
H.264/AAC-compatibiliteit geclaimd. De proef onderzoekt volumebehoud en behoud
van de daadwerkelijk ingevoegde bytes.

[Native CI-run 42798379154](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42798379154)
slaagt op mergecommit `58d6ae54`, met zowel de bestaande overgangsmatrix als
de nieuwe volumematrix. Het gedownloade Linux-artifact bevestigt twee
volumerondreizen, twaalf geslaagde ODF 1.3-controles, zestien exacte volumes,
gelijke mediabytes en behouden notities. Export/import duurt daar
1431/1159 ms voor ODP en 1425/1202 ms voor OTP. Dit zijn metingen, geen
prestatietoezeggingen.

## Grenzen

Dit is geen bewijs voor ieder ODF-mediatype, gegroepeerde/geanimeerde
geometrie, de oorspronkelijke verloren start-/herhaaltiming of buitenlandse
bewerkingen die de precisiebinding ongeldig maken. Een afwijkend aantal
dia’s wordt niet gedeeltelijk gekoppeld. Hetzelfde bestand op exact dezelfde
positie met meerdere verschillende volumes is bewust dubbelzinnig en wordt
niet geraden. Fysieke native Windows-acceptatie blijft bij de integratiechat.
De brede issues #85 en #33 blijven open.

Een afzonderlijke observatie voor later: in deze native terugkeerbestanden
zijn de media-objectnamen leeg, waardoor de bestaande mediakeuzelijst geen
namen toont. Naam-/labelherstel is niet toegevoegd aan de volumefix.

Referenties: [standaard ODF-metadata en pluginparameters](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html),
[native VolumeDB/Mute-import](https://github.com/LibreOffice/core/blob/master/xmloff/source/draw/ximpshap.cxx).
