# Werkmapregio en getalnotatie — lopende herstelronde

#64 blijft open. Dit document legt de oorspronkelijke afwijking en de nog
benodigde gezamenlijke controle vast. Een geslaagde modelproef alleen tekent
de interface, bewaring of het volledige issue niet af.

## Gereproduceerd met de bestaande kern

De [synthetische werkmap](getalnotatie-kern-tegenproef-2026-11-06.xlsx) is
rechtstreeks met de bestaande XLSX-WASM geopend en uitgelezen. De kern heeft
SHA-256 `385e2c53ddcbddded2060cb1d749b6c0e9b3b84f87f73290c71e82932271a702`.
De ongewijzigde waarden zijn 1234,5 en datumgetal 46023 (1 januari 2026).

| Cel | Notatiecode | Werkelijk gelezen weergave |
| --- | --- | --- |
| A1 | `#,##0.00` | `1,234.50` |
| B1 | `[$-413]#,##0.00` | `1,234.50` |
| C1 | `[$€-413] #,##0.00` | `€ 1,234.50` |
| D1 | `[$-nl-NL]#,##0.00` | `1,234.50` |
| E1 | `dd-mm-yyyy` | `01-01-2026` |
| F1 | `[$-413]dddd d mmmm yyyy` | `Thursday 1 January 2026` |

Het Nederlandse voorbeeld in Celeigenschappen gebruikt `Intl` en geeft voor
dezelfde standaard-getalcode `1.234,50`. De kern levert de Engelse weergave.
Een expliciete Nederlandse datumtaal levert eveneens Engelse woorden. Zie de
[volledige kernlezing](getalnotatie-kern-tegenproef-2026-11-06.json).
De visuele raster- en native bedieningsproef moeten in deze ronde nog volgen.

Getalscheiding en datumtaal zijn afzonderlijke instellingen. Een valuta- of
datumtaalcode hoeft de getalscheiding van de gekozen werkmapregio niet te
overschrijven. De opgeslagen notatiecodes en numerieke waarden blijven in
standaardnotatie; alleen de weergave wordt gelokaliseerd. Zie de primaire
documentatie over [getalnotaties](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.numberingformat)
en [regionale scheidingstekens](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/formula-errors).

## Resterende acceptatie van #64

De bestaande categorieën en het voorbeeldvenster moeten samen met de echte
rasterweergave opnieuw worden gecontroleerd: algemeen, getal, valuta,
boekhouding, datum, tijd, percentage, breuk, wetenschappelijk, tekst en eigen
codes. Negatieve getallen, kleur, haakjes, letterlijke tekst en opvulgeometrie
moeten behouden blijven.

De regio moet per werkmap kunnen worden gekozen en bij bewaren/heropenen
behouden blijven. Invoer, voorbeeld, raster, kopiëren en uitvoer moeten die
keuze volgen. Datum-, getal- en procentinvoer moeten numerieke waarden blijven.
Er is nog geen nieuwe kern aangesloten of uitgebracht; de openbare installers
blijven ongewijzigd.
