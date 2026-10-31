# Native controle, 31 oktober 2026: alpha 7

**2026.44.9-alpha.7** breidt de gedeeltelijke Rust-suite uit. De referentie blijft
2026-W44.8. Alle tien acceptatiegebieden blijven open; functiepariteit en
pixelgelijkheid zijn nog niet bereikt.

## Writer-pagina-instelling

Het tabblad Indeling biedt A3, A4, A5, Letter en Legal; staand/liggend; vier
margevoorkeuzes en één, twee of drie tekstkolommen. Een opdracht geldt voor de
sectie van de gekozen body-alinea, inclusief alinea's in een tabel. Een alinea
met een sectie-einde hoort nog bij de voorgaande sectie.

De kern wijzigt uitsluitend de aangewezen eigenschappen. Andere secties en
geërfde kop-/voettekstverwijzingen blijven behouden. De sessie weigert de
pagina-opdracht bij actieve documentbeveiliging of bestaande sectierevisies;
ook wijzigingen bijhouden en alinea's in inhoudsbesturingen worden geweigerd.
Deze controles betreffen deze nieuwe opdrachten, niet alle overige bewerkingen.
Ongeldige waarden veranderen de bron en geschiedenis niet. Ongedaan maken en
opnieuw toepassen herstellen de volledige bron.

Negen kernproeven controleren onder meer sectiegrenzen, beide afdrukstanden,
alle papierformaten, marges/kolommen, ongeldige invoer en bronbehoud bij
beveiliging/revisies. De beveiligingsproef omvat ook een andere namespaceprefix.
De GUI-integratie gebruikt de echte documentwerkdraad en controleert paginering,
opslagstatus en ongedaan maken. Een onafhankelijke documentbibliotheek leest
papiermaten, afdrukstand en geërfde kop-/voettekst terug uit het opgeslagen DOCX.

Volledige pagina-instelling, kop/voet bewerken en directe rich-text-invoer op de
pagina blijven open.

## Kop- en voetteksten zichtbaar maken

De eerdere adapter bewaarde deze verhalen in de bron, maar gaf het gemeten
kop-/voettekstresultaat niet door aan de tekenlijst. De native rasterweergave
tekent die inhoud nu wel, via de bestaande publieke engineaansluiting.

De regressieproef wijzigt alleen een kop- of voettekst, houdt de bodytekst gelijk
en eist een veranderd paginabeeld, ook in de volgende sectie met overerving.
Een eigen driedelig voorbeeld heeft afzonderlijke eerste, even en oneven
varianten. De proef verandert elk van de zes varianten en controleert voor alle
drie pagina's dat uitsluitend het bedoelde beeld verandert. Dit is werkelijk
gerasterde uitvoer, niet alleen een controle van opgeslagen tekst.

## Symboolterugval

De visuele controle vond een ontbrekend huissymbool terwijl de oorspronkelijke
Unicode-tekst nog aanwezig was. De 70 oorspronkelijke documentfontbestanden
blijven ongewijzigd. Een afzonderlijk gepind Noto Sans Symbols 2-font vult de
dekking aan; bronrevisie, bestands- en licentiehashes staan in
`vendor/symbolen/bron.json`. De ongewijzigde fontbytes en OFL-licentie gaan mee
in de bron en het draagbare pakket.

De DOCX-fontketen gebruikt de extra dekking. Presentation kon normale fonts wel
registreren, maar de facade gaf de bestaande registratie voor ontbrekende
tekens nog niet door. Eén delegatiemethode maakt die beschikbaar. De 12
oorspronkelijke facadebestanden, de ene wijziging en toegevoegde upstreamlicentie
zijn vastgelegd in `vendor/pptx-bron.json` en worden volledig geverifieerd.
De bronfamilienamen in documenten worden hierdoor niet gewijzigd.

De proeven controleren glyphdekking, een werkelijk tekenbaar contour, shaping
in vier stijlen en verschillende gerasterde uitvoer voor het huissymbool en een
ontbrekend teken in zowel Writer als Presentation. De native schil gebruikt
eveneens het gepinde symboolfont; de Iced-proef controleert de gekozen fontface
bij vier lintgewichten. Dit bewijst geen volledige Unicode- of kleurfontdekking.

## Alleen de zichtbare Writer-pagina tekenen

De volledige bron wordt eerst gepagineerd. Vervolgens bouwt de adapter alleen
de tekenopdrachten van de gevraagde pagina. Paginatelling, paginavelden,
secties en noten houden daardoor hun volledige documentcontext. Een inmiddels
verdwenen paginanummer wordt vóór de tekenopbouw naar de laatste pagina begrensd.
Dit gebruikt de bestaande publieke tekenvenster-API van de engine.

De regressieproeven vergelijken deze route met een afzonderlijke opbouw van
alle pagina's: exact dezelfde PNG-bytes, paginatelling, overgeslagen afbeeldingen
en klikgebieden. De voorbeelden bevatten tabellen, grafieken, noten, geneste
velden, meerdere secties, eerste/even/oneven kop- en voetteksten, PAGE en NUMPAGES.
Ook een paginaverzoek buiten het document wordt gecontroleerd. De twee nieuwe
proeven slagen. Alle 28 werkelijke Iced-schermbeelden zijn bovendien byte-gelijk
aan de beelden van deze versie vóór de optimalisatie; de volledige reguliere
ronde is daarna opnieuw geslaagd.

Een afzonderlijk faseonderzoek vond de vertraging bij het opbouwen van alle
tekenlijsten. Dat onderzoeksprogramma mengde bestaande releasebibliotheken met
de nieuwe adapter en is daarom geen alpha-7-productbenchmark. De nieuwe
release moet opnieuw met het echte bestandscontroleprogramma worden gemeten.

## Uitgevoerde controles

- **161 reguliere Rust-tests geslaagd**, zes runtimeproeven standaard apart.
- **Alle zes runtimeproeven afzonderlijk geslaagd** op deze versie: vijf
  conversieproeven en de native exportketen voor PDF en CSV.
- Vier Python-regressietests voor strikte beeldvergelijking geslaagd.
- Rustfmt, Clippy met waarschuwingen als fouten en alle bronhashcontroles groen.
- De opgeslagen DOCX/XLSX/PPTX-uitvoer onafhankelijk teruggelezen, inclusief de
  nieuwe pagina-instelling.
- De conversievoorbeelden onafhankelijk teruggelezen op alinea-/tabeltekst,
  celinhoud/formules en diatekst; drie PDF-handtekeningen gecontroleerd.

De conversieteruglezing draait nu ook in de aparte Linux-CI-taak. Testuitvoer
krijgt per bouwronde en platform een eigen map. Buildcaches bevatten alleen
debug- en release-uitvoer, geen oude testbeelden of distributiepakketten.

De 31 schermopnamen zijn door de echte Iced software-renderer gemaakt. De nieuwe
Writer-indeling, zichtbare kop-/voettekst, symboolweergave en de drie aanvullende
voorbeeldschermen zijn visueel bekeken. De referentietests tekenen nu ook zonder
uitvoermap werkelijk het scherm; het ontbreken van die map slaat de weergave
niet meer over.
Dit is geen fysieke GUI-, systeemdialoog-, IME- of schermlezertest. De mailproeven
blijven lokale nepservers gebruiken.

## Visuele en functionele grenzen

De [strikte Writer-vergelijking](pixelcontrole-alpha7/rapport.json) gebruikt
de oorspronkelijke, herhaalbare referentie-PNG van de bestaande suite met
hetzelfde document en viewport. **350.978 van 943.736 pixels wijken af**.
Tolerantie en toegestaan aantal afwijkingen zijn nul; de vergelijking faalt.
Het rapport legt ook de hashes van beide werkelijke bronbeelden vast.

Er zijn nu ook verliesvrije referenties voor Spreadsheet, Presentation en
Notition, telkens op 1058 × 892 pixels, in het donkere thema en met dezelfde
vaste bron voor de native opname. Writer, Spreadsheet en Notition staan op 100%;
Presentation op 65%. De native zijpanelen staan uit. De bestaande suite heeft
andere modulepanelen; die nog ontbrekende indeling is een zichtbaar verschil,
geen weggeknipt gebied. Notition laadt het eigen JSON-voorbeeld als lokale
bewaring in uitsluitend het tijdelijke browserprofiel, terwijl native datzelfde
voorbeeld als bestand opent. Dit bewijst geen importhandeling in de webversie.

| Module | Afwijkende pixels van 943.736 | Resultaat bij nul tolerantie |
| --- | ---: | --- |
| Writer | 350.978 | Niet gelijk |
| Spreadsheet | 624.298 | Niet gelijk |
| Presentation | 592.529 | Niet gelijk |
| Notition | 695.640 | Niet gelijk |

De oorspronkelijke PNG's, herkomst en verschilbeelden staan naast dit rapport.
Alle vier browseropnamen blijven bij herhaling byte-gelijk. De testbrowser heeft
een vaste tijdzone. Het afsluiten ruimt alleen het eigen profiel op, met een
korte herhaling wanneer een renderer zijn bestanden nog afsluit.

## Grote documenten met de echte release

De lokale releasebuild is geslaagd in 26 minuten en 28 seconden. De twee
vastgezette releaseprogramma's melden alpha 7. De eerste nieuwe corpusronde en
de uitgebreidere platformrondes worden hieronder nog afzonderlijk vastgelegd.
Een afzonderlijke vergelijking gebruikt exact dezelfde twee bronhashes,
één controleproces, 120 seconden per bron en 3 GiB adresruimte per proces:

| Bron | Alpha 6 | Alpha 7 |
| --- | --- | --- |
| 953 alinea's | Rondgang 99.021 ms, eerste weergave 48.730 ms | Rondgang 3.385 ms, eerste weergave 1.507 ms |
| 15.935 alinea's | Afgebroken bij de geheugenlimiet | Rondgang 29.186 ms, eerste weergave 12.361 ms |

Dit zijn afzonderlijke lokale metingen, geen gegarandeerde snelheid op andere
apparaten. De eerdere build liep nog tijdens de alpha-6-meting; bij alpha 7 was
de build klaar. De controle vergelijkt de zichtbare tekstvelden en
onderdeelstructuur na bewaren en teruglezen, niet alle pagina's of opmaak.
De aparte faseproef hierboven is niet gebruikt als productbenchmark.

De [laatste volledige releasecorpusronde](corpus-2026-10-31-alpha5-release.json)
betreft nog alpha 5: 648 geselecteerde OOXML-bronnen, 578 geslaagde rondgangen,
68 weigeringen en twee tijdslimieten. Dit is geen corpuscontrole van alpha 7.
De andere 918 manifestbronnen en de grote-documentproblemen blijven open.

Alpha 6 is op Windows, Linux en macOS gebouwd en uitgepakt gecontroleerd in
[bouwronde 41155324619](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41155324619).
De alpha-7-releasebuilds en platformmetingen moeten afzonderlijk worden
vastgelegd. De huidige wijzigingen leveren nog geen stabiele native vrijgave,
schone installers of de volledige losse edities op.
