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

## Kandidaat: formatter en bestandsinstelling

De afzonderlijke [bronpatch](../../patches/rekenbladengine-werkmapregio.patch)
wordt na de bestaande lange-ketenspatch op dezelfde vastgezette bron toegepast.
[Herkomst](../../patches/rekenbladengine-werkmapregio-kandidaat.json) en een
[schone patchcontrole](getalnotatie-patchcontrole-2026-11-06.json) leggen alle
zeventien gewijzigde bronbestanden vast. Toepassen slaagt zonder fuzz.
Deze kandidaat is **nog niet aangesloten op de app of gepubliceerd**.

De formatter ondersteunt de negen actieve interfaceregio’s plus en-US, zonder
celwaarden of opgeslagen notatiecodes te wijzigen. Alleen cijferdelen krijgen
regionale scheidingstekens; aangehaalde tekst blijft intact. Expliciete LCID- of
taaltags bepalen de datumwoorden. Franse groepering gebruikt een smalle vaste
spatie; UTF-8-offsets voor opvulling blijven correct. De modelset slaagt in
111 proeven. De aansluitende werkmapproeven controleren regio-isolatie,
TEXT-uitvoer, rastercommando’s, echte opslag/heropening, invoer, Undo/Redo,
tekstnotatie en het bestaande samenwerkingsverbod op structuurwijzigingen.
Alle negen gerichte werkmapproeven slagen, inclusief het datumstelsel 1904
en invoer in een reeds opgemaakte getalcel. De volledige kerncontrole loopt nog.

De bestandsinstelling wordt als verborgen, globale constante
`_OpenAEC_NumberLocale` bewaard. Alleen een bekende, letterlijk aangehaalde
regiotag wordt als instelling gelezen. Een onbekende waarde blijft behouden;
een bestaande zichtbare naam wordt niet stil overschreven. Een naam in
bladbereik geldt niet als bestandsinstelling. De bestandsinitialisatiehulp
bewaart de overige pakketonderdelen bytegelijk, respecteert XML-voorvoegsels
en levert bij twee verschillende systeemklokken identieke bytes.

Veertien gerichte opslagproeven en vier proeven voor versmalde Algemene
notatie slagen. De tekenlaag behoudt de bestaande afronding en meet daarbij
de werkelijke komma; bij een andere breedte van komma en punt past zij het
juiste aantal decimalen toe. De volledige tekenlaagbron wordt met SHA-256
bewaakt. De bestaande npm-pakketten zijn ongewijzigd.

Nog vóór afronding moeten de metadata-initialisatie en de regiokeuze in de
interface worden gekoppeld, alle invoerroutes dezelfde regio en het juiste
datumstelsel volgen, de interne instellingsnaam beschermd/verborgen worden en
het voorbeeld expliciete datumtaaltags volgen. Ook regioscans in grote
naamtabellen, de pakketlimieten bij initialisatie, de nieuwe WASM-koppeling,
volledige appcontrole en native bediening/opslag moeten nog worden afgetekend.
#64 blijft daarom open.

## Eerste WASM-kandidaat — later afgekeurd

Dezelfde vijf [echte JS-/WASM-proeven](getalnotatie-wasm-tegenproef-2026-11-06.json)
falen met de huidige appkern: regionale cijfers, datumtaal/valuta, invoer met
geschiedenis/bewaring en TEXT-regiowissel. Ze slagen alle vijf met de apart
gebouwde kandidaat. De kandidaat gebruikt de bestaande pakket-JS rechtstreeks;
alle 21 imports en 95 exports blijven gelijk. Zie het
[kandidaatbewijs](getalnotatie-wasm-kandidaat-2026-11-06.json).

Deze WASM is 7.692.037 bytes, SHA-256
`1df70b43eb29ce0ddf4a58082028f162f1445c1fe530c4acd1bf1267788df336`.
Dit bewijst de geïsoleerde kernroute en echte bewaring/heropening, nog geen
native bediening met deze kern. De kandidaat is bewust nog niet de geleverde
appkern: eerst volgen de resterende koppelingen en gezamenlijke controles.

De tegenproef is herhaalbaar met `node scripts/proef-werkmapregio.mjs kern.wasm uitvoermap`.
De vijfde proef controleert expliciet Nederlandse datumwoorden met LCID 413
in een werkmap met de Amerikaanse regio. De huidige kern faalt daarop; de
kandidaat geeft `donderdag 1 januari 2026`.

## Gevonden regressie en nacontrole

De eerste brede kernronde vond een regressie buiten de nieuwe regio-invoer:
reeds opgeslagen tekst `1/15` kon zonder bestandsregio bij ongewijzigd vastleggen
een datum worden. De terugval gebruikt nu weer precies de bestaande parser.
Onbekende regio-instellingen schakelen de regionale invoer evenmin stil in.
De acht ongewijzigde `typed_input`-proeven slagen weer. Ook twintig bestaande
exportproeven en alle tien regioproeven slagen: samen 38. Het
[werkmapbewijs](getalnotatie-werkmapproeven-2026-11-06.json) bevat de uitvoer.

De aanvullende proef gebruikt 40.000 naamdefinities en 2.000 cellen bij lezen,
opvragen van invoer, export, bulkbewerking en TEXT. Grote cel-lussen bepalen
de regio eenmaal; dit voorkomt een herhaalde volledige naamscan per cel.
De kunstmatige werkmap heeft geen zichtbaarheid uit een bronpakket; de
exportproef vraagt daarom expliciet ook die bladen op. De bestaande
conservatieve exportweigering bij onbekende zichtbaarheid blijft behouden.

De eerste WASM-kandidaat hierboven is historisch bewijs van de vijf gerichte
proeven en mag niet worden vrijgegeven wegens de daarna gevonden regressie.
Na de broncorrectie volgen een nieuwe WASM en volledige kernnacontrole.
De appset slaagt met 1.821 tests in 157 bestanden; tien corpus-/omgevingsgevallen
zijn overgeslagen. De eerste parallelle ronde liep bij twee bestaande
Writer-proeven tegen 5 seconden aan. De volledige herhaling met één worker
slaagt zonder gewijzigde deadlines of verwachtingen. Typecontrole en
productiebouw slagen. De app gebruikt nog de bestaande kern.

Clippy slaagt voor de vijf betrokken kernbibliotheken met `-D warnings`.
De volledige native kernnacontrole en de tweede WASM-bouw zijn gestart op de
gecorrigeerde bron. Alleen de parallelle Rust-interface-PR #116 staat nog open;
de reeds afgeronde Tauri-rondes zijn gemerged. #64 is nog niet afgetekend.

## Tweede WASM na de broncorrectie

De tweede kandidaat slaagt in **zes** echte JS-/WASM-proeven, inclusief het
behouden van de bestaande tekst `1/15` na ongewijzigd vastleggen en heropenen.
De huidige appkern slaagt voor dat laatste behoud, maar faalt de vijf
regioproeven. De eerste kandidaat slaagt voor die vijf en faalt juist het
tekstbehoud; zie de [afzonderlijke regressietegenproef](getalnotatie-wasm-legacy-tegenproef-2026-11-06.json).
De [actuele kandidaat](getalnotatie-wasm-kandidaat-2026-11-06.json) slaagt voor
alle zes. De 21 imports en 95 exports zijn nog steeds byte-onafhankelijk als
contract vergeleken en gelijk. Ook de volledige bronformatcontrole slaagt.
Deze tweede kandidaat is nog niet de aangesloten appkern; de native
kernnacontrole en de interfacekoppeling blijven vereist.

Na de laatste formatteringscorrectie is de WASM opnieuw gebouwd, gebonden en
geoptimaliseerd. Die uitvoer is bytegelijk aan de zesmaal geteste tweede
kandidaat: 7.692.571 bytes, SHA-256
`e4becef5e4a50fc9a95b5d8e454d0e06aa4748e6f6a420f24be17f2366eee265`.
