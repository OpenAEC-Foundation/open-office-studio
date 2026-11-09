# Leesbare native keuzelijsten in de sorteerdialoog (#205)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`.

De werkruimtedialoog staat in een portal buiten `.office`. Hij nam de
themakleuren over, maar gaf geen `color-scheme` aan de browser door.
Daardoor hadden native keuzelijsten in Forge lichte tekst op een witte
achtergrond. Gemeten in de echte sorteerdialoog: tekst `rgb(242,242,240)`,
achtergrond `rgb(255,255,255)`, `color-scheme: normal`.

De dialoogachtergrond geeft nu expliciet `light` door, of `dark` voor Forge.
De browser kiest daarmee ook de passende kleuren voor native opties,
uitgeschakelde velden, radio's en vinkjes. Er zijn geen wijzigingen aan
sorteerlogica, focusafhandeling of de engine.

## Browsercontrole

De oorspronkelijke en gecorrigeerde productiebuild zijn met Windows Chromium
bekeken. Een echte Yrs-sessie maakte een DOCX met een tabel van drie kolommen:
`Kolom A`/`Kolom B`/`Kolom C`, gevolgd door `Zebra` en `Alfa`. Die DOCX is in
de volledige Office Studio geopend. De eerste tabelcel is geselecteerd en de
echte dialoog via Table Design → Sort geopend.

- Alle zes keuzelijsten gebruiken in Forge `color-scheme: dark`, achtergrond
  `rgb(59,59,59)` en lichte tekst. De uitgeschakelde Type-velden blijven
  herkenbaar als uitgeschakeld.
- In het lichte thema blijven de velden wit met tekst `rgb(43,47,54)` en
  gebruiken ze `color-scheme: light`.
- De geopende Type-lijst toont Text, Number en Date leesbaar. Alle drie zijn
  selecteerbaar. De kopregeloptie wisselt tussen Column 1 en Kolom A.
- Oplopend sorteren behoudt de kop en geeft `Kolom A, Alfa, Zebra`.
  Undo herstelt `Kolom A, Zebra, Alfa`.
- De definitieve productiebuild is opnieuw gecontroleerd zonder geïnjecteerde
  CSS. De Vite-build slaagt. De meegeleverde fonts en CJK-fonts zijn voor de
  browserproef in de uitvoermap geplaatst; spelling staat uit.

Visuele bewijzen: [voor donker](afbeeldingen/issue205/voor-donker.png),
[na donker](afbeeldingen/issue205/na-donker.png),
[na licht](afbeeldingen/issue205/na-licht.png) en
[geopende opties](afbeeldingen/issue205/na-opties.png).

Dit is een CSS-wijziging van twee declaraties. De unit-testsuite is daarom
niet herhaald. De geïnstalleerde Windows-app, andere browsers en de
hoogcontrastmodus zijn niet opnieuw getest. De native Chromium-controls en
de productie-webapp zijn wel rechtstreeks bekeken en bediend.
