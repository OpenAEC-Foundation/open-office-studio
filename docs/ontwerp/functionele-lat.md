# Functionele lat voor OpenAEC Office

De volledige suite wordt naar Rust gemigreerd, inclusief de native interface in OpenAEC-stijl. De bestaande desktoprelease blijft de referentie voor functies, documentgedrag en uiterlijk. De toepassingen moeten in dagelijkse bewerkingen aanvoelen als gangbare kantoorprogramma’s voor tekst, rekenbladen, presentaties, notities, e-mail en databases. Een werkbalk of bestandsviewer alleen voldoet niet. Onderstaande onderdelen zijn acceptatiedoelen, geen verklaring van bestaande ondersteuning.

| Module | Vereist voor een bruikbare eerste versie | Daarna uitbreiden |
| --- | --- | --- |
| Open Tekst Studio | Paginaweergave, stijlen, tekst- en alineaopmaak, lijsten, tabellen, afbeeldingen, marges, kop/voetteksten, paginanummers, zoeken/vervangen, undo/redo, DOCX openen/bewerken/opslaan, PDF/afdrukken | Inhoudsopgave, voetnoten, opmerkingen, wijzigingen bijhouden, secties, spelling, ODT, samenvoegen |
| Open Rekenblad Studio | Meerdere bladen, celtypen en opmaak, formules met correcte herberekening en fouten, verwijzingen, kopiëren/plakken, doorvoeren, sorteren/filteren, kolombreedtes, XLSX/CSV openen en opslaan | Grafieken, draaitabellen, validatie, voorwaardelijke opmaak, benoemde bereiken, ODS |
| Open Presentatie Studio | Dia’s toevoegen/verwijderen/herschikken, thema’s, tekst, afbeeldingen, vormen, uitlijnen, dupliceren, notities, diavoorstelling, PPTX openen/bewerken/opslaan | Tabellen, grafieken, diamodellen, overgangen, animaties, ODP |
| Open Database Studio | MDB/ACCDB lezen, objectbrowser, tabellen en typen, zoeken/filteren, export, querydefinities en beschikbare VBA-bron tonen | Relaties, query-uitvoering, formulieren, rapporten, bewerken van kopieën; VBA-uitvoering apart onderzoeken |

Iedere module heeft openen, opslaan als, recente bestanden, sneltoetsen, duidelijke foutmeldingen en bescherming tegen verlies van wijzigingen nodig. Offlinewerking en behoud van inhoud bij opnieuw openen zijn releasevoorwaarden. Ontbrekende ondersteuning wordt expliciet aangegeven; conversie mag niet stilzwijgend objecten of formules verwijderen.

## Prioriteit en richting

Open Tekst Studio, Open Rekenblad Studio en Open Presentatie Studio hebben voorrang bij implementatie, compatibiliteitstesten en desktopbuilds. Binnen deze drie is nog geen onderlinge prioriteitsvolgorde vastgesteld.

Open Database Studio heeft de laagste prioriteit. De richting is een volwaardige databaseomgeving: tabellen, relaties, query’s, formulieren en rapporten, met verbindingen naar databronnen. Oude MDB/ACCDB-bestanden en beschikbare VBA-bron kunnen openen blijft een aanvullend compatibiliteitsdoel. VBA kunnen bekijken betekent niet dat scripts uitvoerbaar zijn.

De huidige databaseopzet blijft beschikbaar; verdere uitbouw wacht op de kernfunctionaliteit van de drie hoofdmodules. Databaseformulieren en rapporten horen bij de uiteindelijke scope, niet bij de eerste kantoorrelease.

## Vergelijking van routes — 21 oktober 2026

| Referentie | Relevantie | Consequentie voor onze keuze |
| --- | --- | --- |
| Opensource DOCX-editor op Rust/WASM | Lokaal DOCX, lint, stijlen, revisies en verwijzingen | Kandidaat voor functionele vergelijking van Tekst. Claims nog met eigen bestanden toetsen; de interface is geen React-component; kernintegratie via Rust/WASM onderzoeken. Permissieve licentie (MIT of Apache-2.0). |
| Bestaande complete desktopsuites | Documenten, rekenbladen en presentaties, deels met databaseformulieren en rapporten | Referentie voor diepgang en bediening en voor het onafhankelijk openen van exports. Inbedden vraagt een aparte beoordeling van integratie, distributie en licentieverplichtingen (zoals AGPL). |
| Webgerichte pakketten voor paginaopmaak | Paginaopmaak, kop- en voetteksten | Deels betaalde uitbreidingen, dus niet zonder meer een volledig opensource basis. |
| Gebruikte enginepakketten (zie `package.json`) | React-pakketten voor de drie documenttypen | Integratiekandidaat, nog geen bewezen volledige kantoorfunctionaliteit. Per versie end-to-end toetsen. |

Bronnen zijn projectdocumentatie, geen onafhankelijk bewijs van compatibiliteit. Kies de engine pas na hetzelfde proefdocument met stijlen, tabellen, afbeeldingen, paginaonderbrekingen en revisies te hebben geopend, gewijzigd, opgeslagen en opnieuw gecontroleerd. Voor rekenbladen en presentaties gelden vergelijkbare corpusproeven.

## Concrete acceptatieproef Tekst

1. Maak een document van vijf pagina’s met titel, drie kopniveaus, lijst, tabel, afbeelding, koptekst en paginanummer.
2. Wijzig opmaak en tekst; controleer ongedaan maken en opnieuw uitvoeren.
3. Sla op als DOCX, sluit de toepassing en open opnieuw; vergelijk tekst, objecten, stijlen en pagina-indeling.
4. Open de uitvoer in een onafhankelijke kantoorapplicatie; registreer afwijkingen.
5. Exporteer naar PDF en controleer de pagina’s visueel.
6. Herhaal offline en op Windows, Linux en macOS. Een webbuild bewijst geen desktopinstallatie.

## Native migratie — 1 november 2026

De interface en documentkern worden in Rust opgebouwd. De [native stand en gecontroleerde beperkingen](../../native/README.md) en [tien acceptatiegebieden](../../native/docs/migratie.json) zijn leidend voor deze migratie. Alle gebieden blijven open totdat functies, tests en uiterlijk aantoonbaar gelijk zijn; aantallen tests of platformgelijke screenshots zijn geen percentage voltooiing. Notition en Email horen bij de suite. Database houdt de laagste prioriteit. De bestaande stabiele desktoprelease blijft beschikbaar zolang de native vrijgavevoorwaarden niet zijn behaald.

## Eerdere stand — 21 oktober 2026

De drie hoofdeditors zijn aangesloten op een React-werkruimte met nieuwe bestanden, openen en opslaan als. De Tauri-basis, een lokale Linux-debugbuild en geslaagde releasebuilds voor Windows x64, Linux x64 en macOS ARM64 zijn toegevoegd. Database Studio behoudt zijn voorbeeldopzet. Dit is nog geen volledige kantoorvervanger: zie het [testverslag](../tests/2026-10-21.md) voor uitgevoerde controles en de resterende releasevoorwaarden.
