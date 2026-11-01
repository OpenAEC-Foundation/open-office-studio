# Native controle, 1 november 2026: alpha 40

**2026.44.9-alpha.40** herstelt snelle muisinvoer. De oorspronkelijke runtime gebruikte voor een hele reeks de laatste muispositie; daardoor miste een snelle greep zijn beginpunt. De lokale runtimecorrectie bewaart de positie per gebeurtenis, over nieuwe UI-layouts heen en afzonderlijk voor overlays. De oorspronkelijke bron en MIT-licentie zijn met hashes vastgelegd.

Alle **drie gerichte runtimeproeven** slagen, evenals Rustfmt, Clippy en bronpins. Het echte debugvenster bevestigt twee snelle grepen met focus in het andere vak, een vrij tekstvak via dubbelklik, tekstinvoer en bronexacte undo. De [verliesloze bewijzenset](invoer-2026-11-01-alpha40/LEESMIJ.md) bevat de ruwe logs, volledige bronpatch, herstelcontrole en alle 51 geregistreerde vensterstappen. Dit zijn geen 51 afzonderlijke functies.

De volledige lokale ronde op **694 vastgelegde bronbestanden** loopt nog. De verwachte omvang is 406 reguliere Rust-tests, waaronder 164 UI-tests, zes afzonderlijke runtimeproeven en zeven Python-tests; de complete aantallen zijn bij deze tussenstand nog niet bevestigd. De alpha40-platformronde start na het pushen van deze bron. De [afgesloten alpha39-ronde](controle-2026-11-01-alpha39.md) blijft aan haar eigen bron en programma’s gekoppeld.

De echte vensterproef vindt tevens achterlopende menubeelden: na Escape blijft het bestandsmenu zichtbaar totdat een afzonderlijke hertekening het actuele notitiecanvas toont. Een aparte X11-kleurdiagnose bevestigt dat een eerste presentatie pas zichtbaar wordt wanneer de bestaande schermverzoeken expliciet worden verstuurd. Een lokale prototypecorrectie slaagt zonder extra frame of invoer, maar is nog niet in deze alpha40-bron geïntegreerd. Dit blijft een open weergavefout.

De acht oorspronkelijke UI-vergelijkingen blijven afgekeurd; de volledige alpha40-pixelronde is nog niet afgesloten. Ook andere suitefuncties, fysieke Windows-/macOS-vensterproeven, installers en volledige bestandspariteit blijven open. Alle dertig migratieacceptaties blijven false; geen stabiele vrijgave of voltooiing op 100%.
