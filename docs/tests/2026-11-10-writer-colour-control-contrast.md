# Writer kleurknopcontrast — #281

## Zelfstandig gereproduceerd

De highlighterknop kreeg het donkere thema-voorgrondteken
`rgba(250, 250, 249, 0.6)`, maar hield het lichte hovervlak `rgb(243,244,246)`.
Na alfamenging is het glyphcontrast ongeveer **1,03:1**. Dit is met de echte
productieapp, een geopende DOCX, actieve selectie en daadwerkelijke muishover
gemeten in Windows Chromium. De twee gebruikersscreenshots zijn het
oorspronkelijke signaal, geen zelfstandig native testresultaat.

Het oude artifact kwam uit de geteste rich-notes-branch op `9afc96b5`.
De relevante oorspronkelijke `Ribbon.tsx`, `BevestigdeKleur.tsx` en
kleurknop-/themastijlen komen overeen met de vaste huidige basis `d978918d`.

## Correctie

De gedeelde `.ribbon-kleur`-component krijgt een themagebonden achtergrond,
hover-/open-picker-vlak, voorgrond en focusrand. Alleen het kleurstaaltje
blijft de daadwerkelijke documentkleur tonen; de buitenrand houdt ook wit
en zwart herkenbaar. Geforceerde systeemkleuren krijgen systeemkleuren voor
de bediening, terwijl het staaltje zijn ingestelde kleur bewaart.

De geïsoleerde stijl werkt met bestaande thematokens en wint ook wanneer
de basisstijlen later geladen worden. Er is geen wijziging aan de
markeeropdracht of de opgeslagen tekstopmaak.

## Bewijs

De gedeelde productieproef `scripts/test-writer-dark-view.mjs` meet normale,
hover-, focus- en geopende picker-toestanden in donker en licht. Het nieuwe
donkere hovercontrast is ongeveer **8,93:1**. Beide thema's halen voor de
geteste ingeschakelde kleurknoppen minstens 4,5:1.

Een gekozen rode markering werkt op de oorspronkelijke geselecteerde
woorden en wordt als `w:shd w:fill="e01b24"` opgeslagen. Het staaltje wordt
rood, terwijl de glyph de leesbare themakleur houdt. Wisselen van het
toepassingsthema verandert de opgeslagen DOCX-kleuren niet.

Ook de aangrenzende tekstkleur wordt op bestaande tekst op groen gezet:
de publieke SDK-status meldt `008844` en het bijbehorende staaltje wordt groen.
De gemelde blijvende/oude kleurindicator kon hiermee niet als afzonderlijke
fout worden bevestigd. Het vastgestelde probleem is het glyphcontrast;
gesloten #125 over onjuiste opgeslagen markeringen wordt niet heropend.

De gecombineerde suite is groen: **2.856 tests / 10 bestaande skips**,
TypeScript, productiebuild, negen aangeboden talen en tien echte
browsergevallen. Zie [de weergaveproef](2026-11-10-writer-dark-view.md) voor
commando's, artifacts en grenzen. Native Windows-toestanden en herstarttest
staan bij de Windows-testchat voor een volgende integratieronde; deze bron
is niet in de huidige vaste installer gezet.
