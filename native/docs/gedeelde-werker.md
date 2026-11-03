# Gedeelde documentwerker

`office_core::werker` bezit de documentsessies op één afzonderlijke werkdraad.
De module heeft geen afhankelijkheid van een vensterbibliotheek. De bestaande
Iced-interface gebruikt dezelfde typen en uitvoering via een herexport.

De opdrachtgever geeft een documentidentiteit en een `Opdracht` mee aan
`Werker::voer_uit`. Het antwoord bevat de deelpositie, weergave, bronbytes en
bronhash, plus de beschikbare geschiedenisstappen. Documentmodellen blijven
op de werkdraad; bronbytes worden via `Arc` gedeeld. Ook bestandswerk kan met
`achtergrond` buiten de vensterdraad worden uitgevoerd.

De oorspronkelijke opdrachtvolgorde, conservatieve sessiebewerkingen en
paniekafhandeling zijn behouden. `sluit` plaatst het verwijderen van één
document in dezelfde rij. Dit annuleert een reeds lopende zware bewerking
niet; het is geen nieuwe annulerings- of voorrangsregeling.

Vier gerichte proeven controleren afzonderlijke documenten en sluiten, een
geweigerde bewerking gevolgd door geldige invoer, daadwerkelijke documentaanmaak
op een andere draad en het resultaat van achtergrondwerk:

```sh
cargo test --manifest-path native/Cargo.toml -p office-core --locked --test documentkern werker:: -- --test-threads=1
```

De WebView-interface gebruikt de werker nog niet. Die aansluiting moet vóór
productiegebruik ook de volgende eigenschappen bewaren:

- Documentidentiteit en navigatiegeneratie blijven bij elke opdracht horen.
- Oude antwoorden mogen nieuwere invoer, selectie of navigatie niet vervangen.
- Invoer, undo/redo, bewaren en sluiten gebruiken dezelfde volgorde en
  bewaarsnapshots; een nieuw concept mag niet onterecht als opgeslagen gelden.
- De UI houdt geen schrijfslot vast tijdens het wachten op een antwoord.
- Een geweigerde bewerking bewaart bron en hersteltekst; sluiten mag een
  document niet via een laat antwoord terugbrengen.

De bestaande WebView-model- en vensterproeven blijven de regressiebasis.
De werker verplaatsen bewijst op zichzelf geen snellere WebView, volledige
functiepariteit of pixelgelijkheid.

## Opdrachten toelaten vóór de antwoordafhandeling

`Werker::stuur` plaatst een geaccepteerde opdracht onmiddellijk in de seriële rij.
De teruggegeven future ontvangt alleen het antwoord. Later pollen of weggooien
verplaatst of annuleert de opdracht niet. Dit is nodig bij het aansluiten van de
Rust-WebView: een verdwenen bediening mag geaccepteerde invoer niet verliezen.
De bestaande `voer_uit`-future behoudt haar eerdere uitgestelde gedrag tot de
executor haar voor het eerst pollt. `sluit` blijft een expliciete opdracht in
precies dezelfde rij.

Drie nieuwe regressieproeven falen op een louter doorgestuurde lazy future en
slagen met onmiddellijke toelating: een latere weergavevraag eerder afwachten,
een antwoord weggooien en twee conceptbewerkingen omgekeerd afwachten. De zeven
werkertests en 161 documentkernproeven slagen; zie
[het toelatingsverslag](werker-toelating-2026-11-03.json). De WebView-aansluiting
zelf is hiermee nog niet uitgevoerd.

De aansluitende volledige werkruimte-uitvoering slaagt in één ronde: 476 tests,
zes expliciet optionele tests overgeslagen. Ook de X11-proef slaagt met het
expliciete `OFFICE_XVFB`-pad. Clippy met desktopcode en alle doelen blijft groen.
