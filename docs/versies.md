# Weekversies

Office Studio en de zelfstandige Database Studio gebruiken dezelfde weekuitgave. `2026.43.1` staat voor ISO-week 43 van 2026 en uitgave 1 binnen die week. De interface toont `2026-W43.1`. Het numerieke formaat blijft geschikt voor de drie desktopplatformen.

Vanuit de repositoryhoofdmap:

```bash
pnpm versie:week 2026-10-23 1
pnpm versie:check
```

De eerste opdracht werkt `package.json`, beide Tauri-configuraties, beide Cargo-manifesten en hun lockbestanden bij. De zichtbare weekaanduiding staat in `versie.json`. Zonder argumenten wordt de kalenderdatum in Europe/Amsterdam gebruikt, met volgnummer 1. Kies voor een volgende uitgave in dezelfde week expliciet volgnummer 2, 3, enzovoort. Publiceer een bestaande tag niet opnieuw met andere bestanden.

Een ISO-weekjaar kan rond de jaarwisseling afwijken van het kalenderjaar. De controles omvatten die overgang en weigeren ongeldige datums. De bouwstraat controleert vóór het bouwen of alle versiebestanden overeenkomen.

Alle apps zijn onderdelen van dezelfde bronrepository. Vanaf 2026-W44.8 krijgen Office, Writer, Spreadsheet, Presentation, Email, Notition en Database eigen installers en applicatie-id's. De vijf gerichte kantoorapps erven de versie van de desktopbasis; zij hebben geen extra Cargo-manifest of afzonderlijk versiebestand. Een weekrelease bevat alle zeven apps met dezelfde bronversie. Zie [de studio's](studios.md).

Een uitgave start met de tag `v<versie>`, bijvoorbeeld `v2026.44.8`, of met een handmatige run van [`release.yml`](../.github/workflows/release.yml) met `publiceren=true`. De workflow controleert de versiebestanden, bouwt en ondertekent alle zeven apps en maakt na controle een concept-uitgave met een tag op precies de gebouwde bronrevisie. Zowel een tagrun als een publicerende handmatige run vereist platformondertekening. Een gewone handmatige proefrun mag zonder ondertekeningssleutels bouwen. De publicatiepoort vereist 28 installers en veertien bijpassende Windows-/Linux-pakketrapporten; Linux-pakketten en de checksums krijgen OpenPGP-handtekeningen.

Op `main` stond kort `2026.44.0`; volgnummer 0 bestaat in het weekschema niet, de eerste uitgave van een week is `.1`.
