# Native controle, 31 oktober 2026: alpha 5

**2026.44.9-alpha.5** is een gedeeltelijke migratie. De referentie blijft de
bestaande suite 2026-W44.8. Functiepariteit en pixelgelijkheid zijn nog niet
bereikt; de tien acceptatiegebieden blijven open.

## Bestandenronde van de voorafgaande releasebuild

[Het volledige alpha-4-rapport](corpus-2026-10-31-alpha4-release.json) bevat 648
OOXML-bronnen uit de gepinde openbare Apache POI-verzameling. Bronhashes,
programmahash, bouwprofiel, tijdslimiet en geheugenlimiet staan in het rapport.
De proef opent, rendert de eerste werkweergave, bewaart in geheugen en vergelijkt
zichtbare tekstvelden en onderdeelstructuur na teruglezen.

| Formaat | Geslaagd | Geweigerd | Tijdslimiet | Rondgangverschil |
|---|---:|---:|---:|---:|
| DOCX | 154 | 21 | 2 | 1 |
| XLSX | 332 | 35 | 0 | 0 |
| PPTX | 91 | 12 | 0 | 0 |
| Totaal | 577 | 68 | 2 | 1 |

Dit is geen volledige inhouds-, stijl-, formule-, pagina- of functiecontrole.
Weigeringen bevatten onder meer beschadigde, versleutelde en niet-ondersteunde
bronnen. De andere 918 bestanden uit het manifest zijn niet door deze ronde
gecontroleerd. Een los proces krijgt 30 seconden en 3 GiB adresruimte.

Het DOCX-rondgangverschil in `test-data/integration/stress004.docx` bleek een
onvolledige tekstprojectie van een inhoudsopgave met een genest veld. De XML-tekst
was daar nog aanwezig, maar de vlakke resultaatreserve van de parser miste een
genest verwijzingsresultaat. De interface leest nu de gestructureerde
resultaatboom en hyperlinks, zonder resultaat en reservekopie dubbel te tellen.

De nieuwe minimale eigen fixture vond daarnaast een opslagfout: de serializer
van eenvoudige velden schreef alleen directe runs en verloor geneste velden.
De lokale parsercorrectie bewaart de gestructureerde inhoud. De regressietest
controleert drie opeenvolgende rondgangen, Unicode, zichtbare resultaattekst en
instructies in de werkelijk opgeslagen XML. De oorspronkelijke parserbron,
exacte pakketversie, revisie, licentie en de ene wijziging staan in
`vendor/document-engine-bron.json`; `controleer-bron.py` weigert afwijkingen.
De vijf oorspronkelijke enginecontroles voor geneste velden draaien mee via
de eigen werkruimte. Documentwerker en bestandscontrole reserveren een stapel
van 64 MiB, overeenkomstig de diepe engineproeven; dit is adresruimte, geen
permanent fysiek geheugengebruik. Eigen proeven met veertig geneste velden
controleren zowel de CLI als de documentwerkdraad. Dit is geen bewijs dat alle
mogelijke veldconstructies al ondersteund zijn.

## Native mail

De bestaande Rust-mailkern is uit de vensterhost losgemaakt als `office-mail`.
Accounts, IMAP, SMTP, OAuth, MIME, bijlagen en zoekverzoeken gebruiken dezelfde
contracttypen. Een eigen Tokio-runtime houdt netwerk- en sleutelhangerwerk los
van de Iced- en documentdraad. De automatische netwerktests gebruiken uitsluitend
lokale nepservers en geheugenkluizen, geen echte accounts of echte verzending.

De native interface heeft handmatige accountinstellingen, mappen, een lijst van
50 berichten per pagina, zoeken en een tekstlezer. Een opgehaald bericht kan als
volledige MIME-bron worden geopend in een nieuw IFCX-dossier. Dat dossier moet
nog via Opslaan worden bewaard; het openen van het dossier is geen automatische
archivering op schijf. De bron bevat de originele bijlagen.

De native gegevensmap is gescheiden van de bestaande suite. Wachtwoorden gaan
uitsluitend in de systeemsleutelhanger. Een onbeschikbare kluis geeft een fout;
er is geen terugval naar platte tekst. Niet opgeslagen formulierinvoer blijft
behouden wanneer je naar documenten teruggaat; venstersluiten vraagt om
verwerpen. Document-sneltoetsen veranderen geen verborgen document terwijl het
postvak zichtbaar is.

Nog open in de native mailinterface: OAuth-aanmelding en automatisch
serverzoeken, opstellen/verzenden, concepten, antwoorden, bijlagen opslaan,
berichtacties, HTML-weergave, synchronisatie, accountverwijdering en volledige
visuele gelijkwaardigheid. De bijbehorende kernfuncties alleen bewijzen geen
GUI-pariteit. De HTML-bron wordt niet in een actieve webview uitgevoerd.

## Grenzen van de controle

De volledige lokale ronde slaagt met **124 Rust-tests**, zonder overgeslagen
gevallen, plus de vier Python-regressietests van de beeldcontrole. Rustfmt,
Clippy met waarschuwingen als fouten en alle bronhashcontroles zijn groen.
De onafhankelijke DOCX/XLSX/PPTX-terugleescontrole slaagt, inclusief geneste
velden, werkelijke XML-resultaten en behoud van de geneste veldstructuur.

De native mailproeven omvatten 51 kern-/werkdraadtests en regressies voor
accountinvoer, foutbehoud, verversen van accountidentiteit, modale sluitvragen
en verborgen document-sneltoetsen. De schermproef rendert postvak,
accountinstellingen en sluitdialoog in alle vijf thema's; de afbeeldingen zijn
ook visueel bekeken. Dat is geen test met een echt account of systeemsleutelhanger.

De alpha-5-tests, releasebuilds en uitgepakte pakketcontroles slagen voor
**Windows, Linux en macOS** op codecommit
`bbfeaaacd30b21bee5210a44b70f188a735a3013`, in
[bouwronde 41147860032](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41147860032).
Ook de lokale Linux-releasebuild slaagt. Dit zijn draagbare zip-pakketten;
installers, schone installatie, systeemintegratie en echte GUI-bediening zijn
hiermee niet gecontroleerd.

[De alpha-5-releasecorpusronde](corpus-2026-10-31-alpha5-release.json) controleert
alle 648 geselecteerde bronnen opnieuw met het daadwerkelijke Linux-CI-programma:
**578 rondgangen geslaagd, 68 weigeringen, twee tijdslimieten, geen
rondgangverschil**. De eerdere veldtekstafwijking is opgelost. Dit verandert de
hierboven beschreven beperkte omvang van de controle niet.

Een aanvullende grensproef op de onveranderde alpha-4-controleur laat zien dat
`bug59058.docx` ook de afzonderlijke limiet van 90 seconden bereikt.
`bug65649.docx` breekt af tegen de ingestelde grens van 3 GiB adresruimte.
Dit bewijst geen overeenkomstig fysiek geheugengebruik. Deze twee gevallen
blijven open voor prestaties en begrenzing; dit zijn geen geslaagde controles.

De 26 native PNG-beelden zijn vergeleken met dezelfde beelden uit de CI.
Linux matcht alle 26, Windows en macOS elk 25. De afwijkingen op het
notitiecanvas betreffen de systeemfont-terugval voor de Unicode-sleeptekens:
663 pixels op Windows en 666 op macOS. De overige beelden verschillen niet.
De afzonderlijke meetrapporten staan naast dit document. Dit is uitsluitend een
vergelijking tussen native builds, **geen pixelpariteit met de webinterface**.

Screenshots worden door dezelfde Iced software-renderer gemaakt,
met synthetische bronnen. Dat is geen fysieke GUI-, IME- of schermlezertest.
De browserkoppeling levert JPEG-opnamen van de referentie; de strikte
pixelvergelijking weigert die als verliesvrije PNG-referentie. Ook los daarvan
verschilt de native interface nog zichtbaar van de volledige suite.
