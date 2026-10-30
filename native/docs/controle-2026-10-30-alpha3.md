# Native controle, 30 oktober 2026: alpha 3

Versie **2026.44.9-alpha.3** is een verdere migratiestap. De bestaande suite
**2026-W44.8** blijft de referentie. De native suite is nog niet volledig
overgezet, niet volledig getest en niet pixelgelijk aan die referentie.

## Uitgevoerde controles

- Een volledige lokale ronde van **53 Rust-tests**, gevolgd door **twee extra
  interface-integratietests**. Alle 55 slagen. De twee extra tests voeren echte
  Iced-taken en de documentwerkdraad uit: Writer splitsen, samenvoegen en
  ongedaan maken; Spreadsheet naar een gedekte cel navigeren en de juiste
  ankercel bewerken.
- Vier Python-regressietests voor de strikte schermvergelijking slagen.
  Identieke PNG's slagen; een transparantieverschil telt mee. Een JPEG met
  `.png` als extensie en ongelijke viewports worden als onmeetbaar geweigerd.
- Onafhankelijke teruglezing met python-docx, openpyxl en python-pptx bevestigt
  tekst, Unicode, runopmaak, halve punten, tabellen, secties, kop- en voettekst,
  celopmaak, formules, rekenwaarden, meerdere bladen/dia's en sprekersnotities.
- Nieuw gecontroleerd: echte alinea's splitsen en samenvoegen, lege helften met
  behoud van runopmaak, cel- en sectiegrenzen, herstel van volledige bronbytes,
  een verdwenen laatste Writer-pagina en een samengevoegde cel waarvan de
  ankercel buiten het werkvenster ligt.
- Herhaalde alinea-ID's veranderen uitsluitend de bedoelde alinea. De
  lettertypecache blijft correct bij wisselen van documenten, fontfamilies en
  een extern gewist fontregister. Writer serialiseert na bewerken één keer voor
  zowel weergave als bewaring. Er is nog geen algemene prestatiegrens bewezen.
- Rustfmt, Clippy met waarschuwingen als fouten, bronhashes en whitespacecontrole
  slagen. Alle **202 UI-bronbestanden** en **70 documentfonts** blijven bytegelijk
  aan de vastgelegde bronnen.

De Iced software-renderer maakt echte appbeelden. App en rendertests gebruiken
nu dezelfde basisfont- en tekstgrootte-instellingen. Dat controleert rendering
en gesimuleerde bediening; het vervangt geen fysieke muis-, toetsenbord-, IME-
of schermlezertest op een echt platformvenster.

Kop- en voetteksten worden door de engine opnieuw als XML geschreven. Het
verhaalmodel en de onafhankelijke teruglezing blijven gelijk; de serializer
breidt de lijst bekende compatibiliteitsprefixen uit. Dit is geen belofte van
bytegelijke XML na een bewerking. De oorspronkelijke bron blijft tot de eerste
bewerking intact; ongedaan maken herstelt de opgeslagen volledige bronbytes.

## Builds en pakketcontrole

De laatst bevestigde platformronde is **alpha 2**, commit
`8c30f3c8181053484f70831f6141206da9d3daed`: de native Windows-, Linux- en
macOS-jobs slagen, inclusief tests, releasebuild en pakketcontrole.
[Bouwronde 41130940638](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41130940638)
bevat de drie pakketten. Die zijn ook lokaal op SHA-256, CRC, bron en
licentieteksten gecontroleerd. De uitgepakte Linux-binary is uitgevoerd met
`--version`.

Deze alpha-2-resultaten bewijzen geen alpha-3-build. De alpha-3-bouwresultaten
worden afzonderlijk gecontroleerd in de
[native bouwstraat](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/native-rust.yml).
De pakketten blijven draagbare previews; ondertekende native installers en
afzonderlijke native Studio-edities zijn nog open.

## Visuele vergelijking

De huidige browserkoppeling levert JPEG-data, ook wanneer die onder `.png`
werd bewaard. De eerder getelde pixelverschillen op zo'n opname zijn daarom
geen geldig pixelbewijs. `vergelijk-schermen.py` weigert deze referentie nu
expliciet. De opname blijft bruikbaar voor menselijke beoordeling.

Er ontbreekt nog een oorspronkelijke verliesvrije opname van de volledige
referentie-interface voor de numerieke vergelijking. Los daarvan verschillen
onder andere de ribbon, navigatie, bediening en statusbalk nog zichtbaar.
Geen enkel acceptatiegebied is als visueel gelijk afgevinkt.

## Nog open

Alle tien acceptatiegebieden in [migratie.json](migratie.json) blijven open.
Onder andere directe rich-text-invoer, volledige modulelinten, doorgaande
rasterbediening, vormbewerking, automatische notitiebewaring, de mailinterface,
de native database-interface, overige formaten, platformintegratie en het
volledige bestandencorpus ontbreken nog geheel of gedeeltelijk.

`controleer-migratie.py --vrijgave` moet daarom nog steeds weigeren. De nieuwe
tests vormen bewijs voor de genoemde gevallen, geen volledige functiedekking
of gereedmelding van de gehele suite.
