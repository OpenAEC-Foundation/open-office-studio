# Zoekfocus, alpha 35

Een uitgestelde openingsfocus van Zoeken kon een later gekozen documentcursor overnemen. De oorspronkelijke echte alpha-34-Writer-route blijft lokaal en in CI afgekeurd; haar ongewijzigde bestanden en cursoronderzoek staan bij de [alpha-34-vensterproeven](../vensterproeven-2026-11-01-alpha34/LEESMIJ.md).

Twee aanvullende proeven met echte sluitknopklikken slagen al vóór de correctie. De volgende proef stelt de latere paginacursor vast, voert daarna de oude openingsopdracht uit en typt 9: de oude bron faalt op ontbrekende documentinvoer. De sluitknop is daarmee niet zonder meer de oorzaak. De negatieve bronpatch en alle 667 bronhashes zijn buiten de werkboom volledig hersteld en gecontroleerd.

Alpha 35 registreert muisklikken, toetsaanslagen en aanraakacties vóór de widgetafhandeling, ook in bovenliggende keuzemenu’s. Een al gemaakte focusvraag vervalt na nieuwe bediening. Zij controleert daarnaast of het unieke zoekveld van dat paneel en document nog bestaat in de actuele bedienbare widgetboom. De registratie tekent niets en verbruikt de gebeurtenis niet.

Acht nieuwe widgetproeven controleren twee echte sluitklikroutes, onmiddellijke vervolginvoer in dezelfde widgetronde, een latere paginacursor, normale zoekinvoer met een eigen proefklembord, een later lettertypeveld, een nieuwe cursor in dezelfde alinea en een nieuw paneel of document. Tekst, bronwijziging en bronexacte undo blijven waar toepasselijk verplicht. Dit is geen volledige focus-/IME-/platformmatrix.

Een eerste grensproef verwachtte ten onrechte een onveranderde editorversie na een tweede klik in dezelfde alinea. De bestaande code vernieuwt die versie bij iedere klik. Haar oorspronkelijke afkeuring blijft behouden; de hertest verlangt dezelfde alinea-ID, exact één versieverhoging en cursorpositie 8 vóór de oude focusvraag. De tekst-, bron- en undo-eisen zijn niet afgezwakt. Ook die oorspronkelijke 668 bronbytes zijn volledig uit de patch hersteld.

De volledige bronronde slaagt op 382 reguliere Rust-tests, waaronder 145 UI-tests, zes afzonderlijk uitgevoerde runtimeproeven en zeven Python-tests. Rustfmt, Clippy met waarschuwingen als fouten, bronpins en onafhankelijke lezers slagen. Alle 668 bronbestanden blijven vóór en na de ronde bytegelijk. De complete bronpatch herstelt die bytes vanaf de vastgelegde Git-basis.

Alle 57 volledige native widgetbeelden zijn vastgelegd. Vijftien gedeelde documentbeelden, acht letterbeelden en de vijf oorspronkelijke renderer-goldens blijven gecontroleerd. De vier oorspronkelijke browser- en vier afzonderlijke desktopvergelijkingen blijven zonder maskers, herschaling of tolerantie zichtbaar; dit is geen bewijs van oorspronkelijke pixelpariteit.

De eigen alpha-35-releasebouw, volledige platformronde en echte releasevensterhertests blijven afzonderlijk vereist. Geen stabiele native vrijgave of volledige migratiegoedkeuring.

De eerste bewijsaudit struikelt op haar parser voor Git-witruimtemeldingen: een EOF-melding heeft geen volgende +regel. De oorspronkelijke auditbron en foutlog blijven behouden. De aparte hertest onderscheidt beide echte Git-uitvoervormen, met ongewijzigde bron-/index-/beeld-/patchcontroles en uitsluitend exacte ruwe uitzonderingen.
