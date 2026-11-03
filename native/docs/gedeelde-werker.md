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
