# Schaarse werkmap: functionele rondgang en twee open GUI-fouten

De oorspronkelijke [proef zonder celklik](zonder-celklik/rapport.json) faalt: na openen worden Omlaag en 7 niet verwerkt. Eén bewaaropdracht levert daardoor niet de bedoelde celwaarde op. De bron bleef ongewijzigd. Deze afkeuring blijft behouden.

De afzonderlijke [route met een werkelijke eerste celklik](na-celklik/rapport.json) slaagt op zes gerichte stappen. Omlaag slaat verborgen rijen over; 7 wordt uitsluitend in A1000000 opgeslagen. Standaard verborgen rijen, beide hoogte-uitzonderingen en het tweede blad blijven behouden. Eén undo en één bewaren herstellen de bron bytegelijk. Na heropenen bevestigt het systeemklembord de waarde 7 zonder bronwijziging. Beide eigen vensters sluiten met code nul.

De volledige invoer- en heropenbeelden zijn bekeken. Rijnummer 1000000 breekt binnen de vaste rijkopbreedte over twee regels af. De [visuele beoordeling blijft afgekeurd](beoordeling.json); ook de ontbrekende toetsenbordfocus na openen is nog niet verholpen. Er is geen volledige GUI- of pixelgoedkeuring.

De proef gebruikt de vastgezette Linux-CI-binary van commit c752341ab177ad4685dcd29abe71e687dcaf1292. De latere volledig groene alpha-30-platformronde verpakt exact dezelfde programmahash; haar bronmetadata en checkoutcorrecties zijn afzonderlijk gecontroleerd.
