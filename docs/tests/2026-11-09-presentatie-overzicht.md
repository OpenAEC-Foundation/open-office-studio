# Bewerkbaar presentatie-overzicht (#76)

Beeld → Overzicht toont de tekstalinea's van alle dia's. Invoer wordt
synchroon in de echte presentatie opgeslagen, zodat ook Ctrl+S met de cursor
nog in een tekstveld de laatste invoer bevat. Alleen gewijzigde tekst wordt
vervangen; omliggende tekenopmaak blijft behouden. Enter of geplakte
regeleinden voegen alinea's toe. Een meervoudige invoeging is één Undo-stap.
De dia-aanduiding opent die dia in de normale weergave.

De helper gebruikt de openbare PPTX-tekstlezing met actuele alinea-id's,
versiecontrole en tekstbewaking. Een intussen gewijzigde alinea wordt niet
overschreven. Unicode-grenzen worden op volledige codepunten berekend.
Pakketbewerkingen/herladen zijn voor deze tekstinvoer niet nodig.

Twaalf tests met de echte PPTX-kern slagen: alle dia's lezen, UTF-16-grenzen,
bewerken, opmaak behouden, oude invoer weigeren, nieuwe alinea's, Undo/Redo en
PPTX bewaren/heropenen en veilig weigeren zonder eerdere acties terug te
draaien. De productie-Chromiumproef slaagt in zes scenario's:
alle dia's, direct Ctrl+S en echte download, Undo/Redo, Enter met vervolgfocus,
dianavigatie en het gedownloade bestand opnieuw openen. Geen paginafouten.

```text
node node_modules/vitest/vitest.mjs run src/presentatie/overzicht.test.ts --maxWorkers 2
node scripts/test-presentatie-overzicht.mjs
```

Voor de browserproef: bouw eerst, kopieer beide meegeleverde fontpakketten
naar `public/fonts` en stel zo nodig `OFFICE_TEST_DIST` en
`OFFICE_PLAYWRIGHT_MODULE` in. De laatste variabele accepteert een module-URL
van een bestaande Playwright-installatie. Uitvoer staat in
`.local/proef-presentatie-overzicht/`.

De browser gebruikt de volledige Office Studio zonder editorstubs. Spelling
staat uit. Er is geen nieuwe native Windows-installer gebouwd. Deze wijziging
vult het overzichtsonderdeel in; kopiëren/hergebruiken van dia's tussen
presentaties blijft binnen #76 nog open.

TypeScript en Vite-productiebouw slagen. De volledige suite met twee workers
en een vijftiensecondenlimiet slaagt: 176 bestanden, 1.999 tests geslaagd en
tien bestaande corpusoverslagen. De gerichte presentatie-/zoek-/opdracht- en
i18n-controles slagen eveneens; de nieuwe labels staan in alle negen
aangeboden interfacetalen.
