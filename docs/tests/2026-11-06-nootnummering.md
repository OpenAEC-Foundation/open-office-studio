# Nootnummering in de bestaande Writer-editor

Herstel en verificatie voor [#144](https://github.com/OpenAEC-Foundation/open-office-studio/issues/144),
6 november 2026. De melding blijft open totdat de reparatie is gemerged.

## Probleem en herstel

De vastgezette 0.5.1-kern gebruikt het interne noot-ID als hoofdtekstlabel.
Onderaan volgt de noot wel de gekozen notatie en startwaarde. Daardoor ontstaat
bij kleine Romeinse cijfers vanaf drie `1` tegenover `iii`, voor beide nootsoorten.

De correctie bepaalt het label vóór het meten, met de werkelijk geplaatste
noten en de bestaande formattering. Alle glyphs worden volledig gemeten, maar
het label blijft één ondeelbare eenheid en één documentpositie. Tekenen,
klikken en selecteren behouden dat bereik. De DOCX-verwijzing behoudt het
semantische noot-ID: het nummer wordt geen letterlijke tekst of veld.

Ook de losse layoutmodule moet dezelfde atoomgrenzen begrijpen. Een gerichte
tegenproef toont dat de oorspronkelijke losse module bij een atomair gemeten
`iii` alleen `i` tekent. Daarom bevatten **beide** WASM-modules de broncorrectie.
Hun imports en exports blijven gelijk aan de oorspronkelijke modules.

Broncommit, volledige patch, gereedschappen, checksums, licenties en het
bouwscript staan bij de [tekstkern](../../vendor/tekstengine/README.md). De
bronpatch past zonder fuzz; alle zeven gewijzigde bestanden zijn bytegelijk
aan de gebruikte proefbron. De bouwcontrole weigert een andere bronpatch,
WASM-checksum of JS/WASM-interface.

## Controles met de definitieve modules

| Controle | Uitkomst |
| --- | --- |
| Volledige Office-set, beide aangepaste modules | 147 bestanden; 1.664 geslaagd, zeven bestaande overgeslagen gevallen |
| Volledige native tekstkern | 982 geslaagd, nul mislukt, twee bewust overgeslagen prestatieproeven |
| Volledige native layoutkern | 598 geslaagd, nul mislukt |
| Gerichte nummerproef | Tien gevallen, beide tekenroutes en beide trefferroutes, vóór en na opslaan/heropenen |
| Typecontrole en productiebuild | Geslaagd; precies één edit- en één layout-kern met de vastgelegde checksums |
| Native Tauri-proefbouw | Geslaagd |
| Edit-interface | Dezelfde 30 imports en 298 exports |
| Layout-interface | Dezelfde 12 imports en 33 exports |

De nummerproef controleert voet- en eindnoten met decimale cijfers, kleine en
grote Romeinse cijfers en kleine en grote letters vanaf drie. Beide helften van
het label geven de juiste cursorpositie; selectie omvat de volledige glyphbreedte.
Het opgeslagen pakket bevat de juiste instellingen en hetzelfde semantische ID.
Met de oorspronkelijke edit-kern mislukken alle tien gevallen op de verkeerde
hoofdtekstlabels.

De twee aanvullende Rust-proeven controleren bovendien één cluster, de volledige
opgemaakte breedte, geen splitsing bij één pixel beschikbare breedte, gelijke
JSON-/directe meting en cursorgeometrie voor tekst- en glyphprimitieven in beide
tekstrichtingen. De bestaande cacheproef blijft ongewijzigd groen: de tijdelijke
labelmeting voegt geen extra bewaarde vormplaatsingen toe.

## Echte native bediening op Linux

In een eigen X11-scherm en leeg lokaal profiel zijn beide nootsoorten via
**References → Note Format** eerst op decimaal vanaf één gezet en daarna
afzonderlijk op kleine Romeinse cijfers vanaf drie. Hoofdtekst en noten volgen
beide wijzigingen. Tekstinvoer, Undo en Redo behouden de nummering.

Ctrl+S schrijft het echte bestand. De native titel blijft vervolgens minstens
twee seconden onafgebroken schoon. Onafhankelijke ZIP/XML-inspectie vindt
`lowerRoman` vanaf drie voor beide nootsoorten, de oorspronkelijke noot-ID’s en
de nieuwe proeftekst. Na het sluiten van de tab en heropenen via de native
bestandskiezer blijven tekst, labels en documentposities correct; status Ready,
nul consolefouten. Deze uitgebreide bedieningsproef gebruikte de definitieve
edit-kern; de losse layoutmodule was toen nog de oorspronkelijke npm-module.

Zie het [controlebestand](nootnummering-native-2026-11-06.json) en het
[opgeslagen DOCX-proefbestand](nootnummering-native-2026-11-06.docx). De
[hoofdtekst](../screenshots/test-nootnummering-native-hoofdtekst-2026-11-06.png) en
[beide noten](../screenshots/test-nootnummering-native-noten-2026-11-06.png) zijn
na heropenen op 100% visueel gecontroleerd.

De opnieuw gebouwde native app is daarna met **beide definitieve modules**
gestart. Ook daarin slagen invoer, Undo, echt opslaan, tab sluiten en heropenen
via de native bestandskiezer. De onafhankelijke XML-controle en de twee seconden
blijvend schone titel slagen opnieuw. Beide verwijzingen en terugkoppelingen
blijven `iii`, elk met één documentpositie; status Ready, nul consolefouten.
Dit staat afzonderlijk onder `definitieveCombinatie` in het controlebestand.
De gekoppelde schermbeelden zijn van deze definitieve combinatie.

## Resterende vrijgavecontroles

- Platformcontroles van de PR.
- Deze omgeving levert direct native bewijs voor Linux; een afzonderlijke
  native bedieningsproef op Windows en macOS is hier niet uitgevoerd.

De bredere functiecriteria van #51 worden hiermee niet automatisch afgetekend.
Deze wijzigingen zitten nog niet in de gepubliceerde installers van v2026.45.1.
