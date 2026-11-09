# #52: bestaande bladwijzers bezoeken

De gebruikerslijst in Ctrl+G › Ga naar heeft nu **Bladwijzer**. Hij toont
bestaande gebruikersbladwijzers in de hoofdtekst en in (geneste) tabellen,
zonder interne Word-markeringen zoals `_Toc...` en `_GoBack`.

De huidige bookmark-offset uit de echte Yrs-sessie bepaalt de cursorpositie.
De native `bookmarkPosition`-projectie gaf in de controle 0 terug voor een
bladwijzer op tekstoffset 5; daarom gebruikt deze route de exacte sessieplek.
Bij activeren wordt de naam opnieuw opgezocht, zodat tussentijds typen of
Undo/Redo geen oude posities gebruikt. Een verdwenen bladwijzer geeft een
melding en verplaatst de cursor niet.

Zeven gerichte tests slagen. Drie daarvan gebruiken echte DOCX/Yrs-sessies
voor hoofdtekst/tabel, typen, Undo/Redo, opslaan/heropenen en verwijderen.
`scripts/proef-bladwijzers.mjs` controleert de productie-interface via Ctrl+G,
selectie uit de lijst, typen na het navigeren en opslaan/downloaden. De
gedownloade XML bevestigt invoeging op offset 5 in de hoofdtekst en offset 4
in de tabelcel. Geen paginafouten. TypeScript, Vite-productiebouw en de
vertaalcontrole voor alle negen aangeboden talen slagen. De volledige suite
slaagt met 1.990 tests in 176 bestanden en tien bestaande corpusoverslagen.

Dit is een eerste onderdeel van #52. Bladwijzers toevoegen/verwijderen,
bijschriften en kruisverwijzingen zijn hiermee niet toegevoegd. Er is geen
nieuwe native Windows-build gemaakt. De Node-proeven stubben alleen de
weergavemeldingen; documentmutaties en opslag gebruiken de productie-WASM.
