# Werken aan Open Office Studio

## Issues aanmaken en bijwerken

Kies één issue per zelfstandig te reproduceren, op te lossen en te testen
probleem. Combineer varianten alleen wanneer ze dezelfde afgebakende fout en
acceptatiecriteria betreffen. Bundel niet uitsluitend op een gedeeld onderwerp
zoals donkere modus. Verdeel groter werk in concrete issues en koppel die
waar nuttig aan een bestaand overkoepelend issue of als sub-issues; maak geen
extra verzamelissue wanneer een passend overzicht al bestaat.

Zoek vóór het aanmaken naar open én gesloten duplicaten en lees hun inhoud.
Vul een passende bestaande melding aan. Onderscheid bugs, verbeterwensen en
onderzoek. Vermeld de relevante omgeving en
versie, reproductiestappen, werkelijk en verwacht gedrag, toetsbare
acceptatiecriteria en relevant bewijs. Maak duidelijk welk gedrag door de
gebruiker is gemeld, op screenshots zichtbaar is of zelfstandig gereproduceerd
werd. Stem bij meerdere actieve chats af wie de melding aanmaakt en oplost.
Richt bestaande issues niet zonder afzonderlijke opdracht massaal opnieuw in.

Schrijf titels en beschrijvingen van issues in het Engels. Behoud technische
identificatoren en exacte oorspronkelijke proeftekst wanneer die nodig zijn
om een fout te reproduceren. Laat bestaande labels en statussen bij een
vertaling ongewijzigd.

Deze regels gelden voor iedere AI-agent, op iedere computer. Lees vóór het
maken van een issue [de labelafspraken](docs/issue-labels.md), de beschikbare
repositorylabels en mogelijke duplicaten.

- Lees titel én beschrijving. Kies ten minste één onderdeel en één soort werk.
- Gebruik bestaande labels; maak geen alternatieve namen zoals `writer`,
  `excel` of `bugfix`. `notities` is uitsluitend de Notition-module, niet een
  celnotitie of presentatornotitie.
- Voeg `ui` toe wanneer bediening of interfaceweergave centraal staat, en
  `formaten` wanneer openen, opslaan, import, export of bestandsbehoud centraal staat.
- Een fout in bestaande functionaliteit krijgt `bug`; een nieuwe functie of
  verbeterwens krijgt `enhancement`. Noem een gemelde fout niet onafhankelijk
  bevestigd wanneer je die niet zelf hebt gereproduceerd.
- Geef labels direct mee bij het aanmaken, ook via CLI/API. Bijvoorbeeld:
  `gh issue create --repo OpenAEC-Foundation/open-office-studio --title 'Writer: ...' --body-file issue.md --label tekst --label bug --label ui`.
- Behoud relevante labels bij updates. Stel prioriteit, status of toewijzing
  niet op eigen initiatief opnieuw vast bij uitsluitend categoriseren.
- Ontbreken rechten om labels toe te passen, meld dat expliciet; beweer niet
  dat een issue is gecategoriseerd als die wijziging is geweigerd.

De workflow `Issue-labels controleren` controleert nieuwe en gewijzigde issues.
Het issueformulier kan de gekozen labels automatisch laten toepassen. Bij
vrije tekst moet de maker de labels meegeven; ontbrekende categorieën leveren
een mislukte workflowrun met een concrete melding op.
