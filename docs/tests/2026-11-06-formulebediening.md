# Rekenblad: formulebediening in de native app

Vier fouten zijn hersteld: het lege naamvak na openen, het verdwijnen van
getypte formuleletters, ontbrekende kleuren in de formuletekst en bereikselectie
vanuit de ingeklapte balk. De controles hieronder slagen. Deze ronde van PR #158 vond daarnaast een
kernfout in lange optelketens. De opvolgende correctie en aanvullende F2-proeven
staan in [het kernverslag](2026-11-06-lange-formuleketens.md). PR #159 is na zes
groene platformcontroles gemerged als `06463ebd`; #58 is gesloten. De
[statuscontrole](formulebediening-platformen-2026-11-06.json) legt dit vast.
De gepubliceerde v2026.45.1 bevat deze wijzigingen niet.

## Reproductie en correcties

De [synthetische bronwerkmap](formulebediening-bron-2026-11-06.xlsx) bevat
A1=10, A2=20, B1=SUM(A1:A2), C1=B1+A1 en het benoemde bereik
Getallen = 'Blad 1'!$A$1:$A$2. De ZIP-tijdstempels staan vast.

- **Eerste selectie.** Het eigen naamvak was leeg terwijl de engine A1 en
  waarde 10 toonde. Alleen het abonnement vervangen was onvoldoende: de
  laaggetter bleef null. De laadmelding wiste een al gepubliceerde selectie.
  De laag neemt nu de actuele contextsnapshot over; React leest de externe
  selectie met useSyncExternalStore. Er is geen A1-selectie geforceerd.
- **Getypte letters.** Bij =SU verdwenen S en U voordat de engine de tekst
  overnam. De formulehulp werkte tijdens de capture-fase de linttoestand bij;
  de SDK herstelde bij die render de oude veldwaarde. De hulpupdate wordt nu
  na de invoerafhandeling gepland.
- **Kleuren.** De formulebalk tekende =B1+A1 volledig zwart, terwijl het raster
  blauw en rood toonde. De tekstlaag gebruikt nu dezelfde verwijzingsparser
  en hetzelfde palet als het raster. Het oorspronkelijke input- of
  textarea-element blijft tekst, cursor en selectie beheren. De kopie heeft
  aria-hidden=true en pointer-events=none. Lettertype, binnenruimte,
  afmetingen en verschuiving volgen het veld. Tijdens een samenstelling met
  een invoermethode blijft de oorspronkelijke tekst beschikbaar; zo'n
  invoermethode is in deze native ronde niet afzonderlijk beproefd.
- **Bereiken kiezen.** Vanuit de ingeklapte balk legde slepen over A1:A2 een
  onafgemaakte =SUM( als tekst vast en verplaatste de selectie. De bestaande
  uitgevouwen bereikkeuze is nu gedeeld met de ingeklapte balk. Beide houden
  de oorspronkelijke doelcel en het formuleconcept vast.

Tegenproeven: [eerste bediening](formulebediening-tegenproef-2026-11-06.json),
[alleen het abonnement](naamvak-abonnement-tegenproef-2026-11-06.json),
[letterverlies](formule-aanvullen-tegenproef-2026-11-06.json) en
[ingeklapte bereikkeuze](formule-muis-ingeklapt-tegenproef-2026-11-06.json).

## Gezamenlijke native controle

Een eigen Tauri-applicatie-id, leeg profiel, DBus en X11-scherm scheiden de
proef van de werkplek. De 27 backendbronbestanden zijn bytegelijk aan de
repository. De in de app opgehaalde editors-bundel is gehasht:
`febb563117b7d29e9008dd1f515413186d4ef3b559eac8c06402a5e5ccb6a8cd`
(`editors-U7zzzdfQ.js`). De controleurs bedienen de echte interface en lezen
model/DOM alleen ter controle; zij schrijven geen cellen via een verborgen API.

| Onderdeel van #58 | Uitgevoerd bewijs |
| --- | --- |
| Actieve inhoud en uitvouwen | Direct na openen A1 en 10; een SUM van 1.205 tekens blijft zichtbaar en bewerkbaar in beide balken. |
| Adres, naam en bereik | Getallen selecteert A1:A2; B1:C2 selecteert het opgegeven bereik; losse adressen navigeren naar de juiste cel. |
| Aanvullen en argumenten | =SU blijft intact; pijltjes kiezen SUM en Tab voegt SUM( in; argumenthulp toont de beschrijving. |
| Functiedialoog | Zoeken op SUM, categorie Engineering met alleen CONVERT, uitleg per argument en voorbeeldresultaat 30; invoegen in D1, Undo en Redo. |
| Verwijzingen | B1 blauw en A1 rood in formule en raster; slepen vanuit beide balken voegt A1:A2 in en behoudt respectievelijk D2 en E1. |
| F4 | A1 → $A$1 → A$1 → $A1 → A1, met de passende kleuren tijdens iedere stap. |

Een SUM met 400 verwijzingen rekent 4000 (400 × 10), houdt alle 400
kleursegmenten en blijft als formule bewaard. Verticaal scrollen over 33
pixels en horizontaal over 5.045 pixels houdt veldtekst en tekstlaag exact
gelijk. De schermbeelden zijn visueel bekeken. De lange optelketen hieronder
valt niet onder dit geslaagde SUM-bewijs.

De twee bewaarrondes worden binnen respectievelijk 2,223 en 2,149 seconden
afgetekend; de titel blijft daarbij elk ruim twee seconden schoon en de
bestandstijd verandert. Daarna wordt de tab gesloten en dezelfde werkmap via
Ctrl+O en de native bestandskiezer heropend. De cellen en lange formule zijn
exact gelijk. Onafhankelijke ZIP-/XML-inspectie bevestigt de formules in B1,
C1, D1, E1 en D2, de gecachte D2-waarde 4000 en het ongewijzigde benoemde bereik.
Tijdens de geïnstrumenteerde bedieningsfasen zijn nul consolefouten gezien.
Alle vijf controleurs en het harnas eindigen met code 0; het eigen app- en
X11-proces zijn afgesloten.

- [Gezamenlijk native bewijs](formulebediening-native-2026-11-06.json) en
  [de bewaarde werkmap](formulebediening-native-2026-11-06.xlsx).
- [Eerste selectie in de definitieve app](naamvak-native-definitief-2026-11-06.json).
- Beelden: [vóór de kleurcorrectie](../screenshots/test-formulebediening-formule-voor-2026-11-06.png),
  [twee kleuren](../screenshots/test-formulebediening-kleuren-2026-11-06.png),
  [lange formule](../screenshots/test-formulebediening-lang-2026-11-06.png) en
  [na heropenen](../screenshots/test-formulebediening-heropend-2026-11-06.png).

## Aanvullende kernfout bij deze proef

Met de vastgezette rekenkern 0.5.1 rekent een keten van 100 verwijzingen naar
A1 correct 1000. Bij 200 of 400 verwijzingen naar dezelfde cel geeft
setCellInputs wel succes terug, maar wordt de formule een tekstcel met een
voorafgaande apostrof. De expliciete setFormulas-bewerking, met een formule
zonder het invoerprefix =, weigert dezelfde tekst met
`formula nesting too deep` vanaf positie 302. De parser begrenst ook de
AST-diepte op 100; een lange links geneste optelketen bereikt die grens.
Dit is zowel native als rechtstreeks in de kern gereproduceerd en niet door
de UI-correctie van PR #158 opgelost. De volledige criteria waren met deze
ronde nog niet afgetekend; zie het opvolgende kernverslag hierboven.

Zie [de onafhankelijke kerntegenproef](lange-formule-kern-tegenproef-2026-11-06.jsonl)
en [de native tegenproef](lange-formule-native-tegenproef-2026-11-06.json).
De eerste tussenkandidaat en zijn beperkingen blijven afzonderlijk bewaard in
[het eerdere bedieningsbewijs](formulebediening-native-eerste-kandidaat-2026-11-06.json).

## Bouw en tests

Typecontrole, productiebuild en native debugbouw slagen. De volledige
Vitest-set slaagt: 150 bestanden, 1.728 geslaagde tests en zeven bestaande
overgeslagen corpusgevallen. De native bediening is op Linux geverifieerd;
dit is geen bewijs van native bediening op Windows of macOS. Platformcontroles
van de PR worden afzonderlijk bijgehouden.
