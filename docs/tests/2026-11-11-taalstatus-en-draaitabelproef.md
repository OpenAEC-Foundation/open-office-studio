# Writer-taalstatus en draaitabelproef — 11 november 2026

De volgende bundel neemt de afzonderlijke taalstatuswijziging uit
`3c2595ca22134bc776132a4790e3e6851d07196a` op boven PR #348, via merge
`11f9f9286255ec4f727da2a58242ad55caad4584`. De bronhistorie blijft behouden.
De eerder wachtende macOS-controle van [42811197323](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42811197323)
is inmiddels geslaagd; alle drie platformen van die oorspronkelijke bron
zijn groen. Nieuwe combinatiecontroles worden afzonderlijk uitgevoerd.

TypeScript en 29 gerichte taalvolger-, editorvolger- en draaitabeltests slagen.
De gewone productiebuild en beide aparte meetbuilds slagen. De oorspronkelijke
CPU4-meting liet minder taalopzoekingen maar een langere totale fase zien;
dit verslag claimt daarom geen algemene snelheidswinst. Vergelijkingen moeten
ook de uitgestelde rustfase meenemen. De nieuwe productie- en CPU4/CPU8-proeven
worden bij hun exacte codepunt vastgelegd voordat deze bundel wordt gemerged.

## Draaitabeldriver

De productieproef voor #69 slaagde bij aanmaken, verversen, filtering,
groepering en heropenen, maar selecteerde voor de importcontrole blind A1.
De fixture met paginafilter heeft haar standaard `location` in A4:C7. Zonder
app-specifieke layoutmetadata ligt A1 buiten dat bereik; de interface opent
terecht een nieuwe draaitabel. De driver selecteert nu de linkerbovencel uit
het werkelijke geïmporteerde bereik en bevestigt dat de eigen metadata ontbreekt.
Alle zes stappen slagen op de gewone productiebuild, met bytegelijk behoud van
alle pivot-/cacheonderdelen en zonder paginafouten. Er is hiervoor geen
productcode gewijzigd en de oorspronkelijke mislukking blijft lokaal bewaard.

Aanvullende afsluiting: #82 (vier grafiekcriteria, zeven geslaagde
productie-browserstappen) en #43 (86 catalogusextensies, 32 onveranderlijke
importfixtures en expliciete ontbrekende voorbeelden) zijn op de reeds
gemergede integratie afgehandeld. Zie het bijgewerkte afhandelregister.
