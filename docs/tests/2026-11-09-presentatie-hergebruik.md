# Dia's hergebruiken en tussen presentaties kopiëren (#76)

Dia → Dia's hergebruiken leest een PPTX en toont een selectie van de bron-
dia's. Invoegen komt na de huidige dia en houdt de eigen masters, indelingen,
thema's, media, notities en objectonderdelen van de bron. Intern gelinkte
dia's komen ook mee, zodat die koppelingen naar echte dia's blijven wijzen;
de dialoog legt dit vooraf uit. Bestaande doelonderdelen blijven bytegelijk,
afgezien van de gewijzigde presentatielijst, relaties en inhoudstypen.

De lintknop Dia's kopiëren neemt de huidige dia of sorteerderselectie over.
In de sorteerder werkt ook echte Ctrl+C. Het zelfstandige klembordpakket
bevat alleen de gekozen/bereikbare onderdelen; ongekozen dia's en niet-
gerelateerde brononderdelen komen niet mee. Dia's plakken en Ctrl+V openen
dezelfde selectie vóór invoegen. Verborgen documenten reageren niet mee.
Annuleren en afwijzen veranderen de presentatie niet. Pakketwijzigingen
herladen de editor; de waarschuwing over de nieuwe ongedaanmaakgeschiedenis
staat vooraf in het venster.

De gedeelde onderdeelkoppeling in `src/pakket/kopieren.ts` wordt ook gebruikt
voor grafiekkopieën. Ze ondersteunt cycli/gedeelde media en nieuwe vrije
onderdeelnamen. Kopieën krijgen geregistreerde masters/notitiemodellen en
unieke master-/indeling-ID's. Die extra gezamenlijke ID-controle vond ook
een botsing in het eerdere masterbeheer; dezelfde allocator is gecorrigeerd.
Secties in het doel schuiven bij invoegen mee.

## Validatie

- Negen nieuwe native tests: import/herhaling, alle relaties, gekoppelde dia's,
  masters/indelingen/thema's, exacte PNG-bytes, notities, tabellen/grafieken met
  ingesloten data, secties, behoud van doelonderdelen, zelfstandig klembord en
  weigering zonder bronmutatie. Opslaan/heropenen met de echte PPTX-engine.
- Masterbeheertests zijn uitgebreid met gezamenlijke master-/indeling-ID's;
  de nieuwe regressies faalden vóór de allocatorcorrectie en slagen erna.
- `scripts/test-presentatie-hergebruik.mjs`: zes productiebrowsergevallen,
  met een echte bestandskiezer, Ctrl+C in de sorteerder, Ctrl+V naar een
  ander geopend document, knoppenroute, weigeren van een ander formaat en
  daadwerkelijke Opslaan als-download. Heropening gebeurt zowel in de engine
  als in een volledig nieuwe browsercontext; masters, beeldbytes en notities
  blijven behouden. Geen JavaScript-paginafouten.
- TypeScript, productiebuild en de negen aangeboden interfacetalen: geslaagd.
  Volledige suite: **2099 geslaagd, 10 bestaande skips, 183 bestanden**,
  met twee workers en 15 seconden per test.
- Donkere dialoog, selectie en bronbeschrijvingen visueel gecontroleerd.

## Grenzen en vervolg

Deze eerste route vereist hetzelfde diaformaat; afwijkingen kleiner dan
0,01%/1000 EMU vallen binnen de meettolerantie. Echte formaatverschillen
worden duidelijk geweigerd in plaats van geometrie te rekken of af te snijden.
Er mogen maximaal 500 dia's en 100 MB brononderdelen worden verwerkt; een
klembordpakket is begrensd op 32 MB.

PPTX heeft maximaal één geregistreerd notitiemodel. Een identiek bestaand model
wordt hergebruikt; een conflicterend model wordt expliciet geweigerd. Bronnen
met ingesloten fonts of globale commentaarauteurs worden eveneens geweigerd
tot hun identiteiten verliesvrij kunnen worden samengevoegd. Bronnen en doel
blijven bij die weigering intact. Geen native PowerPoint/ODP-conversietest
wordt voor deze kopieerroute geclaimd. #76 blijft voor deze uitzonderingen open.

Pakketregistratie volgt de primaire documentatie over
[PresentationML-lijsten](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentations)
en het [Microsoft Open XML SDK-schema](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_presentationml_2006_main.json) voor `NotesMasterIdList` (maximaal één
`notesMasterId`).
