# PDF-koppelingen in noten, tabellen en kop-/voetteksten

Vervolg op [nootomzetting](2026-11-06-nootomzetting.md), voor de bestaande
Tauri/websuite. Gerelateerde brede issues: #37 en #51. Deze blijven open.

## Gereproduceerd en hersteld

De eigen PDF-route gebruikt dezelfde pagina's als het afdrukvoorbeeld en heeft
geen externe formaatconverter nodig. De native proef met de synthetische
nootbron levert twee pagina's, juiste sectieherstart (`iii`, `iv`, `iii`),
de afbeelding en selecteerbare tekst met ingebedde lettertypen op. De
hyperlinks in de voet- en eindnoot waren echter alleen blauw getekend: de
werkelijk bewaarde PDF bevatte nul linkannotaties.

De export vroeg uitsluitend de hoofdtekst op en bezocht alleen de direct
onderliggende alinea's. Hij neemt nu ook kop-/voetteksten en beide nootsoorten
mee en doorloopt tabelcellen, inhoudsbesturingselementen en opgeslagen
veldinhoud. Iedere werkelijke pagina-occurrence krijgt haar eigen klikgebied;
gelijke gebieden met hetzelfde doel worden niet dubbel toegevoegd. Koppen uit
de hoofdtekst blijven PDF-bladwijzers; een kop in de herhaalde koptekst wordt
geen extra documentbladwijzer. Bij een afwijzing van de accepted-weergave door
bijgehouden wijzigingen wordt de werkelijk ingedeelde markup-weergave gevraagd.

## Bewijs met de echte engine en native app

Twee gerichte proeven gebruiken `exportDocxStructuredWithPages` met de echte
JS/WASM-kern en een meegeleverd lettertype, zonder nagemaakte paginageometrie:

- De voetnootkoppeling ligt op pagina 1 en de eindnootkoppeling op pagina 2,
  beide met een positief gebied bij hun werkelijk geplaatste noot.
- Een hyperlink in een tabel blijft aanwezig; kop- en voettekstkoppelingen
  verschijnen op iedere afgedrukte pagina. Alleen de eigen hoofdtekstkop
  wordt een bladwijzer.

Daarna is in een leeg, afzonderlijk native Linux-profiel dezelfde bron geopend,
Ctrl+P gebruikt en **Save as PDF** via de echte bewaarkeuze uitgevoerd.
`pdfinfo -url` vindt nu twee annotaties met de bedoelde doelen op pagina 1 en 2.
`pdftohtml` koppelt die annotaties onafhankelijk aan de woorden
`bronkoppeling` en `eindkoppeling`. De tekstextractie behoudt de sectieherstart
en alle vijf nootteksten. `pdffonts` bevestigt de ingebedde, gesubsetteerde
Caladea-lettertypen met Unicode-mapping.

De [oorspronkelijke PDF](pdf-noten-2026-11-06/voor.pdf) en
[herstelde PDF](pdf-noten-2026-11-06/na.pdf) zijn met Poppler gerenderd. Beide
pagina's zijn bij 990 × 1400 pixels **pixelgelijk**; het herstel wijzigt de
klikgebieden, niet de weergegeven pagina. De
[eerste](../screenshots/test-pdf-noten-pagina-1-2026-11-06.png) en
[tweede pagina](../screenshots/test-pdf-noten-pagina-2-2026-11-06.png) zijn
bovendien visueel gecontroleerd. Zie het
[controlebestand](pdf-noten-2026-11-06/controle.json), beide tekstextracties en
de onafhankelijke XML-uitvoer van de PDF-lezer.

De daadwerkelijk uitgevoerde PDF-bundel is via de native debugger gelezen;
haar SHA-256 is gelijk aan de definitieve productiebundel. De editor en alle
drie geladen tekst-WASM-bestanden zijn eveneens tegen de bouwuitvoer
gecontroleerd. Het eigen native appvenster en X11-scherm zijn afgesloten.

De volledige app-set slaagt in **1.898 proeven, 163 bestanden**, met zeven
bestaande corpusgevallen overgeslagen. Typecontrole, productiebuild en native
proefbouw slagen. Er is geen nieuwe Rust-/WASM-code of afhankelijkheid nodig.
De gepubliceerde installers blijven ongewijzigd.

## Afzonderlijke ODT-/converterproef en resterend werk

De vooraf gevonden PDF-afwijking betrof de externe converter, niet de eigen
Office-PDF-route. De proef is herhaald met zowel de beschikbare ontwikkelruntime
26.8 als de geïnstalleerde stabiele runtime 24.2.7.2: beide tellen in hun PDF
de derde voetnoot door naar `v`. De ontwikkelruntime schrijft bij ODT → DOCX
bovendien expliciet `sectEnd` terug. De stabiele runtime laat de positie
onvermeld, met de standaardpositie van de nootsoort. Dit verschil tussen
runtimes wordt niet als één algemene exportuitkomst voorgesteld.

De [primaire importbron van de converter](https://github.com/LibreOffice/core/blob/5685292b8c92051cab306731ca083117ad0682cd/sw/source/writerfilter/dmapper/DomainMapper.cxx)
mapt `eachSect` op `PER_CHAPTER`; de proef-ODT bevat geen overeenkomende
tekstsecties of hoofdstukgrenzen. Dit verklaart de doorlopende teller in die
proef, maar vormt nog geen herstel voor volledig ODT-behoud. De ODF-structuur
en de volledige native import-/bewaarroute moeten nog verder worden getoetst.
Er is daarom geen wijziging van nootmetadata of een beperking tot eenvoudiger
documenten als oplossing ingevoerd.

Ook de overige criteria van #37, waaronder PDF/A en opmerkingenkeuze, en die
van #51, waaronder alle inline bewerkingsroutes en ODT-behoud, zijn hiermee
niet volledig afgetekend. Windows/macOS-GUI-bediening is niet lokaal bewezen.
