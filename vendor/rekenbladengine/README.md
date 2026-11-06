# Aangepaste rekenbladkern

Deze WASM-module vervangt de kern van `@betteroffice/xlsx` 0.5.1. De bestaande
JavaScript-interface blijft gelijk. Lange vlakke formuleketens blijven als
formule bewaard en worden in hun oorspronkelijke volgorde uitgevoerd. Echte
nesting, formulelengte en het aantal tokens blijven begrensd.

Herkomst, broncommit, gereedschapsversies en checksums staan in
[de metadata](../../patches/rekenbladengine-lange-ketens.json). De
[bronpatch](../../patches/rekenbladengine-lange-ketens.patch) bevat ook de
kern- en bestandsproeven. `LICENSE` en `NOTICE` reizen met de app mee.

De productiebuild controleert de patch, de oorspronkelijke en aangepaste
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
JS/WASM-interface of eindresultaat. De schone herbouw levert bytegelijk de
vastgelegde module van 7.670.630 bytes op.

Zie [de verificatie](../../docs/tests/2026-11-06-lange-formuleketens.md).
