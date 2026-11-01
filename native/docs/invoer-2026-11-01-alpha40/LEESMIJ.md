# Snelle muisinvoer: alpha 40

De aanvullende alpha39-proef met de echte runtime faalt bij drie zoomniveaus. Alpha40 bewaart de muispositie per gebeurtenis, inclusief cachebehoud over frames en afscherming door overlays. Alle drie gerichte runtimeproeven slagen: snelle zichtbare greep, focus-/cachebehoud met bronexacte undo en twee gewone knoppen in één invoerreeks. De oorspronkelijke frameworkbron en licentie zijn vastgelegd in de runtimebronpin.

Het echte debugvenster voert 51 geregistreerde stappen uit, inclusief wachten en expliciet stoppen. Twee snelle grepen met focus in het andere tekstvak leveren telkens 620 bij 218 op; beide undo-stappen herstellen de oorspronkelijke bytes. Een dubbelklik op 800/700 maakt een tekstvak op bronpositie 322/370; tekstinvoer en twee afzonderlijke undo-stappen zijn onafhankelijk teruggelezen. Alle overige bronvelden blijven exact gelijk; alleen de bijgewerkt-tijd van de bewerkte pagina mag monotone wijzigen.

De vensterproef is niet volledig goedgekeurd: bestandsmenu-/Escape-beelden lopen achter. Eén afzonderlijke Expose toont de actuele toestand zonder documentopdracht. Die afkeuring blijft bewaard en wordt apart onderzocht. Geen volledige functie-, platform- of pixelpariteit; alle dertig migratieacceptaties blijven false.

De eerste bouwcontrole vond een herstelde leenfout. Een volgende poging liep vast bij een volle schijf vóór de runtimeproef kon uitvoeren. De originele bron en logs zijn behouden; de geslaagde herhalingen staan apart. Oude eigen gegenereerde meet-/testprogramma’s zijn uitsluitend na hash-, leeftijd-, link-/modus- en actieve-inodecontrole opgeruimd. Vaste programma’s, bronnen, ruwe bewijzen en releases bleven behouden.

De volledige ronde op 694 bronbestanden loopt nog bij deze tussenstand. De bron is uit basiscommit en patch onafhankelijk hersteld; de drie gerichte proeven en de afgebakende vensterbroncontrole zijn afgesloten. `bewijskopieen.json` koppelt alle kopieën aan de oorspronkelijke bytes.
