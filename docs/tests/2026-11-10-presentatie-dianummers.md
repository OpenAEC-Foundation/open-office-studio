# Dianummers na herschikken (#87)

## Afbakening

De PPTX-engine 0.5.1 bewaart de tekst van `a:fld type="slidenum"` zoals
die in het document stond. Na het verplaatsen van dia 3 naar het begin levert
native opslaan de opgeslagen nummers 3, 1, 2 op. Deze stap corrigeert de
opgeslagen veldtekst volgens de actuele `p:sldIdLst` en `firstSlideNum`.

Beide PPTX-opslagroutes in `editors.tsx` passen de correctie toe na
`flushPendingInput()` en `await api.save()`. Een API-wrapper die notitieconcepten
bij het opslaan invoegt, wordt dus eerst uitgevoerd. De editor wordt hiervoor
niet opnieuw geladen en zijn undo-geschiedenis wordt niet aangepast.

Alleen bestaande dianummervelden in dia-tekstvormen worden aangepast, ook in
groepen en Markup Compatibility-takken. Er worden geen velden toegevoegd.
Verborgen dia’s tellen mee. De volgorde komt uit de relaties, onafhankelijk van
de bestandsnaam van de dia. Gewone tekst, datumvelden, opmaak, veld-ID’s,
modelonderdelen, notities en andere bestanden blijven behouden. Ongewijzigde
ZIP-onderdelen worden gecomprimeerd overgenomen; media wordt niet uitgepakt.
Wanneer geen correctie nodig is, wordt dezelfde byte-array teruggegeven.

Dit ververst de opgeslagen waarden. De huidige editorweergave blijft de
gecachete tekst tonen totdat het document op de normale manier opnieuw wordt
geladen. Automatische datums en masterbediening vallen buiten deze stap;
roadmap-issue #87 blijft open.

## Controle op 10 november 2026

Basis: integratiecommit `4175e5f19bf052e0a03f4a87ab73e710f6f163a7`.

- 11 nieuwe tests: echte engine-verplaatsing, verwijderen en dupliceren;
  heropenen; aangepaste beginnummering inclusief nul; verborgen en nummerloze
  dia’s; groepen en compatibiliteitstakken; lege tekstvelden; behoud van exacte
  XML, stijlen, datumvelden en gecomprimeerde overige onderdelen. Een ongebruikt
  mediaonderdeel met onbekende compressiemethode bewijst dat het niet wordt
  uitgepakt.
- De bestaande presentatiecontrole omvat 222 tests. Bij gelijktijdige lokale
  belasting overschreden vier bestaande afbeeldingstests de limiet van 5 s.
  Alle 12 afbeeldingstests slagen afzonderlijk zonder code- of timeoutwijziging;
  de overige 210 presentatietests slagen in de oorspronkelijke controle.
- TypeScript `tsc --noEmit`: geslaagd.
- Aanvullende opslagcontrole: 33 tests geslaagd, inclusief de nieuwe veldtests,
  het native IFCX-opslagcontract en de algemene opslagtests.
- Vite-productiebuild naar een eigen lokale uitvoermap: geslaagd.
- Headless Chromium op die productiebuild: werkelijk herschikken via de
  diasorteerder, Ctrl+S, download en heropenen; vervolgens verwijderen,
  opnieuw opslaan en heropenen. Opgeslagen nummers zijn achtereenvolgens
  1, 2, 3 en 1, 2. Datum, voettekst en bestaande presentatornotities zijn
  zichtbaar behouden. Geen JavaScript-fouten. Het heropende scherm is visueel
  gecontroleerd.

Lokale proefbestanden en browserscripts staan alleen in `.local/`; ze zijn
geen onderdeel van de wijziging.
