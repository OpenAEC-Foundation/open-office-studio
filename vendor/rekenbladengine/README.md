# Aangepaste rekenbladkern

Deze WASM-module vervangt de kern van `@betteroffice/xlsx` 0.5.1. De bestaande
JavaScript-interface blijft gelijk. Lange vlakke formuleketens blijven als
formule bewaard en worden in hun oorspronkelijke volgorde uitgevoerd. Echte
nesting, formulelengte en het aantal tokens blijven begrensd.

De aanvullende [regiopatch](../../patches/rekenbladengine-werkmapregio.patch)
verzorgt getalweergave, datumwoorden en invoer per bestand. Canonieke
`setCellInputs`-aanroepen blijven ongewijzigd; expliciete gebruikersinvoer
gebruikt `localized: true`. Afgeleide datum-/procentnotaties horen bij dezelfde
Undo-stap als de invoer. De instelling blijft als verborgen naam in de XLSX
bewaard en verandert geen celwaarden bij een regiowissel. Ingebouwde datumcodes
14 en 22 volgen de bekende bestandsregio; eigen datumcodes behouden hun
volgorde. Expliciete lage valutacodes worden eveneens uit het bestand gelezen.

De [opslagpatch](../../patches/rekenbladengine-herberekende-opslag.patch)
vergelijkt het actuele model met de bron vóór de korte bewaarroutine. Zo
worden bij expliciet opslaan ook de bij openen herberekende uitkomsten
geschreven, inclusief gedeelde en uitvloeiende formules. Een gelijk model
behoudt het oorspronkelijke ZIP-archief. Onbekende functies behouden hun
opgeslagen uitkomst; de app blijft daarvoor waarschuwen.

De aanvullende CF-patches verzorgen volledige, vooraf gevalideerde regelvervanging
met native undo/redo, opslag van nieuwe uitgebreide regels met een geldige DXF en
het gewijzigde toepassingsbereik. Een alleen-lezen `formulaQueries`-uitbreiding van
`readCellsJson` evalueert voorwaarden in de echte blad-/celcontext. Ze gebruikt
dezelfde begrensde rekenkern, zonder tijdelijke bladen, bronwaarden opnieuw te
berekenen, gewone stijlen te wijzigen of geschiedenis toe te voegen. Er komen
geen WASM-exports of snapshotvelden bij.

Herkomst, broncommit, gereedschapsversies en checksums staan in
[de metadata](../../patches/rekenbladengine-lange-ketens.json). De
[bronpatch](../../patches/rekenbladengine-lange-ketens.patch) bevat ook de
kern- en bestandsproeven. `LICENSE` en `NOTICE` reizen met de app mee.

De productiebuild controleert alle patches, de oorspronkelijke en aangepaste
kernbytes en de volledige JS/WASM-interface. De npm-afhankelijkheid blijft
ongewijzigd. Dezelfde module wordt in de hoofdapp, workers en tests gebruikt.

Herbouwen vereist de vastgezette Rust-, wasm-bindgen- en Binaryen-versies.
Gebruik nieuwe bron- en uitvoermappen:

```sh
python3 scripts/bouw-rekenbladkern.py \
  --bronmap .local/rekenblad-herbouw-bron \
  --uitvoer .local/rekenblad-herbouw-uitvoer \
  --controle
```

Met `--bronarchief` kan hetzelfde gecontroleerde bronarchief lokaal worden
meegegeven. `--wasm-bindgen` en `--wasm-opt` kiezen de uitvoerbare bestanden.
Het script weigert een afwijkend bronarchief, gereedschap, bronpatch,
JS/WASM-interface of eindresultaat. De vastgelegde module is 7.712.658 bytes.
[De kandidaatbouw](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42625934529)
en [bouw.json](bouw.json) leggen de gebruikte patches en de werkelijk gemeten
uitvoerchecksum vast. Een expliciete `CARGO_TARGET_DIR`
kan een bestaande compilatiecache hergebruiken; de bronmap blijft nieuw.

Zie [lange ketens](../../docs/tests/2026-11-06-lange-formuleketens.md) en
[getalnotatie](../../docs/tests/2026-11-06-getalnotatie.md) voor de verificatie.
