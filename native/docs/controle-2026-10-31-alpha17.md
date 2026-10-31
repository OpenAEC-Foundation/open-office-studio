# Native controle, 31 oktober 2026: alpha 17

**2026.44.9-alpha.17** herstelt verlies van de klembordselectie bij snelle
toetsreeksen en fouten bij gedeeltelijk hertekenen. Alle tien acceptatiegebieden
blijven open. Geen volledige functie-, test- of pixelpariteit en geen stabiele
native vrijgave.

## Selectie en klembord

De standaard tekstwidget las de selectie tijdens het verzamelen van
toetsgebeurtenissen. Wanneer Ctrl+A en Ctrl+C of Ctrl+X in dezelfde invoerbatch
vielen, was de selectiewijziging nog niet verwerkt. Knippen kon tekst
verwijderen zonder die eerst naar het klembord te schrijven. De regressieproef
faalde vóór de reparatie op een leeg klembord.

Copy, Cut en Paste worden nu als applicatieberichten afgehandeld na de
voorafgaande selectieactie. Dit geldt voor de alinea-editor, directe celeditor
en notitie-editor. Bestaande controles op bescherming en vertraagde
plakantwoorden blijven gelden. De tests sturen echte widgetgebeurtenissen in
één batch, controleren Writer en de directe celeditor, en controleren dat een
beschermde bron wel gekopieerd maar niet geknipt wordt. Het testklembord is
afzonderlijk; deze proeven bewijzen geen systeemintegratie.

## Gedeeltelijke hertekening

De echte alpha-16-Linux-vensterproef vond grijze tekenresten bij het openen van
Bestand. Losse verse screenshots zagen die fout niet. De software-renderer
tekende schaduwen buiten het opgegeven hertekengebied opnieuw over bestaande
pixels. Twee afgebakende upstreamcorrecties herstellen de schaduw- en
editorafkapping. Vier gekleurde-randproeven vonden daarna nog verschillen van
één kleurwaarde; quads gebruiken daarom bij volle en gedeeltelijke tekeningen
hetzelfde afkappad.

De [hertekenproeven](hertekenen-2026-10-31-alpha17.json) vergelijken de gehele
behouden buffer met een verse volledige render, zonder maskering,
herschaling of kleurtolerantie. Acht schaduwgevallen op vier schalen blijven
nu exact gelijk; de oorspronkelijke volle beelden zijn ongewijzigd. Vier
gekleurde afgeronde-randgevallen en de echte Writer-/Bestand-widgetbomen zijn
ook pixelgelijk tussen vol en deel. Dit bewijst geen gelijkheid met de
bestaande interface of alle mogelijke renderer- en platformtoestanden.

De [bronverantwoording](../vendor/iced-tiny-skia-bron.json) legt het
oorspronkelijke pakket, de twee upstreamcommits, de eigen correctie en de
MIT-licentie vast. Git bewaart deze bron zonder platformafhankelijke
tekstomzetting.

## Uitgevoerde controles

- **207 reguliere Rust-tests geslaagd**, inclusief 53 GUI-tests; zes runtimeproeven blijven apart.
- **Zes runtimeproeven geslaagd**; zes conversierondgangen en drie PDF-handtekeningen onafhankelijk gecontroleerd.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en bronhashcontroles geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen, inclusief de rijke Writer-invoerreeks.
- **37 native schermen** met [bron- en loghashes](schermen-2026-10-31-alpha17.json).
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha17.json) blijven bytegelijk aan alpha 16; de acht spreadsheetletterbeelden zijn afzonderlijk gecontroleerd.

De [alpha-16-CI-ronde](platformen-2026-10-31-alpha16.json) is op vijf jobs groen,
met 821 bytegelijke bronbestanden per platform, 74 exacte native beeldparen en
zeven paginabezoeken per platform tussen verse en behouden sessies. De lokale
releasebuilds van alpha 15 en 16 en hun pakket-/broncontroles zijn afgerond.
De alpha-17-release- en platformronde zijn nog niet afgerond.

De [echte alpha-17-Linux-debugvensterproef](vensterproef-2026-10-31-alpha17/LEESMIJ.md)
controleert invoer, behoud van vet/cursief, het systeemklembord, bewaren en
herstel van de oorspronkelijke bronbytes via twee undo-stappen. De totale
ronde blijft afgekeurd: de aansluitende Bestand-klik toont binnen de
controletijd geen Bestand-werkvlak. De oorzaak staat nog open; de releasebuild
moet afzonderlijk worden onderzocht. Dit geldt niet als volledige GUI-goedkeuring.

De [brede alpha-16-corpusronde](corpus-2026-10-31-alpha16-release.json) heeft
580 geslaagde en 68 geweigerde bronnen, zonder time-outs, op 648 geselecteerde
bronnen. De 68 weigeringen zijn dezelfde als bij alpha 12. De andere 918
manifestbronnen zijn niet native getest. Dit controleert eerste weergave en
zichtbare tekst na bewaren, niet alle inhoud, opmaak of functies. Tijden onder
verschillende bouwbelasting zijn geen bewijs van een snelheidsverbetering.

## Visuele pariteit en resterende migratie

De [vier volledige referentievergelijkingen](pixelcontrole-alpha17/rapport.json)
blijven met nul tolerantie rood: Writer **107.809**, Spreadsheet **382.423**,
Presentation **560.031** en Notition **666.027** afwijkende pixels op elk
943.736 pixels. Geen maskers, herschaling of nieuwe referentiebeelden; dit zijn
geen voltooiingspercentages.

Directe rijke Writer-invoer, volledige ribbons, rastervirtualisatie en
bereikbediening, presentatieobjecten, automatisch notitieherstel, complete
mailbediening, database-interface, native installers/losse edities en fysieke
platformproeven blijven open. De widgettests gebruiken synthetische IME-Commit;
fysieke IME-compositie, systeemdialogen en echte schermlezers zijn niet getest.
