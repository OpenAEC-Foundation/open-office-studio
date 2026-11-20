# #363 — leesbare labels voor Writer-stijlbeheer

Afgestemd en expliciet overgedragen door de integratiechat na vrijgave door de Windows-chat. Alleen [#363](https://github.com/OpenAEC-Foundation/open-office-studio/issues/363); geen #362-layout, #361-focus of #359-rendererwerk. Deze levering blijft **apart voor de volgende intake**, zonder wijziging aan de huidige integratiekandidaat of `main`. Geen automatische hervatting of issue-sluiting.

Getest bronpunt **489c4e3ce10a51e14bfd5791860e5fe3e843a544**, branch `codex/writer-363-style-labels-2026-11-16`, basis **f1085923653bd6e59982807e16a09c5fa3e3d74e**. Productiefix **2e6446faaa1e077aa683d3e590dbec1fd5f6a8d4**; de twee volgende commits corrigeren uitsluitend testdriverselectoren. Alle definitieve lokale resultaten hieronder betreffen het vastgelegde 489-punt. Oud #358/G-bewijs wordt niet als #363-platformbewijs gebruikt.

## Wijziging

Eén productiecomponent verandert: `StijlBeheerGroep` in `src/tekst/stijlen/StijlGalerij.tsx`. De tien ontbrekende `styles.manage.*`-lookups — vijf zichtbare labels plus hints en fallbackbranches — verwijzen nu naar bestaande, passende vertalingen voor stijlvenster, nieuwe stijl, bijwerken, wijzigen en stijlset. De namen `Normal`/`Standaard` en eigen stijlnamen blijven geïnterpoleerd. De bestaande teksten zijn in alle negen aangeboden talen aanwezig; geen nieuwe localebestanden of vertalingen nodig.

Geen CSS, commandohandler, beschikbaarheidsvoorwaarde, documentmodel of opslagcode gewijzigd. De groepsnaam is leesbaar `Styles`/`Stijlen`; paneel, nieuwe stijl, wijzigen en stijlset hebben leesbare toegankelijke namen en tooltips. De bestaande fallback naar Engels blijft behouden.

## Uitgevoerde controles

- **Voor de fix:** de nieuwe echte React-renderproef faalt in alle negen aangeboden talen op zichtbare/ARIA-/tooltip-`styles.manage.*`-sleutels. Een alleen op JSON-pariteit gebaseerde vertaalcontrole was al groen en kon deze verkeerde verwijzingen niet vinden.
- **Na de fix, bron489:** 18 gerichte tests in drie bestanden geslaagd. De negen rendercases controleren elk een eigen huidige stijl (`Project Body`) én de toestand zonder huidige stijl, inclusief alle labels/attributen en de bestaande disabled-status. De overige negen tests dekken het bestaande stijlmodel en verhalen. TypeScript `--noEmit` geslaagd.
- Writer-i18ncontrole: **9 talen ×1 namespace,1669 bronsleutels**, nul fouten; dezelfde **23 bestaande waarschuwingen** over voorbereide, niet-aangeboden taalmapjes. Geen massale herinrichting of vertaalwijziging.
- Normale productiefrontend en standalone hosted-build geslaagd. De definitieve normale Vite-build en hosted-build zijn na het vastleggen van489 uitgevoerd; de daarvoor door `pnpm build` voorbereide font-/spellingassets zijn ongewijzigd hergebruikt. Hosted-pad-/bronnencontrole geslaagd.
- **Echte productie-UI, lokale Windows-host, Chromium151.0.7922.34:** zowel `/` als `/office/` geslaagd met English, Nederlands en de feitelijke Engelse fallback bij Lao. Zes route/taalcombinaties; per combinatie alle vijf knoppen met volledige toegankelijke naam en tooltip, correcte groepnaam en juiste `Normal`/`Standaard`-interpolatie. Geen interne sleutels of page-errors. De driver opent het document en het tabblad Stijlen, zonder editorbridge of documentbewerking. Browsers en previewservers sluiten via `finally`.
- Alle zes originele eind-PNG's zijn bekeken en ongewijzigd bij deze receipt bewaard. Leesbare labels bevestigd; beperkte breedte kan de bestaande ellipsis tonen, terwijl naam/tooltip volledig blijven. Dit is geen acceptatie van de afzonderlijke verticale layoutmelding #362. De blanco pagina is het onbewerkte lege ingebouwde sjabloon, geen #359-test.

De [JSON-receipt](2026-11-16-writer-363-style-labels.json) bewaart beide ongewijzigde UTF-8-browserrapporten, screenshotdigests, bron-/testdriveridentiteiten en digests van de testlogs. Voorbeeld: [normaal Engels](beelden/writer-363-2026-11-16/normal/en.png), [normaal Nederlands](beelden/writer-363-2026-11-16/normal/nl.png), [hosted Nederlands](beelden/writer-363-2026-11-16/hosted/nl.png).

## Platformgrenzen en veilige afronding

| Platform | Controle op exact489 | Resterend |
| --- | --- | --- |
| Windows / browser | TypeScript, gerichte React-tests, i18n, frontend/hosted-build, zes echte browsercases | Nieuwe native Windows-pakket-/bedieningscontrole niet uitgevoerd |
| Linux | Geen nieuwe hostcontrole | Build/pakket, relevante native en browsercontrole bij volgende intake |
| macOS | Geen nieuwe hostcontrole | Build/pakket, relevante native en browsercontrole bij volgende intake |

Er is vóór de afgesproken stop geen nieuwe lange CI-/platformmatrix of lokale native GUI/opnamesessie gestart. Er is geen PR geopend die automatisch een lange matrix zou starten. Branch, reproduceerbare testdriver en bewijs zijn gepusht voor latere beoordeling; dit is geen centrale integratievrijgave of volledige platformacceptatie. #363 blijft open. Eigen headless browsers/servers zijn gesloten; geen eigen Computer Use-/schermopnamesessie gestart. Geen main-merge of automatische woensdaghervatting.

## Laatste review en aangescherpte overdracht

Op expliciete gebruikersopdracht is vóór de vervroegde stop **15:20 Europe/Amsterdam** een leescontrole uitgevoerd van bron489 en receiptcommit **9ce8e75851d4cb287d7cf9f2e787892dd5ca0e76**. Er zijn geen nieuwe app-/platformtests gestart en geen productie-, unit-test- of browserdriverbestanden gewijzigd. Alleen dit verslag en de JSON-reviewmetadata zijn aangescherpt.

Opnieuw onafhankelijk gecontroleerd: de drie bron-/testdriver-Gitblobs komen overeen met de opgeslagen digests; beide UTF-8-browserrapporten zijn ongewijzigd; alle zes gecommitte originele PNG's komen bytegelijk overeen met hun rapportdigests. Het volledige productieverschil bestaat uit **negen gewijzigde label-/hintpropregels** die tien ontbrekende lookups vervangen. Commandohandlers, `disabled`-voorwaarden en document-/opslagcode zijn ongewijzigd. `stijlNaam` geeft alleen de bestaande vertaalde of eigen naam terug; de extra hintlookup muteert de stijl niet.

De review maakt de volgende grenzen expliciet voor de volgende intake:

1. **Beschikbaarheidscombinaties zijn niet volledig gedekt.** De rendermock zet `kanHerladen` gelijk aan `huidigeStijl`. Hij controleert dus stijl+bewerkbaar en geen stijl+niet beschikbaar; niet onafhankelijk een bewerkbaar document zonder huidige stijl of een huidige stijl in alleen-lezen toestand. De telling van18 geslaagde tests blijft geldig, maar bewijst deze twee extra toestanden niet. Splits die assen vóór een claim van volledige toestandsdekking. Er is geen gewijzigde productvoorwaarde aangetoond.
2. **De browserdriver heeft een onbeschermd opstartpad.** `preview()`, `chromium.launch()` en het lezen van het sjabloon staan vóór de omvattende `try/finally`. Een fout bij browserstart of sjabloonlezen kan cleanup overslaan. De zes uitgevoerde succesvolle gevallen hebben hun contexts/browser/server wel gesloten. Breng bij hergebruik de creatie onder bewaakte cleanup en controleer de foutpaden; die zijn hier niet uitgevoerd of als geslaagd gemarkeerd.
3. **De bronstempel is geen zelfstandige buildbinding.** `report.source` leest de Git-HEAD van de werkmap. De driver bewijst zelf niet dat de gekozen `dist`-assets door datzelfde commit zijn gebouwd. De beschreven runs gebruikten verse builds op489; bij toekomstige geautomatiseerde integratie moet de app-buildidentiteit met een buildmanifest/bundledigest aan het bronpunt worden gebonden, apart van de harness-HEAD. Deze review verandert geen bestaande resultaatlabels.
4. **De twee groepsnamen zijn gelijk.** Galerij en beheer gebruiken nu beide `styles.gallery.group` en heten `Styles`/`Stijlen`, ook voor hun ingeklapte knop. Dat is zichtbaar op de bestaande screenshots: de captions zijn leesbaar, maar niet onderscheidend. #363 stelde geen unieke-groepsnaamassertie; beoordeel bij intake of een specifiek beheerbijschrift voor toegankelijkheid gewenst is. Dit is geen #362-layoutvrijgave of nieuwe issueclaim.

Voor latere intake: gebruik het **volledige bronverschil f108→489** of alle drie bron-/testcommits (`2e6446fa`, `7a512f9c`, `489c4e3c`). Alleen2e bevat nog de later gecorrigeerde browserdriverselectoren. Houd het geteste applicatiepunt489, de bewijscommit en de uiteindelijke integratie-HEAD afzonderlijk vastgelegd. Valideer de dan gekozen combinatie en de open platform-/native routes; herlabel geen oude #358/G-resultaten. De huidige levering blijft een aparte volgende-intakebron, zonder merge naar integratie of `main`.
