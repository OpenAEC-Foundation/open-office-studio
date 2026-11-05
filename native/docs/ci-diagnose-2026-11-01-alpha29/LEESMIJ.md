# Afgekeurde alpha-29-CI door verouderde schermtelling

Ronde `41265333745` test broncommit `cf35322ccf19fc8981ee63592d4892f54349e5fd` via een bytegelijke mergecheckout. De drie native platformtaken en de conversietaak slagen; de gezamenlijke taak faalt: zij verwacht 49 beelden, terwijl de twee nieuwe Writer-proeven het totaal op 51 brengen. De afkeuring en [oorspronkelijke status](ci-status.json) blijven behouden.

Een afzonderlijke [lokale beeldhertelling](beeldhertelling.json) vergelijkt alle 51 oorspronkelijke CI-beelden van Windows en macOS met Linux: **102 volledige beeldparen, nul afwijkende pixels, nul kleurtolerantie**. Dit controleert geen verpakte bron en verandert de afgekeurde CI-status niet. De [21 oorspronkelijke releasepaginabezoeken](paginametingen.json) slagen afzonderlijk. De volgende workflow verwacht expliciet 51 beelden.

Dit is geen visuele goedkeuring tegenover de oorspronkelijke suite. Die vier afzonderlijke vergelijkingen blijven rood. De lokale hertelling bewijst evenmin volledige functiedekking of fysieke platformbediening.
