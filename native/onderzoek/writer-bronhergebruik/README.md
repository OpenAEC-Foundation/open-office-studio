# Begrensde transportmeting van echte Writer-invoer

Deze Linux-onderzoeksproef gebruikt uitsluitend de behouden referentie 45.49 en
de al afgewezen cachebinary 45.50. Geen productiepatch, nieuwe bouw, download of
release. Start vanuit de repository met:

```sh
python3 native/onderzoek/writer-bronhergebruik/meten.py
node native/onderzoek/writer-bronhergebruik/transport.test.cjs
```

Vereist de bestaande lokale binaries, GUI-hulpmiddelen en vaste rasterreferentie.
De uitvoermap moet nieuw zijn; eerdere bewijzen worden niet overschreven. De
runner legt template-, helper-, transport- en ELF-hashes vast. De bestaande
fysieke proef blijft intact: alleen de repositorylocatie en twee meetaanroepen
worden toegevoegd. Eigen Xvfb-/DBus-/XDG-omgeving en documentkopie, echte toetsen,
exact alle verhaalteksten en bestaande tekstpixelpoort; geen gebruikerssessie.

`transport.js` omwikkelt uitsluitend `window.fetch` in deze test-WebView. De
read-only native invoke-functie wordt niet vervangen. Alleen het eigen IPC-
eindpunt wordt bekeken; argumenten, antwoordobject en fouten worden doorgegeven.
De helper vergelijkt de laatst teruggeleverde voorstelbytes/basis/client/document
met het volgende verzoek. Het verslag bevat uitsluitend booleans, tellingen en
bytegroottes: geen tekst, IDs, vectoren, basisdigest of base64. Alleen het vorige
voorstel blijft tijdelijk in de closure staan. Maximaal 1.024 regels, met een
expliciete overschrijdingsteller; bij stoppen verdwijnt de tijdelijke bron en
wordt de oorspronkelijke fetch hersteld.

De JS-regressie controleert warme/koude verzoeken, afwijkende client/document/
basis/delta, antwoordbinding/vector, volledige herstart, vergeten, doorgeven van
objecten en transportfouten, kopiëren van uitvoer en begrenzing. Het is een
observator voor deze sequentiële proef: gelijktijdige documentwissels/vergeten
met nog onderweg zijnde antwoorden zijn geen geaccepteerde meetroute. De
bestaande productbewaking wordt niet aangepast of vervangen.

`hergebruikGeschikt` betekent dat de gemeten voorwaarden overeenkomen met het
native hergebruikfilter. Het is geen rechtstreeks uitgelezen native reused-
vlag, cachetrefferteller of bewijs van een specifieke versnelling. Een retry of
voorraadverdringing blijft een afzonderlijke mogelijkheid. De twee ronden zijn
geïnstrumenteerd en niet bedoeld als nieuwe snelheidsvergelijking, zeker bij
andere actieve compilers. De eerdere passieve ABBA-afkeuring blijft geldig.
