# Kalenderdagen in recente bestanden en herstelkopieën (#13)

Bronbasis: `main` op `f4a03889`. Windows x64, Node 24.22.1. Dit is een afzonderlijke
deelfix naast PR #191 (browseropslag), zonder wijzigingen aan `recent.ts`.

`datumTekst` trok 86.400.000 milliseconden af van het begin van vandaag om gisteren
te bepalen. Rond de tijdwisseling duurt de vorige lokale kalenderdag echter 23
of 25 uur. Daardoor ontbrak bij het eerste uur van de wintertijddag het label
Gisteren, terwijl de laatste avond vóór de zomertijddag onterecht Gisteren kon
heten. Een timestamp op een toekomstige kalenderdag werd ook Vandaag genoemd.

De helper vergelijkt nu lokale kalenderdagen. Gisteren wordt met `setDate`
bepaald. Alleen dezelfde kalenderdag krijgt Vandaag; oudere en toekomstige
dagen behouden de gewone datumweergave. Dezelfde helper verzorgt ook de tekst
voor herstelkopieën, inclusief de variant voor midden in een zin.

## Bewijs

- Vijf van zes nieuwe unitgevallen falen op de oude helper; alle zes slagen met
  de fix. Ze controleren de Nederlandse en Engelse wintertijdlabels, de
  zomergrens, een toekomstige datum en de jaargrens. De tests zetten de tijdzone
  expliciet op Europe/Amsterdam en controleren de echte UTC-offsets.
- De gerichte set van datum-, recente-bestanden-, herstel- en i18n-tests slaagt:
  31 tests. TypeScript en de Vite-productiebouw slagen.
- De volledige Vitest-suite slaagt met 1.993 tests in 176 bestanden; tien
  bestaande gevallen blijven overgeslagen.
- De productiefrontend is in Chromium gecontroleerd met een vaste klok en
  `timezoneId: Europe/Amsterdam`. Vier van zes browsergevallen falen op de oude
  build; alle zes slagen op de nieuwe. Er zijn geen `pageerror`-meldingen.
  [Oude uitkomst](recente-datums-baseline-2026-11-09.json) en
  [nieuwe uitkomst](recente-datums-2026-11-09.json).

De browserproef vereist Playwright/Chromium:
`node scripts/test-recente-datums-browser.mjs http://127.0.0.1:1454/`.
`--baseline` bewaart de oude uitkomst; `OOS_PLAYWRIGHT_MODULE` kan een aparte
Playwright-installatie aanwijzen.

#13 blijft open voor de overige criteria, waaronder de Windows Jump List en
de instelbare limiet. Deze ronde wijzigt geen opslag, native opdrachten of UI-opmaak
en bouwt geen nieuwe native desktopbinary.
