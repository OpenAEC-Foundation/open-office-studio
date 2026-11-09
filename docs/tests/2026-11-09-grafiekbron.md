# Grafiekbron van geïmporteerde XLSX-bestanden (#66)

Basis: `f4a03889` (`main`), 9 november 2026.

Een grafiek kan naar hetzelfde werkblad verwijzen met verschillende
hoofdletters in de formule, bijvoorbeeld `'Blad 1'!$B$2:$B$3` en
`'BLAD 1'!$A$2:$A$3`. De grafiekeditor zag dit als twee verschillende bladen
en vulde het celbereik niet in. De bronherkenning vergelijkt bladnamen nu
zonder onderscheid in hoofdletters en behoudt de oorspronkelijke spelling
van de eerste waardenverwijzing.

Dezelfde route accepteerde bovendien meer-cellige reeksnamen alsof het één
kopcel was. Niet-reconstrueerbare categorie- en naamverwijzingen werden soms
stilzwijgend weggelaten bij het bepalen van de bron. Deze gevallen blijven nu
zonder afgeleid bereik, zodat de gebruiker zelf een bron kan kiezen. De
oorspronkelijke grafiekgegevens blijven behouden. Celadressen worden met de
bestaande bereikparser aan de werkbladgrenzen getoetst.

## Controle

- 17 nieuwe regressieproeven; 13 falen op de oorspronkelijke code.
- Samen met de bestaande grafiekproeven: 54 geslaagd, inclusief echte
  engine-rondgangen voor XLSX, DOCX en PPTX.
- TypeScriptcontrole en Vite-productiebouw geslaagd.
- `scripts/test-grafiekbron-browser.mjs` controleert de productiebouw met
  `2026-11-09-grafiekbron.xlsx`, een synthetische fixture met twee reeksen.
  Het bronbereik wordt gevuld; een titelwijziging wordt opgeslagen en
  gedownload. Het gedownloade XLSX bevat nog `[10, 20]` en `[4, 8]`, en de
  werkbladcellen B2:C3 bevatten nog dezelfde getallen. Heropenen toont de
  nieuwe titel, hetzelfde bereik en twee reeksen. Geen paginafouten.
- Dezelfde browserproef keurt de eerdere productiebouw met ongewijzigde
  grafiekcode af: het bronbereik is daar leeg in plaats van `'Blad 1'!A1:C3`.

Herhalen na installatie van de vastgezette afhankelijkheden:

```powershell
pnpm test -- src/grafieken/bron.test.ts src/grafieken/grafieken.test.ts
pnpm build
node scripts/test-grafiekbron-browser.mjs dist
```

Deze sandbox gebruikte `--configLoader runner` en de bestaande lokale
afhankelijkheden. Het ontbrekende, reeds vastgezette
`@tauri-apps/plugin-clipboard-manager@2.3.2` werd voor de proef afzonderlijk
uit npm geladen en via een tijdelijke proefconfiguratie verwezen. De
repositoryconfiguratie en afhankelijkheidsversies zijn niet gewijzigd.

Dit is een afgebakende deelfix voor #66. Trendlijnen, tweede assen, volledige
ODS-grafiekondersteuning en overige grafiekwensen blijven open. De native
Windows-app is niet opnieuw gebouwd of functioneel getest.
