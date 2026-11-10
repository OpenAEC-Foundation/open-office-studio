# Handmatig gepauzeerde autoplay behouden (#336)

## Afgebakende fout en reproductie

Een handmatig gepauzeerde autoplayclip begint ongevraagd opnieuw met afspelen
bij terugkeer van een zwart of wit scherm. Dit is één bedieningsfout onder
het open routekaartissue #85. Replay na het eindpunt is apart vastgelegd in
#325 en blijft in de bevroren PR #328 behouden.

De fout is zelfstandig bevestigd via de echte productiebrowser en de bestaande
diavoorstellingsroute op Windows 11, Chromium, SDK 0.5.1 en bron `27082918`.
De synthetische proef bevat een PCM-WAV en een VP9/Opus-MP4, automatisch
starten en herhalen, met een fade-overgang van 800 ms. De audio is handmatig
gepauzeerd op 0,166733 seconde. Na B, B en 300 ms wachten speelt hij ongevraagd
verder op 0,502907 seconde. Er zijn geen JavaScript-paginafouten.
Dit is een directe waarneming, geen afleiding uit een gebruikersscreenshot.

Open en gesloten issues zijn op media/pause, autoplay/pause en black/media
doorzocht. De beschrijving van #325 is gelezen: dat is een andere trigger
en reparatie. Er is geen specifieke dubbele melding gevonden. #336 heeft
de bestaande labels `presentatie`, `bug` en `ui`. De integratiechat is over
deze exacte claim geïnformeerd voordat de applicatiebron werd gewijzigd.

## Reparatie

`MediaSpeler` onthoudt per huidige bron of er daadwerkelijk met afspelen is
begonnen. Automatisch starten blijft beschikbaar voor de eerste actieve
weergave, ook als metadata tijdens de overgang geladen wordt. Een volgende
heractivatie hervat alleen een clip die vóór het inactief worden speelde.
De eerder handmatig gepauzeerde of voltooide clip blijft gestopt.

Een nieuwe bron leegt deze beginstatus; een nieuwe voorstelling maakt nieuwe
spelers en start autoplay opnieuw. Er veranderen geen opgeslagen mediabytes,
volume-, trim-, start- of herhaalinstellingen. De bestaande afhandeling van
expliciete replay na het einde blijft intact. Er is geen wijziging aan SDK,
converter, ODF-code of de venster-/schermopstelling van de voorstelling.

## Gerichte browserproef

```
node scripts/proef-presentatie-media-pauze.mjs dist path/to/source.pptx
```

Het bron-PPTX is standaard de bestaande synthetische native mediafixture in
`.local/presentatie-odf-volume/source-odp.pptx`. De proef maakt eigen kopieën
met de bestaande productieschrijvers, één met herhalen en één zonder. De
originele fixture wordt niet gewijzigd. Vite laadt uitsluitend de benodigde
modules in middlewaremodus zonder dependency discovery of watcher en wordt
weer gesloten. De productie-UI wordt via een eigen tijdelijke HTTP-poort geopend.

De proef gebruikt echt de lintknop Vanaf eerste dia, de voorstelling en B/W:

- Vier handmatige-pauzegevallen: audio/video, ieder zwart én wit. Positie en
  pauzestatus moeten bij terugkeer gelijk blijven.
- Vier hervatgevallen: audio/video die vóór B/W speelden, hervatten daarna.
- Twee eerste automatische starts met overgangsvertraging.
- Twee automatische starts na sluiten en opnieuw starten van de voorstelling.
- Twee voltooide clips blijven gestopt na zwart en terug.
- Geen JavaScript-paginafouten; de echte voorstelling is visueel te controleren.

De eerste gewijzigde Windows-iteratie slaagt in alle veertien controles, naast
25 bestaande gerichte media-/naamtests, TypeScript en de productiebouw. Dit
is een voorproef op de gewijzigde werkboom. Definitieve head en resultaten
worden na bevriezen in het PR-verslag en de artifacts opgenomen zonder een
nieuwe broncommit na de eindcontroles te maken.

## Platformen en overdracht

De bestaande workflow checkt expliciet dezelfde PR-head uit op Windows,
Linux en macOS. Naast de bestaande gerichte tests, productievoorbereiding,
TypeScript/webbuild en native matrices voert iedere beschikbare host de
replayproef én deze nieuwe diavoorstellingsproef uit. De rapporten vermelden
commit, platform, schone/gewijzigde werkboom, deelgevallen en fouten; ze staan
als artifacts per platform klaar. Een job zonder runner is niet uitgevoerd.

Native Tauri-GUI en de volledige distributie-/installatieacceptatie blijven
per platform afzonderlijke integratiecontroles. Een geslaagde browserproef,
webbuild of CLI-conversie bewijst die niet. De gewone desktopworkflow bouwt
op een aparte synthetische merge; die vervangt de expliciete headvergelijking
niet. De integratiechat beheert de brede gezamenlijke combinatiecontrole.

Deze nieuwe gebruikersopdracht volgt na de intakegrens van 13:15. De bron
staat daarom op een eigen vervolgbranch voor een volgende ronde. De eerdere
PR's en de huidige kandidaat worden niet gewijzigd. Voor de deadline van
15:00 op 10 november 2026 worden de bron en schone werkboom vastgelegd en
gericht overgedragen. `main` blijft ongewijzigd.
