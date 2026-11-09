# Tekstkern voor noten, cellen en formules

De bestaande Tauri-/webeditor gebruikt de JS-interface van `@betteroffice/docx`
0.5.1 met twee gericht aangepaste WASM-modules: bewerken en losse layout. De nootlabels volgen de berekende
nootnummering vóór de breedtemeting. Een meerletterig label blijft één
documentpositie en één ondeelbare eenheid bij regelafbreking. Beide modules begrijpen dezelfde atoomgrenzen, ook wanneer tekenen of klikken
via de terugvalroute verloopt. De DOCX-inhoud
behoudt de oorspronkelijke semantische nootverwijzing.

Formules krijgen een zelfstandige SVG met lettervormpaden uit MathJax. De kern
meet de ruimte boven en onder de formulebasislijn en gebruikt hetzelfde beeld
bij schermweergave, afdrukken en PDF. Een weergegeven vergelijking staat op een
eigen, gecentreerde regel. De DOCX bewaart de oorspronkelijke bewerkbare OMML;
de SVG is afgeleide weergave-informatie en vervangt de formule niet.

De Chicago-notatie gebruikt `*`, `†`, `‡`, `§` en vervolgens herhaalde tekens.
De bestaande limiet van 64 tekens per nootlabel geldt ook voor het genereren:
waarden 1–256 zijn ondersteund. Ongeldige of grotere waarden houden de bestaande
decimale terugval voor niet-opgeloste nummerformaten; de broninstelling blijft
behouden. De bewerkings- en layoutkern gebruiken dezelfde formatter en grens.

Bij celsplitsing bewaart de bewerkingskern de bestaande kolomgrenzen in een
verfijnd raster. Nieuwe zichtbare cellen mogen meerdere rasterstroken beslaan;
de breedtes van niet-geselecteerde rijen blijven gelijk. De voorkeursbreedte
wordt over de kinderen verdeeld. De aansluiting van de bestaande splitsdialoog
laat minder zichtbare kolommen dan rasterstroken toe.

Import neemt alleen werkelijk aanwezige voorkeursbreedtes over. Afgeleide
percentages van het tabelraster worden geen auteursopmaak, zowel in de native
import als in de JS-documentimport. Daardoor blijven ontbrekende `tcW`-gegevens
bij bewaren ontbreken. Expliciete kleine percentagewaarden blijven geldig,
ook wanneer ze numeriek op een berekend rasterpercentage lijken.

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
pnpm exec vitest run src/tekst/tabel/voorkeursbreedte-opslag-engine.test.ts
pnpm test --maxWorkers=2
pnpm build
```

De gerichte proef controleert voet- en eindnoten met vijf notaties vanaf drie,
de eerste negen symboolwaarden en de grenswaarde 256,
de overeenkomst tussen hoofdtekst en noot, één documentpositie, semantisch
noot-ID en behoud na opslaan/heropenen. Een expliciete tegenproef kan met
`OOS_NOOT_WASM` het oorspronkelijke bestand laden; die moet de gemelde fout
opnieuw aantonen.

De tabelproef vergelijkt werkelijk getekende celvakken vóór en na splitsen,
Undo/Redo en bewaren/heropenen, bij vaste en automatische tabelindeling.
Absolute en procentuele voorkeursbreedtes en herhaald samenvoegen/delen zijn
meegenomen. Zie [het controleverslag](../../docs/tests/2026-11-06-celsplitsing.md)
voor de afbakening ten opzichte van het nog openstaande #130.

De opslagproef laadt de productiecorrectie voor JS-import in een tijdelijke
kopie van de volledige SDK-modulegraaf. De meegeleverde WASM-kernen worden daar
voorgeladen. Dit houdt interne sessiegegevens bij elkaar en wijzigt het
geïnstalleerde npm-pakket niet. Zes opslagroutes en achttien gevallen met
bestaande of nieuw ingestelde voorkeuren controleren de werkelijk geschreven XML.
