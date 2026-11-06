# Tekstkern voor nootnummering en celgeometrie

De bestaande Tauri-/webeditor gebruikt de JS-interface van `@betteroffice/docx`
0.5.1 met twee gericht aangepaste WASM-modules: bewerken en losse layout. De nootlabels volgen de berekende
nootnummering vóór de breedtemeting. Een meerletterig label blijft één
documentpositie en één ondeelbare eenheid bij regelafbreking. Beide modules begrijpen dezelfde atoomgrenzen, ook wanneer tekenen of klikken
via de terugvalroute verloopt. De DOCX-inhoud
behoudt de oorspronkelijke semantische nootverwijzing.

Bij celsplitsing bewaart de bewerkingskern de bestaande kolomgrenzen in een
verfijnd raster. Nieuwe zichtbare cellen mogen meerdere rasterstroken beslaan;
de breedtes van niet-geselecteerde rijen blijven gelijk. De voorkeursbreedte
wordt over de kinderen verdeeld. De aansluiting van de bestaande splitsdialoog
laat minder zichtbare kolommen dan rasterstroken toe.

De precieze broncommit, checksum van het bronarchief, patch en bouwgereedschappen
staan in [de herkomstgegevens](../../patches/tekstengine-nootnummering.json).
De [bronpatch](../../patches/tekstengine-nootnummering.patch) bevat ook de gerichte
Rust-proeven. `LICENSE` en `NOTICE` behouden de oorspronkelijke vermeldingen en
beschrijven de wijzigingen. De gewone licentiebundeling neemt beide mee.

## Opnieuw bouwen

Installeer de vastgelegde Rust-versie met doel `wasm32-unknown-unknown`,
wasm-bindgen 0.2.129 en Binaryen 132. Gebruik vervolgens een nieuwe bronmap:

```sh
python3 scripts/bouw-tekstkern.py \
  --bronmap /tmp/office-tekstkern-bron \
  --uitvoer /tmp/office-tekstkern-uitvoer \
  --controle
```

Het script verifieert de bron en past de patch zonder fuzz toe. Het schrijft
beide gebouwde bestanden en de werkelijke bouwgegevens in de uitvoermap. Bestaande
npm-pakketten en de meegeleverde kern worden niet aangepast. Gebruik
`--bronarchief`, `--wasm-bindgen` en `--wasm-opt` voor reeds beschikbare bestanden
of gereedschappen. Er wordt geen bytegelijke compilatie op andere systemen
verondersteld.

Voor vervanging van de meegeleverde kern: vergelijk eerst imports en exports met
de oorspronkelijke 0.5.1-kern, werk beide checksums bij en draai de kernproeven,
Office-tests en een productiebuild. De Vite-aansluiting controleert de checksums
en de volledige lijst van imports en exports bij het bouwen. Node-tests laden
dezelfde kern uit deze map.

## Gerichte controles

```sh
pnpm exec vitest run src/tekst/pagina/nootnummering-engine.test.ts
pnpm exec vitest run src/tekst/tabel/splitsen-geometrie-engine.test.ts src/tekst/tabel/splitsen-dialoog.test.ts
pnpm test --maxWorkers=2
pnpm build
```

De gerichte proef controleert voet- en eindnoten met vijf notaties vanaf drie,
de overeenkomst tussen hoofdtekst en noot, één documentpositie, semantisch
noot-ID en behoud na opslaan/heropenen. Een expliciete tegenproef kan met
`OOS_NOOT_WASM` het oorspronkelijke bestand laden; die moet de gemelde fout
opnieuw aantonen.

De tabelproef vergelijkt werkelijk getekende celvakken vóór en na splitsen,
Undo/Redo en bewaren/heropenen, bij vaste en automatische tabelindeling.
Absolute en procentuele voorkeursbreedtes en herhaald samenvoegen/delen zijn
meegenomen. Zie [het controleverslag](../../docs/tests/2026-11-06-celsplitsing.md)
voor de afbakening ten opzichte van het nog openstaande #130.
