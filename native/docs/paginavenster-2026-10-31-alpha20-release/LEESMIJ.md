# Gerichte paginavensterproef van alpha 20

De [releaseherkomst](herkomst.json) hoort bij broncommit `963258d7b6b24b30912f1cd21e5a29882d638c80` en CI-ronde [41222311428](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41222311428). Alle 987 verpakte bronbestanden zijn vooraf gecontroleerd tegen het vaste Git-archief.

De [proefbron](proefbron.py) en [negen geslaagde stappen](rapport.json) controleren twee verschillende papierbeelden via paginanavigatie, vervolgens zoeknavigatie **pagina 5 → 0 → 5**, echte geselecteerde brontekst via het systeemklembord, exact dezelfde schone papierblokken en een ongewijzigde DOCX-bron bij bewaren/sluiten. Volledige vensterbeelden zijn behouden. Het vaste blok wordt zonder maskers, herschaling of tolerantie vergeleken. Deze twee nulmetingen komen via een andere navigatieroute in hetzelfde programma; ze bewijzen geen onafhankelijke documentlayout of volledige UI-pariteit.

Twee eerdere mislukte pogingen blijven behouden. De [eerste](afgekeurd.json) vergeleek een schone pagina met een pagina waarop sinds alpha 20 terecht een zoekmarkering staat. De [tweede](afgekeurd2.json) probeerde die selectie met een pijltjestoets op te heffen terwijl de editor na het sluiten van het zoekpaneel geen focus meer had. De geslaagde proef herstelt die focus met een echte muisklik en heft de selectie op vóór de schone vergelijking. De oorspronkelijke bronnen en foutbeelden zijn opgenomen; mislukte pogingen zijn geen groene appcontrole geworden. Focusbehoud bij het sluiten van zoeken wordt afzonderlijk verbeterd in alpha 21.

Eigen Xvfb-, D-Bus- en XDG-sessie. Geen fysieke hardware, Windows/macOS-vensterbediening, systeemdialogen, echte IME-compositie, schermlezers of volledige functie-/pixelpariteit.
