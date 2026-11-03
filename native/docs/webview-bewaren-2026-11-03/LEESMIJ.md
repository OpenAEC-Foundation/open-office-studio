# Bewaren buiten de interfacethread

De Rust-WebView legt eerst een onveranderlijke bewaarkopie vast. De gedeelde
achtergrondvoorziening van de Rust-kern schrijft de bytes zonder UI-slot.
Een antwoord bevestigt uitsluitend de vastgelegde bronhash. Nieuwe invoer
blijft dus gewijzigd; een gesloten document komt niet terug door een laat antwoord.

Een document kan één lopende bewaaractie hebben. Bestandswerk van tabbladen in
één werkruimte is onderling uitgesloten op de achtergronddraden, zodat twee tabs
niet tegelijk dezelfde oude schijfhash kunnen goedkeuren. Dit is geen nieuwe
vergrendeling tegen alle externe programma’s.

Vier nieuwe modelproeven controleren invoer/navigatie tijdens bewaren, gesloten
documenten en dubbele opdrachten, externe wijzigingen met vervolgactie, en twee
tabbladen met hetzelfde doelbestand. Alle vijftien gerichte WebView-proeven,
Clippy en de echte Linux-vensterproef slagen. De vensterproef typt via X11,
bewaart titel/canvas/Markdown, controleert undo/redo, annuleren, systeemsluiten,
heropenen in een nieuw proces en expliciet verwerpen.

[Controleverslag](rapport.json). Twee geselecteerde clientbeelden zijn opgenomen:
[canvas](canvas-eindbeeld.png) en [heropende Markdown](heropende-markdown.png).
De volledige lokale proef heeft 45 beelden; dit is geen pixelgoedkeuring.

Openen en enginebewerkingen zijn nog synchroon. De volledige documentsessiewerker
moet nog worden aangesloten; alle tien migratiegebieden blijven open.


Een aanvullende componentproef vond dat een bewaarantwoord kon verdwijnen
wanneer de bediening werd verlaten. De bevestiging heeft nu de levensduur van
de hoofdcomponent. De proef voert de echte bewaarfunctie uit vanuit een kind,
verwijdert die component, controleert de bevestigde schijftoestand en leest het
bestand onafhankelijk terug. Zij faalt op de eerdere aansluiting en slaagt na
herstel. De gerichte WebView-ronde bevat nu zestien proeven; Clippy blijft groen.
