# Rekenbladmatrix en opslag van herberekende uitkomsten

Onderdeel van [#3](https://github.com/OpenAEC-Foundation/open-office-studio/issues/3).
Deze proef betreft de bestaande Tauri-/webapp met `@betteroffice/xlsx@0.5.1`.
Het parallelle native Rust-UI-traject valt erbuiten. De acht bestanden zijn
synthetisch; dit is geen vrijgave van een praktijkcorpus of van alle functies.

## Gevonden en herstelde opslagfout

De openbare Spreadsheet-DEB van 2026-W45.3 toont voor `FACT(A1)` met `A1=1`
terecht de uitkomst **1**. De fixture bevat bewust de oude cache **99**.
Werkelijke Ctrl+S-bediening, zonder een inhoudelijke bewerking, schrijft nog
steeds 99. De bestandstijd verandert en de app meldt dat de herberekende
uitkomsten worden bewaard. Dit is onafhankelijk in het opgeslagen ZIP/XML
vastgesteld. Alleen heropenen is geen geldige controle: dat rekent weer naar 1.

De schrijver vertrouwde uitsluitend op een geregistreerde inhoudelijke
bewerking. De [bronpatch](../../patches/rekenbladengine-herberekende-opslag.patch)
vergelijkt ook het actuele model met het oorspronkelijke model, vóór de
korte bewaarroutine. Gewijzigde berekeningen gaan door de bestaande schrijver,
inclusief gedeelde formules en uitvloeiende matrixcellen. Bij gelijke modellen
blijft het oorspronkelijke containerarchief bytegelijk, ook bij een onbekende
functie waarvan de bestaande cache behouden blijft.

Negen JS/WASM-opslagproeven controleren de werkelijk geschreven XML en typen:
getal, tekst, booleaanse waarde, foutwaarde, typewisseling, gedeelde formules,
matrixuitvloeiing en twee gevallen zonder gewijzigde uitkomst. De voorgaande
productiekern faalt in zeven gevallen; de aangepaste kern slaagt in alle negen.
De nieuwe kern is nog niet opgenomen in de gepubliceerde release 2026-W45.3.

De [metadata](../../patches/rekenbladengine-lange-ketens.json) legt de drie
bronpatches en gereedschappen vast. Een nieuwe extractie van het vastgezette
bronarchief met die patches levert bytegelijk dezelfde WASM-kern:
`3c6bcf0d11f3f66ce4410ae7ba5d55c042477949e9975f3977b4e421079781de`
(7.693.796 bytes). De volledige JS/WASM-interface blijft gelijk.

## Onafhankelijke formulecontrole

`scripts/test-matrix-rekenbladen.mjs` gebruikt de werkelijk ingebouwde kern,
controleert de vastgezette patches en de volledige JS/WASM-interface en
vermeldt de kernhash in het rapport. De apphulpmiddelen worden zonder HTTP,
HMR of bestandsbewaking via Vite geladen. De oudere directe Node-import
strandde op een extensieloze TypeScript-import en kon de proef niet uitvoeren.

| Geval | Formulecellen | Controle |
| --- | ---: | --- |
| R1 | 8 | Kruisverwijzingen, invoer en bedragen |
| R2 | 3 | Grafiek, namen, verborgen blad en afdrukinstellingen |
| R3 | 2 | Validatie, conditionele opmaak, draaitabel en onbekend onderdeel |
| Verouderde cache | 5 | Vier bewust verouderde uitkomsten |
| Onbekende functies | 7 | Onbekende functies, afhankelijken en de ondersteunde `FACT` |
| Foutwaarden | 8 | Fouttypen en afhankelijke formules |
| Nederlandse notatie | 0 | Getal-/datuminvoer en behoud na heropenen |
| Groot werkboek | 6.001 | 120.001 cellen en bewerking buiten het beginbeeld |

De Python-evaluator bepaalt de verwachting uit invoer en formules, zonder de
broncache te vertrouwen. De afzonderlijke optie `--opgeslagen` meet uitsluitend
de geschreven uitkomst; zij levert nooit de onafhankelijke verwachting. Een
regressieproef met broncache 999 bewaakt dit onderscheid.

Er zijn zes controlefasen met telkens 6.034 formulecellen: na openen, werkelijk
opgeslagen zonder bewerking, heropenen daarvan, na bewerking, werkelijk
opgeslagen na bewerking en opnieuw heropenen. Alleen de drie expliciet gemelde
onbekende/afhankelijke functies `Functies!C1`, `C2` en `C6` blijven op hun
broncache staan. Dit zijn geen correct berekende resultaten. Alle overige
formules komen overeen met de onafhankelijke verwachting. `FACT` is inmiddels
ondersteund en mag niet meer als toegestane onbekende uitzondering meetellen.

De [productiemeting](rekenbladmatrix-2026-11-06/productie.json),
[tegenproef vóór herstel](rekenbladmatrix-2026-11-06/voor-herstel.json) en
[referentiemeting](rekenbladmatrix-2026-11-06/referentie.json) bevatten de
bronhashes, formuleafwijkingen en afzonderlijke pakket- en kenmerkverschillen.

Alle acht bestanden behouden de gecontroleerde kenmerken, zowel zonder als
met bewerking. Zes ongewijzigde werkmappen blijven geheel bytegelijk. De twee
bestanden met verouderde caches worden bewust herschreven. De oude
berekeningsketen vervalt; in de cachefixture vervalt ook de ongebruikte
shared-stringtabel. Pakketverschillen blijven zichtbaar in het rapport.

De Nederlandse appaansluiting gebruikt de bestandsregio met `localized:true`:
`1,5` wordt 1,5, `1.234,5` wordt 1234,5 en `26-10-2026` wordt datumwaarde 46321.
Dit blijft na opslaan en heropenen behouden. De ruwe canonieke `editCell`-API
is apart gemeten en is geen vervanging voor deze gebruikersinvoerroute.

## Tweede kern op dezelfde bestanden

`scripts/test-rekenblad-referentie.mjs` gebruikt
[`@ironcalc/wasm-xlsx@0.9.1`](https://github.com/ironcalc/IronCalc/tree/ae1fccd3dae89ab919e58ed299c525e6d6ba0ad5/bindings/wasm).
Het openbare pakket is exact vastgezet met SHA-512; pakket-, WASM- en
licentiemeldinghashes staan in het rapport. Het pakket vermeldt
`MIT OR Apache-2.0`; de meegeleverde derdenmeldingen bevatten ook andere
voorwaarden, waaronder die voor Unicode/CLDR. Dit voegt geen productieafhankelijkheid toe.

Elk geval draait in een afzonderlijk Node-proces. Expliciete `evaluate()` gaat
voor de export; de exportwaarden worden vervolgens met dezelfde onafhankelijke
verwachting vergeleken. Alle acht gevallen worden volledig doorgelopen,
inclusief bewerking en heropenen. De formulecontroles slagen, maar R2 verliest
de grafiek en pagina-instellingen en R3 verliest draaitabel, draaicache,
validaties en het onbekende onderdeel. De toegevoegde `xl/metadata.xml` is
afzonderlijk gemeld als kenmerkverschil; die toevoeging is geen inhoudsverlies.
Deze uitkomsten onderbouwen geen overstap naar deze kern.

De tijden zijn afzonderlijke Node-metingen, inclusief verschillende laad- en
initialisatieroutes. Er is geen gecontroleerde snelheidsvergelijking of
prestatiegarantie uit afgeleid.

## Native bediening en resterende grenzen

De werkelijk gedownloade Spreadsheet-DEB van 2026-W45.3 is met eigen XDG,
D-Bus en X11 beproefd. R1, R2, R3 en het grote werkboek zijn werkelijk bewerkt,
opgeslagen, gesloten en heropend. Onafhankelijke pakketinspectie bevestigt de
6.014 bijbehorende formule-uitkomsten na bewerking. Nederlandse getal- en
datuminvoer blijven eveneens behouden. De onbekende-functiemelding is zichtbaar.

Het grafieklabel in R2 volgt de bewerking. Het verborgen bronblad staat echter
als normaal tabblad in de app: [#61](https://github.com/OpenAEC-Foundation/open-office-studio/issues/61)
blijft open. De bereikbare rasterrollen en rij-/kolomkoppen zijn onderzocht en
toetsenbordnavigatie is beproefd; er is geen werkelijke schermlezerproef
afgetekend ([#24](https://github.com/OpenAEC-Foundation/open-office-studio/issues/24)).
Het grote bestand heeft tijdens openen een gemeten hartslagonderbreking van
3.266 ms; dit bewijst geen vloeiende bediening
([#74](https://github.com/OpenAEC-Foundation/open-office-studio/issues/74)).
Issue #3 blijft open zolang de volledige acceptatie niet is afgetekend.

De aangepaste kern is vervolgens met de actuele productieassets in een eigen
Tauri-debugprogramma gebouwd. Drie nieuwe, afzonderlijke werkmappen zijn via
de native bestandskiezer geopend en met echte Ctrl+S-bediening opgeslagen,
zonder inhoudelijke bewerking. Na sluiten en heropenen bevestigt onafhankelijke
XML-inspectie `FACT(1)=1`, de vier herstelde caches en de drie uitvloeiende
matrixwaarden. De oorspronkelijke meldingen over verouderde caches verdwijnen;
de waarschuwingen voor werkelijk onbekende functies blijven staan.

De geladen JavaScript-module is bytegelijk met de gebouwde module en verwijst
naar de verwachte kern. De werkelijk door Tauri aangeboden WASM-bytes hebben
dezelfde SHA-256 als de vastgelegde productiekern. Het draaiende programma is
ook via `/proc/<pid>/exe` tegen het gebouwde programma gecontroleerd.
[Native meetgegevens](rekenbladmatrix-2026-11-06/native.json) en
[de schone herbouw](rekenbladmatrix-2026-11-06/herbouw.json) leggen dit vast.
Dit is een kandidaatproef, geen nieuw gepubliceerd installatiepakket.

| Native kandidaat na opslaan en heropenen | Schermbeeld |
| --- | --- |
| Onbekende functies met herstelde `FACT`-uitkomst | [Beeld](rekenbladmatrix-2026-11-06/functies-heropend.png) |
| Bewust verouderde getal- en tekstcaches | [Beeld](rekenbladmatrix-2026-11-06/cache-heropend.png) |
| Uitvloeiende matrixformule | [Beeld](rekenbladmatrix-2026-11-06/matrix-heropend.png) |

De volledige appproef slaagt met 1.920 geslaagde tests en zeven overgeslagen
gevallen. Alle 51 Python-proeven, typecontrole, productiebuild en de bestaande
kantoorengineproef slagen eveneens. Dit vervangt de resterende module- en
praktijkproeven niet.

## Herhalen

```sh
python3 -m unittest discover -s tests -v
node scripts/test-matrix-rekenbladen.mjs
node scripts/test-rekenblad-referentie.mjs
pnpm exec vitest run src/rekenblad/herberekende-opslag.test.ts
```

De [CI-matrix](../../.github/workflows/rekenbladmatrix.yml) bewaart de formule-,
pakket- en kenmerkrapporten ook bij een mislukking. De bronbestanden en lokale
uitvoer staan in `.local/matrix/rekenbladen/`. Een geslaagde formuleproef geeft
geen verklaring over alle opmaak, toegankelijkheid of onbekende functionaliteit.
