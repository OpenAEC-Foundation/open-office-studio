# Lokale integratie van de eerste onderdelen van #52–#54

Samengebracht vanaf main `f4a03889`:

- #52: `1d37948760e00d36fe69be3dd642bedd83536730` (PR229).
- #53: `e05638dff3d356116815ef86080cd77a9b0b4056`.
- #54: `c64e83afb0195066326fa32f3c837e928d2d71bb`.

De normale samenvoegconflicten in `src/lint/tekst.tsx` en de negen
`writer.json`-bestanden zijn opgelost met behoud van beide invoegknoppen,
de math- en mailMerge-groepen en alle bladwijzerlabels. De functionele
modules en vertaalgroepen zijn inhoudelijk vergeleken met de afzonderlijk
geteste broncommits; alleen platformregeleinden verschillen.

## Gecombineerde controle

- TypeScript en Vite-productiebouw slagen.
- Vertaalcontrole: alle negen aangeboden writer-talen, 1428 bronsleutels.
- Volledige suite: 2004 tests geslaagd, drie timeouts en tien bestaande
  overslagen in 179 bestanden. De timeouts zitten in twee ongewijzigde
  bestanden: de iconencontrole en de volledige i18n-controle. Bij de
  iconentimeout liep ook de opruiming van de tijdelijke kopie tegen een nog
  lopende taak aan. Beide volledige bestanden slagen daarna afzonderlijk:
  22 tests, één worker, timeoutgrens 30 seconden, klaar in circa vier
  seconden. Daarmee zijn alle 2007 uitgevoerde tests geslaagd over deze
  runs; er is geen tweede volledige run gedaan.
- De drie productiebrowserproeven slagen tegen **dezelfde gecombineerde
  build**: bladwijzernavigatie en typen op exacte body-/tabeloffset;
  vergelijkingseditor/preview/bewerken/OMML-download; CSV-veldinvoeging,
  recordkopieën, native IPC-contractstub en behoud van bronvelden. Geen
  paginafouten.

Deze integratie is voor lokale verificatie; de drie reviewbranches blijven
afzonderlijk en hun exacte heads zijn niet gewijzigd. Er is niets naar
main gemerged en geen nieuwe native Windows-build gemaakt.

Alle drie brede issues blijven open. #52 heeft nog bijschrift-/kruisverwijs-
en bladwijzerbeheerwerk; #53 mist onder meer volledige formuleweergave in
het document/print/PDF en verdere structuren; #54 mist onder meer andere
gegevensbronnen, sorteren/filteren, bulk/PDF/afdruk en etiketten/enveloppen.
Zie de afzonderlijke testverslagen voor de precieze bereikgrenzen.
