# Recente bestanden binnen de browsertabsessie (#13)

De browservariant van de recente-bestandenlijst bewaarde namen en tijdstippen
permanent in `localStorage`, hoewel klikken alleen de bestandskiezer opent.
Bij geblokkeerde opslag verdween zelfs een zojuist geopend bestand direct uit
de lijst. Deze deelfix gebruikt `sessionStorage` voor de huidige tabsessie,
verwijdert de oude permanente namenlijst en houdt de actuele lijst in het
geheugen als lezen of schrijven niet is toegestaan. Ongeldige datums uit de
sessie worden genegeerd voordat de interface ze weergeeft.

Een paginaherlaadbeurt behoudt de sessielijst wanneer sessieopslag beschikbaar is.
Een nieuw, onafhankelijk tabblad krijgt een eigen lijst. Zoals gebruikelijk kan
een browser bij het dupliceren of herstellen van een tabblad de tabsessie kopiëren.
De Nederlandstalige en Engelstalige uitleg benoemt de sessie expliciet.

## Reproductie en controles

Bron: `main` op `f4a03889`, Windows x64, Node 24.22.1, Chromium via Playwright 1.62.1.

- De nieuwe sessieopslagregressie faalt op de oorspronkelijke implementatie:
  de permanent opgeslagen oude naam blijft staan en de nieuwe naam belandt ook
  in `localStorage`.
- De gerichte Vitest-proeven controleren sessieopslag, herladen, een nieuwe
  sessie, geblokkeerde opslag, een schrijffout bij volle opslag, ongeldige
  datums en de bestaande sorteer-, limiet- en vastzetregels.
- TypeScript (`tsc --noEmit`) en de Vite-productiebouw slagen.
- De controle van de gewijzigde `backstage`-vertalingen in nl/en slaagt.
  De bestaande waarschuwingen over niet-aangeboden taalmappen blijven staan.
- `scripts/test-recent-browser.mjs` controleert de echte productie-interface:
  vastzetten, wissen met behoud van vastgezette namen, opnieuw kiezen,
  herladen, een onafhankelijk nieuw tabblad, verwijderen en opruimen van oude
  permanente namen. Bij geweigerde recente-bestandenopslag wordt een TXT-bestand
  werkelijk geopend; de naam blijft zichtbaar en vastzetten, wissen en
  verwijderen werken. Er zijn geen `pageerror`-meldingen in deze ronde.
  [Uitkomst](recente-browserbestanden-2026-11-09.json).

De lokale dependencykopie had uitgepakte pnpm-koppelingen. Voor de GUI-bouw zijn
React, React DOM, i18next en react-i18next daarom via een lokale Vite-config
ontdubbeld; de repositoryconfig is niet gewijzigd. De gewone productiebouw
zonder deze lokale aanpassing slaagt ook. De native desktopapp en de inhoudelijke
Writer-bewerking zijn geen onderdeel van deze browseropslagproef.

## Resterend bereik

#13 blijft open. Deze ronde voegt geen File System Access-handles, Windows Jump
List of instelbare limiet toe. De bestaande limiet van twintig namen/paden blijft
bestaan; het issue vraagt standaard vijfentwintig. Desktopopslag en desktopopenen
zijn niet gewijzigd.
