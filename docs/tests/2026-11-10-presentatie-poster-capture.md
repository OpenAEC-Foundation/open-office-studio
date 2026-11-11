# Asynchrone postercapture bij de juiste selectie houden (#345)

## Zelfstandige, gecontroleerde reproductie

De echte productiebrowser op Windows 11, Chromium, SDK 0.5.1 en bron
`2359ea60` bevestigt een race in de bestaande mediadialoog. Een opname van
een videobeeld wordt aangevraagd, waarna de gebruiker audio selecteert voordat
de PNG-callback voltooid is. Na voltooiing verschijnt Poster gereed bij de
audio. Dit levert één gereedmelding op waar nul wordt verwacht, zonder
JavaScript-paginafouten.

De proef houdt uitsluitend de native canvas-encodingcallback vast en laat
daarna de oorspronkelijke browserencoder gewoon werken. Het is een
gecontroleerde volgordetest via echte dialoogbediening; er wordt geen
natuurlijke encodervertraging of gebruikersscreenshot als bewijs geclaimd.
De oorspronkelijke applicatiebron is voor deze baseline ongewijzigd.

Open en gesloten issues zijn doorzocht op poster en capture/media. De
beschrijvingen van het passende brede #85 en het andere onderwerp #93 zijn
gelezen. Er is geen specifieke dubbele melding gevonden. #345 gebruikt de
bestaande labels `presentatie`, `bug` en `ui`. De integratiechat is vóór
bronwijzigingen geïnformeerd over deze exacte afgebakende claim.

## Eén ontbrekende eigenaarschapscontrole

De mediadialoog had al een request-ticket voor bestandsladen en selectiewissels.
`pakFrame()` gebruikte dat nog niet. Ook postercaptures krijgen nu zo'n ticket.
Een resultaat mag alleen worden toegepast als dat ticket nog actueel is én de
video nog dezelfde speler is. Een achterhaalde fout blijft bij zijn oude
aanvraag; een actuele encoderfout wordt nog steeds zichtbaar gemaakt.

Dit behandelt ook twee opnamen van dezelfde video: de laatste aanvraag wint,
ook als de eerdere encoder later klaar is. Er veranderen geen bronmediabytes,
instellingen, afspeelbediening, SDK, ODF-conversie of diavoorstellingsvensters.
De bestaande request-telling blijft ook bestands-/selectiewissels beschermen.

## Gerichte proef

```
node scripts/proef-presentatie-poster-capture.mjs dist path/to/source.pptx
```

Het optionele bron-PPTX is standaard de bestaande synthetische native
mediafixture. De proef gebruikt een eigen tijdelijke HTTP-poort, de echte
productiebundel en de bestaande mediadialoog. De PNG-callbackvolgorde wordt
gestuurd vanaf een native kliklistener op de captureknop; pixels worden met
de oorspronkelijke browserencoder verwerkt. De proef controleert:

- Een oude geslaagde capture wordt niet aan een nieuwe audioselectie gekoppeld.
- Een oude mislukte capture vervuilt de nieuwe selectie niet met een fout.
- Een actuele mislukte capture toont de bestaande foutmelding.
- Twee verschillende videobeelden worden aangevraagd en omgekeerd voltooid.
  De tweede aanvraag moet winnen. Verschillende PNG-hashes bewijzen dat dit
  geen vergelijking van toevallig identieke proefbeelden is.
- De winnende afbeelding blijft correct na Toepassen, echte app-opslag,
  downloaden en heropenen, zowel in het pakket als de heropende speler.
- De audioposter en beide ingesloten mediabestanden blijven bytegelijk.
- Er zijn geen JavaScript-paginafouten; de dialoog wordt visueel gecontroleerd.

De eerste gewijzigde Windows-iteratie slaagt in de vier hoofdgevallen,
inclusief echte opslag/heropening en bytecontroles. Ook de 25 bestaande
gerichte media-/naamtests, TypeScript en de productiebouw slagen.
Dit zijn iteratieresultaten; de definitieve commit en platformuitkomsten
worden na bevriezen in het PR-verslag en CI-artifacts vastgelegd zonder een
nieuwe broncommit na de eindcontroles te maken.

## Platformen en veilige overdracht

De bestaande workflow checkt expliciet dezelfde PR-head uit op Windows,
Linux en macOS en voert de nieuwe captureproef op iedere beschikbare host uit.
De bestaande gerichte tests, productievoorbereiding, TypeScript/webbuild,
native matrices en eerdere browserproeven blijven meedraaien. Rapporten
vermelden de commit, het platform, de schone/gewijzigde werkboom, de afzonderlijke
gevallen, de winnende posterhash en fouten. Een job zonder runner telt niet
als uitgevoerd.

Native Tauri-GUI en volledige distributie-/installatieacceptatie blijven
afzonderlijke integratiecontroles per platform. Een webbuild, CLI-rondreis of
browserproef bewijst die niet. De gewone desktopworkflow gebruikt een aparte
synthetische merge en vervangt de expliciete headvergelijking niet. Eventuele
brede Windows-time-outs in de eerder gemelde Writer-bibliografietest #305
blijven apart gerapporteerd en worden niet in deze scope aangepast.

De eigen vervolgbranch bouwt op bevroren PR #337 en blijft buiten de gesloten
intake van de huidige integratieronde. De eerdere PR's, huidige kandidaat en
`main` blijven ongewijzigd. De bron wordt vóór de gebruikersdeadline van 15:00
op 10 november 2026 vastgelegd en gericht aan de integratiechat overgedragen.
