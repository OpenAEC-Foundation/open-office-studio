# Notities: alpha 39

De volledige lokale ronde op broncommit `8de85027545c1e2a56afde04453ba501b2d9c28a` slaagt met 403 reguliere Rust-tests, waaronder 161 UI-tests, zes afzonderlijke runtimeproeven en zeven Python-tests. Alle 674 bronbestanden zijn vóór en na de ronde bytegelijk; de terminal en alle acht onderliggende stappen eindigen met code 0. De herstelproef reproduceert de bron uit basiscommit en volledige patch. De Git-bron is hier onafhankelijk tegen alle vastgelegde bronhashes gecontroleerd.

Deze groene ronde is onvoldoende voor de gevraagde volledige migratie. De extra echte debugvensterproef keurt een snelle sleepbeweging van de zichtbare formaatgreep af. Met het tweede tekstvak actief faalt die snelle beweging ook bij herhaling; dezelfde beweging met pauzes slaagt. De eerste snelle beweging direct na openen slaagt wel. Een tussentijdse beweging met de oude greeppositie na vergroting is een ongeldige diagnoseopstelling en telt niet als productafkeuring. De eerste proef heeft hierdoor bij undo de eerdere teksttransactie teruggedraaid; die reeks geldt niet als geslaagde formaat-/undo-proef. Beide vensters zijn expliciet gestopt en eindigen met de exacte oorspronkelijke bronbytes.

De sectietypekeuze maakt in het echte venster een Markdown-kopie en daarna een canvas-kopie. Beide oorspronkelijke secties blijven behouden; twee undo-stappen en opslaan herstellen de oorspronkelijke bytes. De beelden bewaren tevens de tooltip die de keuzelijst gedeeltelijk afdekt. Dit is geen volledige beoordeling van alle nieuwe navigatie- en dubbelklikfuncties.

Een aanvullende test gebruikt rechtstreeks de echte runtime in plaats van de widgettesthulp. Op alpha39 faalt die bij 75%, 100% en 150% zoom: het vak blijft 560 bij 160 in plaats van de verwachte 640/224, 620/208 en 600/192. De eerste testopstelling had een dubbele, reeds bestaande devdependency en voerde geen tests uit; het aparte herhalingslog bevat de daadwerkelijke functionele afkeuring. Deze nieuwe fout is na de volledige groene ronde gevonden; beide resultaten blijven afzonderlijk bewaard.

Alle acht vergelijkingen met de oorspronkelijke interface blijven afgekeurd. Geen oorspronkelijke PNG, masker of tolerantie is aangepast. Alle dertig migratieacceptaties blijven false; geen stabiele native vrijgave en geen voltooiing op 100%.

`bewijskopieen.json` koppelt iedere kopie aan de oorspronkelijke ruwe bytes. Log- en patchbestanden zijn deterministisch gzip verpakt; uitpakken levert exact de oorspronkelijke bytes.
