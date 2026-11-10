# Voorbereiding en CPU-afhankelijke statusblokken

Deze vervolgwijziging staat boven `248d5a79` en verandert geen documentengine of WASM-kandidaat.

## Writer

De browser voerde 2,5 seconden na openen een onzichtbare volledige opslag van het gebruikersdocument uit om de opslagafhankelijkheden alvast te laden. Dit kon invoer flushen en grote pakketten projecteren/serialiseren tijdens de eerste bewerkingen. De voorbereiding gebruikt nu de openbare `parseDocx` op het kleine ingebouwde lege sjabloon, zonder fonts te laden. De parser laadt dezelfde OPC-/parser-WASM als de schrijver. De actieve editor wordt hiervoor niet aangeroepen. Een gedeelde `Promise<void>` voorkomt herhaling tussen editors; het geparste model wordt niet vastgehouden. Een mislukte voorbereiding laat een latere poging toe.

De browserproef kan dit expliciet controleren:

```powershell
node scripts/meet-writer.mjs .local/performance-adaptive-floor128 writer 4 --diagnostic --check-warmup
```

Na de voorbereiding wordt uitsluitend voor de echte opslag het browsernetwerk uitgeschakeld. Zowel bij CPU4 als CPU8 slaagde opslaan/heropenen met alle 600 alinea's en 92 gelijke spellingrechthoeken. De teksten blijven exact behouden. Dit bevestigt het vooraf laden; het bewijst geen algemene verbetering van de typetijd. De totale typereeksen duurden in deze runs 12,49 en 16,94 seconden. De tijd van toets tot twee frames had een 95e percentiel van circa 997 en 2.009 ms. Er zijn dus nog forse haperingen in deze volledige Writer-workload, ondanks het wegvallen van de proefopslag.

## Spreadsheet

De selectiestatistiek begint met een budget van 128 cellen en meet de tijd voor lezen en tellen. Bij een blok boven 12 ms wordt het volgende budget kleiner; snelle blokken laten het weer groeien. Het budget blijft tussen 128 en de bestaande bovengrens van 500. Randblokken en volledige rijen kunnen minder cellen bevatten. De ondergrens voorkomt duizenden kleine native aanroepen met hoge vaste overhead. Rijvolgorde, bovengrens van 200.000 cellen, onderbreking en hergebruik blijven gelijk. De timer tussen blokken blijft behouden om de browser ruimte voor frames te geven.

Twee echte-engine/methodeproeven controleren verkleinen én opnieuw groeien, inclusief een wisselende blokgrootte midden in zeer brede rijen met afrondingsgevoelige getallen. Alle bestaande selectie-, formule-, Undo/Redo-, versie- en stoptests blijven gelden.

| Proef op 100.000 geselecteerde cellen | Lezingen | Langste `readCells` | Totale selectietijd | 95e percentiel frames |
| --- | ---: | ---: | ---: | ---: |
| Vast 500, CPU8 controle | 200 | 45,1 ms | 7,48 s | 16,8 ms |
| Adaptief 128–500, CPU4 | 202 | 11,3 ms | 3,12 s | 16,7 ms |
| Adaptief 128–500, CPU8 | 391 | 33,4 ms | 9,13 s | 16,8 ms |

De adaptieve CPU8-editproef had een langste lezing van 28,6 ms tegenover 70,8 ms in de vaste controle. De statistiek was later gereed: 9,52 tegenover 8,21 s. Dit is een afweging tussen korte individuele blokken en totale afrondtijd; de variabele belasting van deze gedeelde computer laat geen algemeen snelheidspercentage toe. Het maximale selectieframe was nog 1,47 s, vooral door werk buiten de statusblokken. Scrollen blijft zonder selectielezingen en met 11 native rasterlezingen. Alle 110.000 waarden/10.000 formules en kopposities na zoom, spoorwijzigingen en Undo/Redo zijn correct.

Een eerdere kandidaat met een minimum van 16 cellen vroeg 2.530 lezingen en ruim 40 seconden bij CPU8. Die is verworpen wegens vaste native-/timeroverhead. Een `scheduler.yield`-variant gaf minder ruimte aan frames in deze proef en is evenmin opgenomen. De oorspronkelijke timer blijft de enige gebruikte route.

## Validatie

TypeScript en de gewone productiebuild slagen; 2.044 tests slagen en 7 bestaande tests zijn overgeslagen. De meetbrug en de warmup-observatie worden uitsluitend door de aparte meetconfig toegevoegd. De native selectie-opmaakoptimalisatie uit PR #253 is een afzonderlijk prototype en zit niet in deze productiekern. CPU-vertraging simuleert geen RAM-tekort; volledige soepelheid op zwakke hardware is nog niet aangetoond.
