# Goedgekeurde applicatiebeeldmerken

De zes PNG-bestanden zijn de ongewijzigde geselecteerde Store-bronnen. De
studiocatalogus bewaart hun goedgekeurde checksums en verwijzingen.
`icons.json` beschrijft de uitvoer van dezelfde gezamenlijke generator.

```sh
node scripts/maak-studio-iconen.mjs
node scripts/controleer-studio-iconen.mjs
```

De bestaande ingang `python3 scripts/generate-approved-icons.py` roept deze
pipeline aan; er zijn geen twee onafhankelijke schrijvers van de iconen.
Zie [werkwijze en grenzen](../beeldmerken.md). Dit zijn rasterbronnen; de
SVG-drager in `assets/icon.svg` is geen vectororigineel.
