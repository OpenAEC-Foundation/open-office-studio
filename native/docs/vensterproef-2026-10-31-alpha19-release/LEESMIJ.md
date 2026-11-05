# Geslaagde Linux-releasevensterproef van alpha 19

De binary komt uit de Linux-taak van [CI-ronde 41216962825](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41216962825),
broncommit `77c83c8bd06427c786e0e7385e720d4534f2718a`. Alle **944** verpakte
bronbestanden zijn bytegelijk aan het vaste Git-archief gecontroleerd.
[Herkomst](herkomst.json), [proefbron](proefbron.py), [uitvoer](rapport.json)
en acht volledige vensterbeelden zijn onbewerkt bewaard. De proefbronhash en
alle opgenomen Rust-/Cargo-bronhashes zijn tegen deze commit gecontroleerd.

De gerichte ronde slaagt op **twaalf stappen**: zoeken openen, Unicode-invoer
via het systeemklembord, resultaat aanklikken en echte editorfocus, selectie
kopiëren na vooraf gewijzigd klembord, Unicode-vervanging, bewaren met
onafhankelijke XML-controle van runopmaak, één Escape, exacte bronherstelling
via undo, rijke invoer, snelle Ctrl+A/Ctrl+X, terugplakken, Bestand zonder
grijze resten en schoon sluiten.

Dit gebruikt een eigen Xvfb-/D-Bus-sessie en aparte XDG-mappen. Het is een
gerichte Linux/X11-releasecontrole. Fysieke hardware, Windows/macOS-bediening,
IME-compositie, systeemdialogen, schermlezers, overige modules en volledige
functie- of pixelpariteit zijn hiermee niet goedgekeurd.

![Zoeken en selecteren in de echte releasebuild](writer-zoeken-selectie.png)
