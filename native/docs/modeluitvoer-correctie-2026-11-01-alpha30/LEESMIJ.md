# Modeluitvoer bewaart standaardrijopmaak

Alpha 30 corrigeert het verlies van `sheetFormatPr` bij een volledig nieuwe modelwerkmap. `defaultRowHeight`, `customHeight` en `zeroHeight` worden vóór kolommen en celdata geschreven. Niet-eindige, negatieve en te grote hoogten worden geweigerd. Een ontbrekende hoogte bij de twee actieve vlaggen krijgt standaardwaarde 15. De bestaande bronroute blijft behouden.

De oorspronkelijke drie proeven faalden alle drie op alpha 29. Vijf eigen proeven slagen na de correctie: schaarse verborgen rijen, vaste standaardhoogte, ongeldige waarden, twintig combinaties en behoud van eigen naamruimte-attributen op de bestaande bronroute. Alle 23 nieuwe XLSX-bestanden zijn met een onafhankelijke bibliotheek teruggelezen. De oorspronkelijke 382 upstream-proeven slagen zowel vóór als na de wijziging.

[Het rapport](rapport.json) bevat hashes, omvang en afzonderlijke afkeuringen. De eerste XML-testdecoder compileerde niet; de gecorrigeerde decoder en de volledige waarschuwingvrije controle staan apart vast. De oude modeluitvoerdiagnose blijft historisch afgekeurd. Alleen de nieuwe hertest ondersteunt de correctie; er is geen gewijzigde referentie, volledige modeluitvoer- of functiepariteit. De vastgepinde parser behoudt zijn oorspronkelijke bron, licentie en notices.
