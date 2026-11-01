# Writer-alineadiagnoses alpha 29

[De oorspronkelijke drie proeven](voor-correctie.log) falen op broncommit 0a33c75d24603e6f8f18597980a2c71888c2df32: Enter maakt geen nieuwe alinea, Backspace en Delete voegen aangrenzende alinea’s niet samen. De [reproduceerpatch](voor-correctie.patch) bevat de afzonderlijke tests. De eerdere gecombineerde proef is opgesplitst zodat beide verwijdertoetsen werkelijk worden uitgevoerd.

[De eerste implementatie](eerste-implementatie-afgekeurd.log) faalt eveneens op alle drie. De [toenmalige bronpatch](eerste-implementatie.patch) blijft behouden. De GUI gebruikte ten onrechte het opmaakbereik: zonder selectie betekent dat de hele alinea. De correctie vertaalt de daadwerkelijke cursor en het selectieanker. De oorspronkelijke verwachtingen zijn niet verzwakt.

[De gerichte hertest](gerichte-hertest.log) slaagt op vijftien kern- en acht widgetproeven. [Twee aanvullende widgetproeven](aanvullende-widgetproeven.log) slagen zonder verdere productiecorrectie: een weer ingeklapte Shift-selectie en typen in de nieuwe lege alinea. De volledige alpha-29-ronde controleert alle eerdere proeven opnieuw. [rapport.json](rapport.json) koppelt bron en uitvoer via SHA-256. Geen volledige Writer-, toetsenbord-, platform- of suitegoedkeuring.
