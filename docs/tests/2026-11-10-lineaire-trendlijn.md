# Lineaire trendlijnen in de echte grafiek — #308

De dialoog kon een trendlijn bewaren en voorvertonen, maar op het werkblad
ontbrak de lijn. De onafhankelijke voorproef met waarden 2/6/4 leverde met en
zonder alleen het trendlijnelement dezelfde 80 tekenopdrachten op. De expliciete
magentakleur kwam nul keer voor. Het grafiekobject was geen placeholder.

De afgebakende bronpatch voegt lineaire trendlijngeometrie toe voor gewone
2D-lijn- en spreidingsgrafieken. Het omvat numerieke X-coördinaten, oorspronkelijke
categorieposities bij lege waarden, een vast snijpunt, lijnkleur/-breedte,
`noFill` en begrensde voorspelling binnen de bestaande plot. Er zijn geen
aanpassingen in `editors.tsx`, de gedeelde host of de geïnstalleerde app.

## Vastgelegd codepunt en rekenkern

De native platformvergelijking gebruikt één codepunt:
`c1e5e9055ce03083f293342ee4531c7ccddb6e3d`.
De reproductie- en bewijsbestanden die daarna worden toegevoegd wijzigen de
applicatiebron of de native bronpatch niet.

- Upstreambron: `4e982c3aea0065578604c3fe7727938533888f66`.
- Bestaande gedeelde achtpatch-kern:
  `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa`.
- Nieuwe negende patch: `rekenbladengine-lineaire-trendlijnen.patch`, SHA-256
  `8a56f7cfe48ce1083de83cfd8864503d14411c868263c3a07772451557edbcdb`.
- Private kandidaat-WASM: **7.752.260 bytes**, SHA-256
  `e80ac4ef9b8b79fcc8ebee4daa2d493f324bda8447f1686682f4a979ecf8b344`.
- Rust 1.98.1, wasm-bindgen 0.2.129, Binaryen 132. De bouw controleert dat de
  imports en exports gelijk blijven aan SDK 0.5.1.

De gedeelde `vendor/rekenbladengine` en de achtpatch-metadata blijven bytegelijk.
Dit is een gecontroleerde kandidaat voor de bestaande kerneigenaar en de volgende
integratieronde. De bevroren Windows-kandidaat wordt niet bijgewerkt. Gewoon
overnemen van deze bronpatch activeert de private WASM nog niet in een installer.

## Platformcontrole

[Vastgelegde CI-run](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42802692698).

| Platform | Bouwcontrole | Functionele controle | Resterend |
| --- | --- | --- | --- |
| Windows x64, CI | Rust 1.98.1 en dezelfde negen patches: geslaagd | 225 grafiektests en één echte werkboektest voor beide grafieksoorten: geslaagd | Geïnstalleerde Windows-interface met de gecombineerde nieuwe kern niet getest. |
| Ubuntu 22.04, CI | Native, geoptimaliseerde WASM, contractcontrole, Clippy en formatter: geslaagd | In totaal 577 native tests in 19 gerichte suites geslaagd, waaronder dezelfde 225 grafiektests en werkboektest. Eén reeds bestaande cascade-proef blijft genegeerd. | Linux-desktopbediening met deze kern niet getest. |
| macOS, CI | Nog in de runnerwachtrij | Geen resultaat; wordt niet als geslaagd gerekend. | Native bouw/tests en desktopbediening staan open. |
| Browser, Chromium op Windows | Normale geminificeerde productiefrontend en TypeScript: geslaagd | Werkelijke bestandsopening, beide grafiektypen, celwijziging, Undo, Save as/download en nieuw browserprofiel: geslaagd; geen paginafouten. | Firefox/Safari en een native WebView zijn niet afzonderlijk getest. |

De browser gebruikt alleen voor deze geïsoleerde proef de private kandidaat op
de bestaande XLSX-WASM-requestroute. De JS-interface blijft ongewijzigd. De
gewone browserroute opent lokale bestanden en downloadt de echte opslaguitvoer;
er is geen vervangen of nagebootste grafiekcomponent gebruikt.

De Windows-proefopzet is eerst gecorrigeerd: Git in een tijdelijke submap sloeg
patchpaden over. De bronvoorbereiding heeft nu een eigen Git-root, controleert alle
checksums en eist de aanwezigheid van de nieuwe native test. Een verse lokale
voorbereiding en de geslaagde Windows-run bevestigen werkelijk toegepaste patches.
De eerdere mislukte/opgevolgde runs tellen niet als platformbewijs.

## Onafhankelijke controles

- De native werkboektest leest echte XLSX, tekent, wijzigt een broncel, voert Undo
  uit, print en bewaart/heropent beide grafieksoorten. De grafiekbron en een
  onbekend pakketdeel blijven behouden.
- De JS/WASM-proef controleert gewone/geprofileerde/print-displaylijsten en
  ongewijzigde versie/geschiedenis voor beide soorten, inclusief ongelijke
  numerieke X-afstanden.
- Vier vooraf bepaalde vergelijkingen controleren de echte WASM-eindpunten in
  een vaste plot. De maximale afwijking is 0,00002034 px, onder de tolerantie
  van 0,01 px. De Python-controle gebruikt deze vaste verwachtingen:
  `y=x+2`, spreiding `y=3+3x/70`, vast snijpunt nul `y=13x/7`, en de geclipte
  voorspelling van de eerste vergelijking.
- Onafhankelijke Python-stdlib ZIP/XML-vergelijking van de daadwerkelijke
  browserdownload: beide grafiekdelen zijn **bytegelijk**, celwaarden/formules
  en het onbekende binaire deel blijven gelijk, alle XML-delen parsen.
- Geen volledige applicatie-combinatests herhaald; de combinatie en native
  installatieacceptatie blijven bij integratiechat 1 en de bestaande testhosts.

## Herhalen

```powershell
# Voorproef met de bestaande gedeelde kern: er hoort nog geen trendlijn te zijn.
node scripts/proef-lineaire-trendlijn.mjs --baseline

# Private kandidaat uit de CI-artifactmap; de gedeelde pin blijft ongewijzigd.
$env:OOS_REKENBLAD_WASM = (Resolve-Path .local/trend-kandidaat/xlsx_wasm_bg.wasm).Path
pnpm exec tsc --noEmit
pnpm exec vite build --configLoader runner --outDir .local/trend-build
node scripts/proef-lineaire-trendlijn.mjs
python scripts/controleer-lineaire-trendlijn.py
Remove-Item Env:OOS_REKENBLAD_WASM
```

Op deze Windows-host is Python uit de geïsoleerde LibreOffice-testinstallatie
gebruikt. De scripts gebruiken synthetische bestanden en nieuwe browserprofielen.
Er zijn geen gebruikersdocumenten of geopende desktopapps aangepast.

## Grenzen

De parser bewaart maximaal acht ondersteunde trendlijnen per reeks; de extra
datascan is over de hele grafiek begrensd op 200.000 posities. De bestaande
tekenbudgetten blijven gelden. Ongeldige of niet-bepaalbare fits worden
overgeslagen; er wordt geen rechte lijn verzonnen voor een onbekend type.
Voorspellingssegmenten blijven binnen de bestaande assen en breiden die assen
niet zelfstandig uit. Logaritmische assen, andere regressietypen,
vergelijking-/R²-labels, gestapelde/3D/bar/vlakgrafieken en overige asfuncties
blijven buiten #308. Bestaande importbeperkingsmeldingen blijven zichtbaar.

Afzonderlijke waarneming voor later onder #66: de bestaande plotparser leest
alleen `xMode/yMode=edge` als vaste plotpositie. Een proef met `factor` viel terug
op automatische lay-out. Hiervoor is geen formaatvergelijking of wijziging
uitgevoerd; deze waarneming wordt niet als een opgeloste fout van #308 gerekend.

#66 blijft open. De bronpatch/kandidaat is nog geen geïntegreerde of gepubliceerde
installer en verandert niets aan `main`.

Referentie: [Microsoft Open XML Trendline](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.trendline?view=openxml-3.0.1).
