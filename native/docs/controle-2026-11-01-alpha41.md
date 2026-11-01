# Native controle, 1 november 2026: alpha 41

**2026.44.9-alpha.41** vult de gebeurtenisgebonden posities aan voor aanrakingen en verstuurt de eerste X11-schermpresentatie direct. Een oude muiscursor mag geen andere knop activeren; een gepresenteerd beeld mag niet wachten op de volgende tekenronde. De gepubliceerde runtime- en softbufferbronnen en hun licenties zijn behouden; lokale correcties zijn met hashes vastgelegd.

Alle **vijf gerichte proeven** slagen: vier echte runtimeproeven voor muis, focus/cache, gewone knoppen en aanrakingen, plus één Linux-X11-contracttest met een eigen tijdelijk scherm en onafhankelijke waarnemer. Rustfmt, Clippy en bronpins slagen. De oorspronkelijke aanraak- en presentatieafkeuringen, compile-/opstellingsfouten en herhalingen staan in de [verliesloze bewijzenset](invoer-en-presentatie-2026-11-01-alpha41/LEESMIJ.md).

De Windows-afkeuring van [alpha40](controle-2026-11-01-alpha40.md) is apart behouden. Alleen beide nieuwe vendorfolders krijgen dezelfde bytevaste checkoutregel als de bestaande vastgepinde bronnen. Een tijdelijke eigen index met core.autocrlf=true reproduceert vijftig afwijkingen vóór en nul na de correctie. Geen oorspronkelijke bronhash of bestaande logregel is aangepast. De overige 649 dependencyversies en registrychecksums blijven gelijk.

De volledige lokale ronde op **727 bronbestanden** loopt nog. De verwachte Linux-omvang is 408 reguliere Rust-tests, waaronder 165 widget/UI-tests en één afzonderlijke X11-contracttest, zes runtimeproeven en zeven Python-tests. De volledige aantallen zijn bij deze tussenstand nog niet bevestigd. De Linux-contracttest is op andere platforms niet van toepassing. De alpha41-platformronde moet nog worden afgerond; alpha40 is geen geslaagde gezamenlijke platformronde.

De echte debugvensters reageren nog te laat op de menucontrole van drie seconden. Met langere wachttijd wordt dezelfde toestand zonder nieuwe invoer correct zichtbaar. De geoptimaliseerde alpha40-Linux-build van dezelfde alpha40-bron toont Bestand en de terugkeer met Escape al in de eerste opname. Dat is geen geoptimaliseerde alpha41-proef en wist de oorspronkelijke debugafkeuringen niet. De geoptimaliseerde alpha41-build wordt apart getest.

Alle oorspronkelijke UI-vergelijkingen en ontbrekende suitefuncties blijven open. De volledige alpha41-pixelronde is nog niet afgesloten. Alle dertig migratieacceptaties blijven false; geen stabiele vrijgave of claim op 100%.
