# Presentatie: eerste bron en afkeuringen

De eerste volledige alpha42-bron is uit basiscommit en volledige patch hersteld. Alle 729 bronbestanden blijven vóór en na de uitgevoerde ronde bytegelijk. Workspacebouw, rustfmt en Clippy slagen. Van de reguliere Rust-proeven slagen 413 en falen er twee; zes runtimeproeven zijn overgeslagen. Het testproces eindigt met 101, de controller met 1. De latere onafhankelijke lezers, Python- en runtimecontroles zijn in deze ronde niet gestart.

De vroege terugkeer voor achtergrondminiaturen sloeg de bestaande hervatting van rasterinvoer, zoeken en Writer-invoer over. Daardoor bleef een vertraagde plakactie bij terugkeer naar een tabblad hangen en werd een volgende zoektreffer na vervangen niet bijgewerkt. Beide bestaande proeven slagen na herstel van de gezamenlijke afhandeling.

De aanvullende echte Linux-vensterproef laat een tijdelijk verdwenen notitiepaneel bij diawisseling zien. De nieuwe regressieproef faalt eerst op het te vroeg gewijzigde dianummer en slaagt na herstel: de oude editor blijft eigenaar tot het nieuwe antwoord en is tijdens het laden geblokkeerd. In het eerste debugvenster werd een snelle Ctrl+Z/Ctrl+S-reeks bovendien niet opgeslagen. Nieuwe notities waren wel correct bewaard; alle diateksten en eerdere notities bleven behouden. De nieuwe opslagproef reproduceert het genegeerde verzoek en slaagt na de eerste wachtrijcorrectie, inclusief afbreken bij een mislukte bronopdracht.

De vroege X11-opstellingsafkeuring miste het expliciete pad naar het eigen Xvfb-programma; met dat pad slaagt de proef. De eerste onafhankelijke XML-controle vergeleek ook attribuutvolgorde. De nieuwe notitieverwijzingen serialiseren attributen opnieuw. De lezer controleert nu alle waarden, tekst en kindvolgorde; alle overige ZIP-delen blijven bytegelijk. Dat is geen claim op volledige ZIP-bytepariteit.

Alle ruwe kopieën zijn gehasht; log- en patchbytes zijn deterministisch gzip verpakt. De volledige gecorrigeerde ronde, platform- en vensterhertests blijven open. Alle dertig migratieacceptaties blijven false.

## Afgesloten hertest op 2 november

De beschrijving en de manifestomvang hierboven leggen het eerdere afkeuringsmoment vast. De gecorrigeerde lokale ronde is inmiddels groen: 418 reguliere Rust-proeven, waarvan 172 UI-proeven, zes afzonderlijke runtimeproeven en zeven Python-tests. De [volledige hertestbewijzen](volledige-hertest/bewijskopieen.json) bevatten alle negen stapstatussen, de terminal-eindcode, de 729 bronhashes en de volledige reproduceerbare patch. De aanvullende Linux-debugvensterproef bewaart het paneel en herstelt snelle undo/opslaan bytegelijk. Alle oorspronkelijke UI-vergelijkingen blijven afgekeurd; alpha42-platform- en geoptimaliseerde releasevensterproeven zijn nog open.
