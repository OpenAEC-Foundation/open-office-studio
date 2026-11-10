# Spreadsheet: formaatbehoud, objecten en grote pakketmetadata

Werkstand van 9 november 2026 voor #3, #32, #35, #74 en #75. De brede issues worden niet als volledig opgelost aangemerkt. De bestaande installateurs zijn niet vervangen.

## Implementatie

- Hyperlinkvenster en Ctrl+K: websites, mail, bestanden en interne celverwijzingen. Tekst, oorspronkelijke celopmaak en hyperlinkmetadata vormen één native Undo-stap. Formulecellen houden hun formule. De bestaande HYPERLINK-functie wordt tegen de echte kern getest.
- Afbeeldingen, zes basisvormen en tekstvakken invoegen; bestaande objecten selecteren, verplaatsen, schalen, hernoemen en verwijderen. De overlay leest de media één keer per document. Uitsneden, spiegeling, rotatie, eenvoudige themakleuren en tekststijl worden gelezen; verplaatsen bewaart de overige XML en media. Gedeelde tekeningen krijgen bij bewerken een eigen kopie voor het gekozen blad.
- Afdrukken en PDF tekenen dezelfde afbeeldingen, basisvormen en tekst als de overlay, met celankers, uitsnede, rotatie, spiegeling en paginaclipping. Het afdrukbereik omvat ook een werkblad met uitsluitend tekenobjecten. Niet-ondersteunde geometrie blijft als herkenbare placeholder behouden.
- Verborgen eigen ankers volgen rij-/kolominvoegingen, verwijderingen en Undo/Redo. Verwijderen van de ankercel verwijdert de afbeelding niet. De namen staan niet in het normale naambeheer.
- Bestandskoppelingen gaan in de desktopapp via de bestaande document-openroute. Alleen ondersteunde, bestaande documenten tot 100 MB worden aangenomen. Relatieve paden gebruiken het werkbestandtoken van hetzelfde venster. Er wordt geen shell of gekoppeld programma gestart. De native regressies en desktopbuild slagen op Linux, Windows en macOS in [CI op cc0be69](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42619565504). De lokale Cargo-uitvoering werd vóór de tests door Windows Application Control geblokkeerd op een afhankelijkheidsbuildscript, fout 4551; die blokkade is niet omzeild.
- ODS/OTS/FODS/XLS/XLT/XLSB behouden de bestaande conversieroute. Het gedeelde profiel is strikt ODF 1.3 (PR238); de converter slaat systeemprinterdetectie over in uitsluitend zijn kindproces (PR239). Bronmacro’s in XLS/XLT/XLSB en ODS/OTS worden herkend en als niet overgenomen gemeld.
- `packages/rekenbladen/src/index.ts` biedt één herbruikbaar async-contract voor lokale en workerverwerking. Browserexports gebruiken de worker om ontbrekende formulecaches te berekenen. De bestaande synchrone hoofdeditor is hiermee nog niet gemigreerd.
- Kleine OOXML-metadatawijzigingen pakken ongewijzigde werkbladen niet opnieuw uit of in. De expliciete werkbladmetadatalezer bouwt geen celboom voor `sheetData`.

## Onafhankelijke controles

De synthetische bron heeft twee bladen, een datum, celopmaak, samenvoeging, een benoemd bereik, een grafiek en afdrukinstellingen. Voor beide datumsystemen worden ODS, OTS, FODS, XLS en XLT gemaakt en opnieuw ingelezen. De verwachte sommen zijn vooraf bepaald: 12,5 + 7,25 = 19,75 en tweemaal die som = 39,5.

Alle elf invoerroutes slagen, inclusief het vastgezette XLSB-bestand uit [LibreOffice’s gedeelde-formuleregressie](https://github.com/LibreOffice/core/blob/bd7011e96264ddfe5506839319dd610975328a59/sc/qa/unit/subsequent_filters_test2.cxx#L476). Die onafhankelijke test specificeert A1:A30 = 3. Het bronbestand is vastgezet op Git-blob `b304e0826c391c4977d55a0eddca74d39138a7ee` en SHA256 `e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.

Daarna bewerkt de productie-WASM B2 naar 20. De verwachte uitkomsten 27,25/27,25/54,5 worden gecontroleerd vóór opslaan, na heropenen en met openpyxl op de opgeslagen caches vóór opnieuw rekenen. De grafiekcache bevat eveneens 20 en 7,25. Een onbekend pakketonderdeel blijft door deze engine-opslag bytegelijk. Alle elf enginegevallen slagen.

De tien bewerkte werkboeken gaan vervolgens terug naar hun bronformaat en nogmaals naar XLSX. Alle inhoudscontroles slagen. Op de opgeslagen ODS/OTS/FODS-uitvoer slagen 38 officiële ODF1.3-controles, inclusief de ingesloten grafiekdocumenten. De OASIS-schemahashes worden gecontroleerd. Deze Windows-metingen gebruiken de uitgepakte LibreOffice26.8.2.2, eigen profielen en de ongewijzigde limiet van 45 seconden per conversie.

De eerste vijf conversies zonder de twee printervariabelen liepen op de 45-secondenlimiet vast. De herhaling met de gemeten printercorrectie slaagt. Een eerste afdrukbereikassert vergat absolute `$`-verwijzingen te normaliseren en gaf een vals rood resultaat; de oorspronkelijke uitvoer is behouden en alle opgeslagen bestanden zijn met de gecorrigeerde validator opnieuw gecontroleerd.

De productie-browserproef bevat vijftien geslaagde stromen: bestaande objecten, Ctrl+K/Undo/Redo, objecteigenschappen, vormtekst, afbeeldingsinvoer, echte sleep-/schaalgebaren en tekstvakinvoer/verwijderen. Daarnaast worden opgeslagen interne koppelingen opnieuw geopend, relatieve bestandskoppelingen en hun browsermelding gecontroleerd, en scrollen met een deels/onzichtbare ankercel gevolgd. De test inspecteert ook de opgeslagen OOXML en de onbekende pakketbytes. Een blad met uitsluitend een verre afbeelding blijft in beide richtingen bereikbaar zonder extra cellen; 50%, 100% en 200% zoom en vastgezette rijen/kolommen zijn met echte scrollbewegingen gecontroleerd. Het objectbereik vergroot alleen de scrollcontainer; werkmapcellen blijven ongewijzigd. De legacy-host levert niet op elk scrollframe verse plugin-geometrie; de objectlaag bewaart de gemeten rasteroorsprong en volgt de werkelijke scrollcontainer met één gedeelde listener.

De volledige lokale suite slaagt met 2.053 tests en tien bestaande skips, inclusief de nieuwe afdrukgeometrie, gerichte beveiligingswaarschuwing, interne hyperlink en onbekende tekengeometrie. De onbeperkt parallelle eerste run had CPU-time-outs; de volledige herhaling met vier workers slaagde. Typecontrole, productiebuild en i18n-controle slagen eveneens.

## Prestatiemetingen en resterend werk

| Vaste bron | Meting op deze host |
| --- | --- |
| 100.000 × 30 numerieke cellen, 11 MB ZIP | Metadatawijziging 8 ms; filtermetadata lezen 668 ms; werkblad gecomprimeerd bytegelijk |
| 50.000 afhankelijke formules, lokale kern | Openen 2.348 ms; herberekenen na A1-wijziging 141 ms; tekenen 47 ms; gemeten proces-RSS 193 MiB |
| Dezelfde 50.000 formules, browserworker | Vastgelegde run: openen 1.435 ms; heartbeatpauze maximaal 12 ms; alle 50.000 gewijzigde uitkomsten en alle opgeslagen caches onafhankelijk gecontroleerd; vooraf afbreken slaagt |

De cijfers voor pakketmetadata zijn geen bewijs voor soepel openen of scrollen in de hoofdeditor. De drie-miljoen-cellenproef van de huidige kern haalde noch de oorspronkelijke grens van 60 seconden, noch een afzonderlijke diagnosegrens van 120 seconden; alleen de eigen meetworker is beëindigd. De RSS-bewaking van 1.800 MiB meet resident geheugen en is geen volledige begrenzing van alle allocaties. De bestaande appcontrole weigert bovendien werkbladonderdelen groter dan 64 MiB. Die limiet is niet blind verhoogd. De complete editorworkerroute, grote-open-geheugenpiek en GUI-scrollacceptatie van #74 blijven open. De afgestemde selectie-statistiekfix van PR240 zit in deze integratie.

Objectpakketbewerkingen herladen de editor en laten de voorafgaande Undo-geschiedenis vervallen; het venster vermeldt dit vóór Toepassen. Gewone hyperlinkbewerkingen hebben wel native Undo/Redo. De gepinde kern levert voor HYPERLINK-formules geen klikregio; de host leest daarom de letterlijke bestemming, opgeslagen waarden van enkelvoudige celverwijzingen en tekstconcatenatie. Echte Ctrl+klikproeven controleren interne navigatie, relatieve bestanden, websites en het weigeren van uitvoerbare URL-schema’s. Formules en geschiedenis worden niet gewijzigd. Bestemmingen met andere geneste functies of namen worden nog niet opgelost en blijven onderdeel van het open issue. Geavanceerde groepen, connectors, vectorafbeeldingen en niet-ondersteunde tekengeometrie krijgen waar nodig een placeholder en blijven behouden. De productie-afdruk/PDF-proef slaagt: één pagina met uitsluitend een afbeelding en vorm, 5.940 blauwe afbeeldingspixels, 14.568 oranje vormpixels, zoekbare vormtekst en geen vectorfallback. Een onafhankelijke PDF-reader bevestigt één pagina en één ingesloten afbeelding. Daarom blijft #75 open. De bredere corpus- en platformtoegankelijkheidscriteria van #3 blijven eveneens open.

Een afzonderlijke synthetische beveiligingsfixture (SHA256 `372ab091dc4ef97b799f33ce780531156d8e68a327fe91e75de5245cbf766a4d`, gedeelde bronproef d410 `961ac1db2dc2b6c6ef2cdf3c223b018d63a1fc2a`) bevestigt verlies van actieve SHA512-werkmapstructuurbeveiliging via XLSX → ODS → XLSX in LibreOffice26.8.2.2. Bladbeveiliging en de onafhankelijke waarden A1=22/B3=20 blijven behouden. De app waarschuwt precies voor dit aangetoonde structuurverlies bij runtime-export; een leeg beveiligingselement, ontgrendelde structuur of oude wachtwoordhash wordt niet als dit bevestigde geval geclassificeerd. Native XLSX-opslag blijft toegestaan. De test bewaart het echte converterrapport in CI.

De branches zijn afgestemd met de andere chats: #59/#60/#61/#66/#67 en #68/#69/#71/#72/#73 blijven bij hun eigenaren. Bij integratie moeten de kleine `editors.tsx`, filteropslag- en lintgroepen gecombineerd worden; hun wrappers en privé-prefixen blijven behouden.

## Herhalen

```text
pnpm exec vitest run --maxWorkers=4
pnpm exec tsc --noEmit
python scripts/maak-rekenbladprestatie.py
node --expose-gc scripts/meet-rekenbladpakket.mjs
node scripts/test-rekenbladadapter-worker.mjs
node scripts/test-rekenblad-objecten-gui.mjs
node scripts/test-rekenblad-objecten-print.mjs
python scripts/test-rekenbladformaten.py
node scripts/test-rekenbladformaten-engine.mjs
python scripts/test-rekenbladformaten.py --validate-engine
python scripts/test-rekenbladformaten.py --roundtrip-engine
python scripts/test-rekenbladformaten.py --probe-workbook-protection
```

Voor de browser-objectproef eerst een productiebuild naar `.local/dist` maken. Voor conversie `OPENAEC_CONVERSIE_PROGRAMMA` naar de eigen converter laten wijzen; de test zet de printervariabelen alleen op zijn kindprocessen. Voor de formulematrix kan `OOS_PYTHON` een expliciete Python-runtime aanwijzen.

De aanvullende [Spreadsheet-CI op ac4269f1](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42627989467) bevestigt alle 50.000 gewijzigde én opgeslagen caches (1.745 ms openen, maximaal 14 ms heartbeatpauze) en de vectorafdruk. Ook de [ODF-conversieproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42627989351) en [directe Node-documentmatrix](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42627989395) slagen. De browser-objectproef draait voortaan eveneens in CI.

De aanvullende workerproef onderbreekt ook een werkelijk begonnen openactie: één worker gestart en beëindigd, AbortError na 26 ms. Browserproeven gebruiken afzonderlijke Vite-caches; de onafhankelijke adapterproef ontdekt geen apppagina’s en heeft een eigen totale browserlimiet van 60 seconden. De laatste lokale workerherhaling verifieert opnieuw alle 50.000 gewijzigde en opgeslagen waarden (2.155 ms openen, 12 ms maximale heartbeatpauze).

De laatste beeldcorrectie past de bestaande invoergrenzen (20 MiB bronbytes, 64 megapixels) ook toe op reeds ingebedde afbeeldingen, vóór het maken van een browserblob/decoder en in afdrukken/PDF. Te grote beelden houden hun oorspronkelijke bytes en krijgen een placeholder. De drie gerichte beeldtests en de productieproef met een te grote PNG-header slagen; de volledige suite van 2.053 tests is vóór deze laatste correctie gemeten. De productiebuild, vijftien browserstromen en afdrukproef zijn daarna herhaald.

De [CI op 309b8dc0](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42632837684) bevestigt veertien browserstromen vóór deze beeldcorrectie, 50.000 gewijzigde én opgeslagen formulecaches en één gestarte/afgebroken worker met AbortError na 26 ms.
