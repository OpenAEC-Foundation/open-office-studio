# Werken aan Open Office Studio

## Issues aanmaken en bijwerken

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
