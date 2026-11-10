# Media opnieuw afspelen na het eindpunt (#325)

## Reproductie en afbakening

Onder het open routekaartissue #85 is één concrete bedieningsfout bevestigd:
een tweede afspeelpoging na het volledige of ingekorte einde stopt direct
opnieuw. De reproductie gebruikt de echte productiebrowserroute op Windows 11,
Chromium en bevroren bron `a7669b86` van PR #316. Een synthetische WAV van twee
seconden stopt op 1,97 seconde. Na opnieuw Play en 300 ms wachten is de speler
weer gepauzeerd op 1,97, zonder JavaScript-paginafout. De werkboom bevatte toen
alleen de nieuwe proef; de gebruikte productiebundel was ongewijzigd.

Open en gesloten meldingen zijn op replay, trim/playback, media/end en opnieuw
afspelen doorzocht. #85 en de aparte ODF-volumezaak #298 zijn gelezen; er is
geen specifieke dubbele melding gevonden. #325 is als `presentatie`, `bug`
en `ui` vastgelegd. De bestaande integratiechat is vóór bronwijzigingen
geïnformeerd over de exacte scope en claim. PR's #304 en #316 blijven bevroren.

Deze reparatie verandert uitsluitend de afspeelbediening. Opgeslagen media,
timing, volume, codecs, ODF-conversie en de diavoorstellingsopstelling worden
niet gewijzigd. Dezelfde bestaande speler wordt gebruikt in de mediadialoog
en diavoorstelling; een native GUI-controle daarvan blijft afzonderlijk nodig.

## Gedrag van de reparatie

De speler onthoudt alleen een door zijn eigen grensbewaking veroorzaakte
eindstop: de werkelijke stilstaande positie en het toenmalige eindpunt.
Bij een volgende Play wordt alleen vanaf diezelfde positie en met hetzelfde
eindpunt naar het actuele ingestelde begin gesprongen. De vergelijkingstolerantie
is één milliseconde. Normaal pauzeren/hervatten en bewust terugspoelen behouden
hun afspeelpositie; een verlengd eindpunt maakt doorspelen mogelijk.
De eindstopgegevens worden bij een nieuwe bron leeggemaakt. Er wordt niet
al bij het stoppen naar het eerste beeld teruggesprongen.

## Gerichte controle en herhalen

`scripts/proef-presentatie-media-herstart.mjs` opent een echt PPTX via de
ondersteunde browserroute en bedient de bestaande mediadialoog. De standaard
invoer is het bronbestand van de bestaande native mediamatrix, met een
twee-seconden-WAV en een synthetische VP9/Opus-MP4.

```
node scripts/proef-presentatie-media-herstart.mjs dist
```

Een tweede argument kan een andere productiebundel aanwijzen en een derde
argument het proef-PPTX. De baselineproef faalt op de ongewijzigde PR #316-
bundel bij het opnieuw afspelen. De eerste gewijzigde Windows-iteratie slaagt:

- Audio en video, ieder met volledig en ingekort einde: vier replaygevallen.
- Alle vier controleren daarnaast normaal hervatten en bewust terugspoelen.
- Beide ingekorte gevallen controleren het verlengen van het eindpunt.
- Audio en video herhalen ieder ten minste twee volledige cycli.
- Geen JavaScript-paginafouten; de bestaande dialoog is visueel gecontroleerd.
- 25 bestaande gerichte media-/labeltests, TypeScript en de productiebouw slagen.

De proef wacht op echte afspeelvoortgang in plaats van een vaste laadtijd.
Rapport en screenshot staan onder `.local/presentatie-media-herstart/`.
Dit zijn iteratieresultaten; de definitieve commit, CI-resultaten en eventuele
blokkades worden na bevriezen in het PR-verslag vastgelegd zonder een nieuwe
broncommit te maken.

## Platformen en overdracht

De bestaande ODF-workflow checkt expliciet dezelfde PR-head uit op Windows,
Linux en macOS. Alle hosts doen de gerichte tests, TypeScript/productiebouw
en bestaande native matrices; de nieuwe browserproef wordt eveneens op alle
drie hosts uitgevoerd zodra er een runner beschikbaar is. Linux voert ook de
bestaande naam-/labelproef uit. Ieder nieuw browserrapport legt codepunt,
platform, schone/gewijzigde werkboom, de afzonderlijke gevallen en fouten vast.

Een browserproef of geslaagde bouw bewijst geen native Tauri-GUI-bediening,
installatie of volledige pakketacceptatie. Die controles blijven per platform
zichtbaar open voor integratie. Een macOS-job zonder runner telt niet als
uitgevoerd. De gewone volledige desktopworkflow draait automatisch op een
synthetische merge; dat andere codepunt vervangt de expliciete headvergelijking
niet. De brede combinatiecontrole blijft bij de integratiechat.

Deze eigen vervolgbranch volgt PR #316 en blijft buiten de huidige
acceptatiekandidaat. De gebruikersdeadline is 15:00 op 10 november 2026;
de bron en eigen werkboom worden daarvoor veilig vastgelegd en overgedragen.
