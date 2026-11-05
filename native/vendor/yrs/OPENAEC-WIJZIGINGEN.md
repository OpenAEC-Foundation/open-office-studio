# Wijzigingen aan de gerepliceerde gegevensstructuur

Basis: gepubliceerd pakket yrs 0.27.4; exacte herkomst en licentiehash staan
in ../yrs-bron.json. LICENSE-UPSTREAM bevat de ongewijzigde MIT-licentie uit
de bijbehorende bronrevisie, inclusief de oorspronkelijke auteurs.

Alleen src/types/text.rs is gewijzigd. Twee aanvullende leesmethoden bezoeken
volledige UTF-16-opmaakruns of ingesloten objecten zonder de hele Delta te
kopiëren. De oorspronkelijke methoden blijven behouden. De nieuwe methoden
worden tegen de oorspronkelijke volledige diff vergeleken, ook binnen een
transactie, na commit en na herhaalde opmaak- en verwijderbewerkingen.
