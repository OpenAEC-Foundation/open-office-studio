# Presentatie: diaovergangen (#83)

## Geteste uitbreiding

Diavoorstelling → Diaovergangen biedt geen overgang, vervagen, schuiven,
vegen, splitsen en zoomen, met een voorbeeld van de werkelijke dia. Duur,
richting, oriëntatie en handmatig/automatisch doorgaan zijn instelbaar voor
de huidige dia, geselecteerde dia's uit de sorteerder of alle dia's.

Overgangen staan als PresentationML in het PPTX-pakket. Nieuwe overgangen
hebben een compatibiliteitsfallback en een exacte Office 2010-duur. Bij
timingwijzigingen blijven onbekende effecten en extensies behouden.
Geluidsinstellingen kunnen worden behouden of verwijderd. Een PCM- of
float-WAV-bestand tot 10 MB kan worden gekozen, beluisterd en ingesloten.
Eén gedeeld mediaonderdeel bedient alle gekozen dia's. Tijdens de voorstelling
worden ingesloten geluiden afgespeeld, inclusief bestaande lus-/stopcommando's;
gelinkte bestanden worden niet automatisch geladen. Wanneer de browser
afspelen weigert, kan de gebruiker het met een knop opnieuw starten.

## Validatie op 9 november 2026

- Volledige suite: **176 bestanden geslaagd; 2006 tests geslaagd,
  10 overgeslagen**, met `--configLoader runner --maxWorkers=2`.
- De 19 nieuwe tests controleren effect-/timinggegevens, een andere
  namespaceprefix voor de duur, elementvolgorde, onbekende inhoud,
  WAV-validatie, gedeelde media, geluidsbehoud/verwijderen, stopcommando's,
  gerichte pakketwijzigingen en een rondreis door de werkelijke PPTX-engine.
- TypeScript en productiebuild geslaagd. De build meldt de bestaande
  waarschuwing over grote chunks.
- Alle negen aangeboden interfacetalen gecontroleerd (23 bestaande
  waarschuwingen over andere taalmappen).
- Chromium met de productiebuild: vijf previews hebben aantoonbare
  tussenbeelden; ongeldige timing wordt afgewezen; toepassen op alle dia's,
  downloaden en heropenen bewaren de instellingen.
- De voorstelling is gestart met de lintknop. Muisklikken gaan niet door
  wanneer dat is uitgeschakeld; automatische voortgang doorloopt alle dia's,
  pauzeert bij een zwart scherm en eindigt op het eindscherm. Klikken sluit
  dat eindscherm. Geen JavaScript-paginafouten.
- WAV-upload wijst ongeldige inhoud af. De browser decodeert en speelt het
  voorbeeld en de drie heropende diageluiden af. Een kunstmatig geweigerde
  eerste afspeelpoging wordt met de echte herstelknop via Enter hervat,
  zonder naar de volgende dia te gaan. Verminderde beweging toont meteen
  het eindbeeld; de dialoog blijft bij 390 × 844 pixels binnen het scherm.
- Dialoog visueel gecontroleerd in het donkere thema; keuzelijsten en
  numerieke invoer hebben expliciete themakleuren en alle opties zijn
  bereikbaar via de scrollbare inhoud.

## Grenzen van deze controle

Canvasanimaties annuleren bij diawissel, resize en sluiten, en respecteren
`prefers-reduced-motion`. Het aparte Tauri-toeschouwervenster ontvangt
overgangsmetadata en speelt lokaal dezelfde tekenroutine; een native
Windows-/tweeschermenproef is nog niet uitgevoerd. Browserweergave op twee
schermen en PowerPoint/LibreOffice zijn eveneens nog niet handmatig getest.
Een echte ODP-rondreis is uitgevoerd met LibreOffice 26.8.2.2 en het strikte
ODF 1.3-profiel uit PR238 (d2043ead). Alle zes officiële pakket-/schemacontroles
slagen. De converter verandert echter richting, wachttijd en klikbeleid en
verliest twee van drie geluidsacties. Zie het
[vervolgrapport](../vervolgissues/33-presentatie-overgangsbehoud.md). Behoud
via deze conversieroute wordt daarom niet geclaimd. PPT is nog niet getest.

Het pakket opnieuw laden begint een nieuwe ongedaanmaakgeschiedenis; de
dialoog meldt dit vooraf. #83 blijft open voor aanvullende effecten,
native compatibiliteitscontroles en het conversiebehoud onder #33/#36.

Referenties voor de pakketstructuur:
[Transition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition?view=openxml-3.0.1),
[MCE/fallbacks](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-add-transitions-between-slides-in-a-presentation),
[Split](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.splittransition?view=openxml-3.0.1),
[Zoom](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.zoomtransition?view=openxml-3.0.1),
[StartSoundAction](https://learn.microsoft.com/en-nz/dotnet/api/documentformat.openxml.presentation.startsoundaction?view=openxml-3.0.0).
