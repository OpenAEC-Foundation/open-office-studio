# Writer-verwijzingen (#52)

De native Yrs-proeven controleren bladwijzers over meerdere alinea's, unieke
namen, hernoemen/verwijderen, Undo/Redo en bewaren/heropenen. Bijschriften blijven
SEQ-velden, met een STYLEREF-hoofdstukprefix bij een bestaande genummerde kop.
Tabellen tellen op hun positie in de documentvolgorde mee. Dezelfde bewerking
werkt boven en onder een vergelijking en boven en onder een tabel, met behoud
van het object en de omringende tekst. REF en NOTEREF blijven native velden;
complexe veldcodes en de opmaak van resultaten blijven behouden.

`src/tekst/verwijzingen/verwijzingen-engine.test.ts`: 13 proeven geslaagd.
`scripts/proef-verwijzingen.mjs .local/dist`: geslaagd tegen de productiebuild.
De browserproef voegt een bijschrift in, maakt tekst- en paginaverwijzingen,
volgt een verwijzing met Ctrl+klik en typt op de bestemming, maakt een
bladwijzer, hernoemt deze en navigeert ernaar. De gedownloade DOCX bevat de
veldcodes, bladwijzers en het werkelijke paginanummer 2. Geen paginafouten.

De centrale F9-, opslag- en afdrukbijwerker is geïntegreerd. Een gecombineerde
TITLE-/PAGEREF-proef controleert dat de nieuwe inhoud vóór de verwijzingsronde
aan de layout wordt gepubliceerd. Voetnoten kunnen als nummer (NOTEREF), tekst
(REF naar een bladwijzer in het nootverhaal) of pagina worden ingevoegd.
Bij meerdere geopende documenten blijft de bijwerker geregistreerd tot de
laatste Writer-editor sluit. Typecontrole en productiebuild zijn geslaagd.
