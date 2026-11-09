# Presentatie: diaovergangen (#83)

## Eerste increment

Diavoorstelling → Diaovergangen biedt geen overgang, vervagen, schuiven,
vegen, splitsen en zoomen, met een voorbeeld van de werkelijke dia. Duur,
richting, oriëntatie en handmatig/automatisch doorgaan zijn instelbaar voor
de huidige dia, geselecteerde dia's uit de sorteerder of alle dia's.

Overgangen staan als PresentationML in het PPTX-pakket. Nieuwe overgangen
hebben een compatibiliteitsfallback en een exacte Office 2010-duur. Bij
timingwijzigingen blijven onbekende effecten en extensies behouden.
Geluidsinstellingen kunnen worden behouden of verwijderd; toevoegen en
afspelen worden nog afzonderlijk uitgewerkt.

## Validatie op 9 november 2026

- Volledige suite: **176 bestanden geslaagd; 2003 tests geslaagd,
  10 overgeslagen**, met `--configLoader runner --maxWorkers=2`.
- De 16 nieuwe tests controleren effect-/timinggegevens, een andere
  namespaceprefix voor de duur, elementvolgorde, onbekende inhoud,
  geluidsbehoud/verwijderen, gerichte pakketwijzigingen en een rondreis door
  de werkelijke PPTX-engine.
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
- Dialoog visueel gecontroleerd in het donkere thema; keuzelijsten en
  numerieke invoer hebben expliciete themakleuren en alle opties zijn
  bereikbaar via de scrollbare inhoud.

## Grenzen van deze controle

Canvasanimaties annuleren bij diawissel, resize en sluiten, en respecteren
`prefers-reduced-motion`. Het aparte Tauri-toeschouwervenster ontvangt
overgangsmetadata en speelt lokaal dezelfde tekenroutine; een native
Windows-/tweeschermenproef is nog niet uitgevoerd. Browserweergave op twee
schermen en PowerPoint/LibreOffice zijn eveneens nog niet handmatig getest.
ODP-/PPT-conversierondreizen vallen onder het vervolg van #33/#36.

Het pakket opnieuw laden begint een nieuwe ongedaanmaakgeschiedenis; de
dialoog meldt dit vooraf. #83 blijft open tot het resterende geluidswerk
en de aanvullende compatibiliteitscontroles zijn uitgevoerd.

Referenties voor de pakketstructuur:
[Transition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition?view=openxml-3.0.1),
[MCE/fallbacks](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-add-transitions-between-slides-in-a-presentation),
[Split](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.splittransition?view=openxml-3.0.1),
[Zoom](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.zoomtransition?view=openxml-3.0.1).
