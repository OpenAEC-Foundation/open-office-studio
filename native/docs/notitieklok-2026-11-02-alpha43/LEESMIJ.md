# Notitieklok en sluiten

De oorspronkelijke bouw toont bij een nieuw notitieboek 30 oktober tijdens een sessie op 2 november. De nieuwe regressie faalt op die productiecode. De sessieklok gebruikt één getypeerd UTC-moment per brontransactie; nieuwe pagina’s, secties, boeken, tekst en blokopmaak krijgen de juiste tijd. Openen en undo behouden de oorspronkelijke bronbytes en tijdstempels. De zichtbare kalenderdag volgt de systeemzone. Widgetproeven kiezen expliciet vaste tijd en UTC zonder de procesklok of tijdzone te wijzigen.

Zeven nieuwe kernproeven en twee UI-proeven slagen binnen 42 gerichte notitie-/presentatieproeven. De echte eerste klokbouw bewaart en heropent een nieuw notitieboek via GTK met behoud van de originele tijdstempel. Ctrl+W bleek nog niet aangesloten. Twee nieuwe sluitproeven falen vóór correctie; de modifier-/overlayproef slaagt. Een tussenliggende aansluiting verwisselde document-ID en tabindex en werd door de compiler afgekeurd. De gecorrigeerde aansluiting en drie gerichte proeven slagen, ook op een actieve derde tab in alle vijf modules.

Het definitieve eigen Linux-venster sluit een opgeslagen notitie via Ctrl+W met focus in de titel, toont een sluitvraag bij werkelijk getypte niet-toegepaste tekst, behoudt de tekst na annuleren en verwerpt uitsluitend het eigen proefconcept na Niet opslaan. De oorspronkelijke opgeslagen notitie blijft bytegelijk. De laatste documentomschrijving blijft nog ten onrechte in de lege statusbalk staan; dat wordt in een afzonderlijke shellstap hersteld.

De ruwe eerste vensterstappen bevatten onwerkzame toets-/klikpogingen door focus op een ander venster. In de eigen Xvfb zonder windowmanager is focus op app en GTK-dialoog expliciet aangebracht en vastgelegd. De latere muis-tabsluiting en GTK-heropening zijn apart gecontroleerd; de oude Ctrl+W-route blijft afgekeurd. Dit is geen bewijs voor automatisch focusherstel in een normaal venstersysteem.

De eerste bronfreezer las door een fout in de stuurcode een nog niet gemaakt manifest; de herstelde bronfreezer reproduceert alle 731 bestanden uit basiscommit en volledige patch. De volledige lokale ronde loopt nog. Alle dertig migratieacceptaties blijven false. Ruwe log- en patchbytes zijn verliesloos en deterministisch gzip verpakt.

## Afgesloten volledige lokale ronde

De [gecorrigeerde hertest](volledige-hertest/bewijskopieen.json) sluit alle negen stappen af: 430 reguliere Rust-proeven, waarvan 177 UI-proeven, zes daadwerkelijk afzonderlijk uitgevoerde runtimeproeven en zeven Python-tests. Alle 731 bronbestanden zijn exact hersteld uit basiscommit plus volledige patch en bytegelijk in werkboom en Git-index. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd; alpha43-platform- en geoptimaliseerde releasevenstercontrole blijven open. De eerste manifestomvang hierboven beschrijft het eerdere voorproefmoment.
