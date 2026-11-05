# Writer: echt systeemklembord

De Linux-proef op de bewaarde 45.10-binary reproduceert #126 via de lintknop.
Dezelfde externe GTK-bron plakt daar met Ctrl+V wel correct. De melding van beide
routes op de oudere 45.2-uitvoering is daarmee niet volledig gereproduceerd.

De Tauri-schil geeft de startvensters en later gemaakte documentvensters nu
expliciete klembordtoegang. De startconfiguratie blijft via `from_config` behouden,
inclusief afmetingen, titels en app-identiteit. Bewust uitgeschakelde vensters
worden niet aangemaakt. Er is geen React/TypeScript-productcode aangepast.

De **identieke definitieve proef** faalt op 45.10 en slaagt op de geoptimaliseerde
45.11-binary op acht controles:

- Externe Ctrl+V op een ingevoegde cursorpositie behoudt voor- en achtertekst.
- Extern plakken via het lint behoudt Unicode en bestaande tekst.
- Interne kopieën plakken via zowel lint als Ctrl+V.
- Een externe kopie met meerdere regels bewaart twee echte alinea’s.
- Ctrl+S schrijft het werkelijke bestand; een nieuw proces heropent dezelfde inhoud.
- Ook een nieuw documentvenster via het venstermenu plakt externe tekst via het lint.

De externe bron draait als afzonderlijk GTK-proces op het eigen X11-scherm.
Toetsen en lintknoppen worden werkelijk bediend; invoegen gebeurt niet via
de inspectie-API. DOCX wordt onafhankelijk als XML-pakket teruggelezen. De
[meetgegevens](2026-11-03-writer-klembord.json) bevatten de programma-/scripthashes,
verwachte en werkelijke alinea’s en drie ongewijzigde vensterbeelden.

Productie-/native Linux-bouw, TypeScript, weekversiecontrole en 28 versie-/
studioconfiguratieproeven slagen. De bestaande native GTK-kleurproef slaagt
opnieuw inclusief opslaan en heropenen. Een eerste extra kleurcontrole las het
net gemapte dialoogvenster vóór GTK schilderde en klikte terecht niet. De proef
wacht nu maximaal drie seconden op de **exact vereiste RGB-pixel**; de maat- en
kleurvoorwaarden blijven even streng. Het oorspronkelijke negatieve beeld blijft
lokaal bewaard.

De [45.11-bouw voor zeven edities op drie platforms](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41584192673)
slaagt inmiddels; publiceren was uitgeschakeld. Dit is bouw-/CI-bewijs.
Fysieke Windows-/macOS-GUI-proeven, alle externe rijke klembordformaten, algemene
prestaties en de volledige Rust-/pixelmigratie zijn hiermee niet goedgekeurd.

```sh
python3 scripts/test-writer-klembord-native.py --programma src-tauri/target/release/open-office-studio --versie 2026.45.11 --uitvoer /tmp/office-klembordproef
```
