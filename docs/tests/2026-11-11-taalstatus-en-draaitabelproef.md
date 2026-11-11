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
ook de uitgestelde rustfase meenemen. De uitgevoerde productie- en CPU4/CPU8-proeven
staan hieronder bij hun exacte codepunt vastgelegd. De prestatievoorwaarde
voor samenvoegen is nog niet gehaald.

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

## Uitgevoerde productie- en prestatieproeven

De gewone productiebuild slaagt voor 25 taal-, selectie-, typ-, Undo/Redo-,
opslaan/heropenen- en tabbehoudcontroles. De meetfixture bevat 600 alinea’s,
79 pagina’s en 2400 opzettelijke spelfouten. Alle fasen bevatten de uitgestelde
rustperiode; werk is niet buiten de meting geschoven.

| Proef | Typfase | Documentlezingen | Taalopzoekingen bij selectie |
|---|---:|---:|---:|
| Baseline CPU4, eerste | 5941,94 ms | 8 | 2 |
| Kandidaat CPU4 | 9528,99 ms | 5 | 1 |
| Baseline CPU4, tweede | 6083,38 ms | 7 | 2 |
| Kandidaat CPU8 | 20586,48 ms | 5 | 1 |

De eerste baselineproef stopte later bij de geometriecontrole op pagina 40:
verwacht en werkelijk waren allebei nul, terwijl de proef daar zichtbare
markeringen vereist. De tweede baselineproef en beide kandidaatproeven slagen
voor alle 29 geometriecontroles, exacte tekstinhoud, caretpositie en exact
opslaan/heropenen, zonder paginafouten. De oorspronkelijke mislukking blijft
onderdeel van het meetregister. Voor CPU8 is geen baseline gemeten.

De kandidaat doet minder documentlezingen, maar is bij CPU4 in deze metingen
langzamer. Daarom blijft PR #349 concept en blijft #327 open. Dit is geen bewijs
van een algemene prestatieverbetering. Zie het bijbehorende JSON-meetregister.
De release 2026-W46.1 bevat deze kandidaat niet.

Alle zestien gecombineerde CI-controles zijn geslaagd op
`679d0edfde2924cbde489e7e179b2e783b6e1e8d`, inclusief Windows, Linux en macOS.
De daarna toegevoegde verslagen wijzigen uitsluitend documentatie. Het groene
CI-resultaat heft de nog niet behaalde prestatievoorwaarde niet op.
