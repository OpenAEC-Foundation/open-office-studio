# Weekversies

Office Studio en de zelfstandige Database Studio gebruiken dezelfde weekuitgave. `2026.43.1` staat voor ISO-week 43 van 2026 en uitgave 1 binnen die week. De interface toont `2026-W43.1`. Het numerieke formaat blijft geschikt voor de drie desktopplatformen.

Vanuit de repositoryhoofdmap:

```bash
pnpm versie:week 2026-10-23 1
pnpm versie:check
```

De eerste opdracht werkt `package.json`, beide Tauri-configuraties, beide Cargo-manifesten en hun lockbestanden bij. De zichtbare weekaanduiding staat in `versie.json`. Zonder argumenten wordt de kalenderdatum in Europe/Amsterdam gebruikt, met volgnummer 1. Kies voor een volgende uitgave in dezelfde week expliciet volgnummer 2, 3, enzovoort. Publiceer een bestaande tag niet opnieuw met andere bestanden.

Een ISO-weekjaar kan rond de jaarwisseling afwijken van het kalenderjaar. De controles omvatten die overgang en weigeren ongeldige datums. De bouwstraat controleert vóór het bouwen of alle versiebestanden overeenkomen.

Beide apps zijn onderdelen van dezelfde bronrepository. Database krijgt een eigen installer en eigen applicatie-id, zodat beide programma’s naast elkaar kunnen worden geïnstalleerd. Een weekrelease kan de pakketten van beide apps en de bijbehorende pakketrapporten bevatten.
