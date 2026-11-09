# Formules: notatie en functiedekking

Formules gebruiken Engelse functienamen, komma’s tussen argumenten en een punt
voor decimalen: `=SUM(1.5,2)`. Dit geldt ook bij een Nederlandse interface.
Een los ingevoerd getal volgt de bestandsregio: in een Nederlandse werkmap is
`1,5` het getal 1,5. Formules worden altijd in standaard XLSX-notatie bewaard.
Functie invoegen toont deze keuze en de syntaxis per functie.

`src/rekenblad/formulenotatie.test.ts` controleert de echte invoerroute met
`localized:true`, Nederlandstalige en Engelstalige bestandsregio, berekening,
werkelijk opgeslagen XML en heropenen. De interface vertaalt functienamen niet
naar bijvoorbeeld SOM; een puntkomma is geen alternatief argumentscheidingsteken.

## Herkende functies

De vastgezette lijst bevat **229 herkende functies van 519
kandidaten**. De bestaande matrix probeert iedere kandidaat daadwerkelijk in de
rekenkern met meerdere argumentaantallen. Een resultaat anders dan `#NAME?`
bewijst dat de naam bekend is; het bewijst geen volledige Excel-compatibiliteit
voor iedere invoer. De lijst is afkomstig uit `ONDERSTEUNDE_FUNCTIES` in
`src/rekenbladcontrole.ts` en wordt door `scripts/test-matrix-rekenbladen.mjs`
gecontroleerd.

| Categorie | Herkende namen |
| --- | --- |
| wiskunde | `ABS`, `ACOS`, `AGGREGATE`, `ASIN`, `ATAN`, `ATAN2`, `CEILING`, `COMBIN`, `COS`, `COSH`, `DEGREES`, `EVEN`, `EXP`, `FACT`, `FLOOR`, `GCD`, `INT`, `LCM`, `LN`, `LOG`, `LOG10`, `MMULT`, `MOD`, `MROUND`, `ODD`, `PI`, `POWER`, `PRODUCT`, `QUOTIENT`, `RADIANS`, `RAND`, `RANDBETWEEN`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SEQUENCE`, `SERIESSUM`, `SIGN`, `SIN`, `SINH`, `SQRT`, `SUBTOTAL`, `SUM`, `SUMIF`, `SUMIFS`, `SUMPRODUCT`, `SUMSQ`, `TAN`, `TANH`, `TRUNC` |
| statistiek | `AVEDEV`, `AVERAGE`, `AVERAGEA`, `AVERAGEIF`, `AVERAGEIFS`, `CORREL`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `COVAR`, `COVARIANCE.P`, `COVARIANCE.S`, `DEVSQ`, `FORECAST`, `FORECAST.LINEAR`, `FREQUENCY`, `GEOMEAN`, `HARMEAN`, `INTERCEPT`, `KURT`, `LARGE`, `LINEST`, `MAX`, `MAXA`, `MAXIFS`, `MEDIAN`, `MIN`, `MINA`, `MINIFS`, `MODE`, `MODE.SNGL`, `NORM.DIST`, `NORMDIST`, `PERCENTILE`, `PERCENTILE.INC`, `QUARTILE`, `QUARTILE.INC`, `RANK`, `RANK.AVG`, `RANK.EQ`, `RSQ`, `SKEW`, `SLOPE`, `SMALL`, `STDEV`, `STDEV.P`, `STDEV.S`, `STDEVA`, `STDEVP`, `TREND`, `TRIMMEAN`, `VAR`, `VAR.P`, `VAR.S`, `VARP` |
| tekst | `CHAR`, `CLEAN`, `CODE`, `CONCAT`, `CONCATENATE`, `EXACT`, `FIND`, `FIXED`, `LEFT`, `LEN`, `LOWER`, `MID`, `NUMBERVALUE`, `PROPER`, `REPLACE`, `REPT`, `RIGHT`, `SEARCH`, `SUBSTITUTE`, `T`, `TEXT`, `TEXTAFTER`, `TEXTBEFORE`, `TEXTJOIN`, `TEXTSPLIT`, `TRIM`, `UPPER`, `VALUE` |
| datum | `DATE`, `DATEDIF`, `DATEVALUE`, `DAY`, `DAYS`, `EDATE`, `EOMONTH`, `HOUR`, `ISOWEEKNUM`, `MINUTE`, `MONTH`, `NETWORKDAYS`, `NETWORKDAYS.INTL`, `NOW`, `SECOND`, `TIME`, `TIMEVALUE`, `TODAY`, `WEEKDAY`, `WEEKNUM`, `WORKDAY`, `WORKDAY.INTL`, `YEAR`, `YEARFRAC` |
| zoeken | `ADDRESS`, `AREAS`, `CHOOSE`, `CHOOSECOLS`, `CHOOSEROWS`, `COLUMN`, `COLUMNS`, `DROP`, `EXPAND`, `FILTER`, `FORMULATEXT`, `HLOOKUP`, `HSTACK`, `HYPERLINK`, `INDEX`, `INDIRECT`, `LOOKUP`, `MATCH`, `OFFSET`, `ROW`, `ROWS`, `SORT`, `SORTBY`, `TAKE`, `TOCOL`, `TOROW`, `TRANSPOSE`, `UNIQUE`, `VLOOKUP`, `VSTACK`, `WRAPCOLS`, `WRAPROWS`, `XLOOKUP`, `XMATCH` |
| logisch | `AND`, `BYCOL`, `BYROW`, `FALSE`, `IF`, `IFERROR`, `IFNA`, `IFS`, `LAMBDA`, `LET`, `MAKEARRAY`, `MAP`, `NOT`, `OR`, `REDUCE`, `SCAN`, `SWITCH`, `TRUE`, `XOR` |
| informatie | `ISBLANK`, `ISERR`, `ISERROR`, `ISEVEN`, `ISLOGICAL`, `ISNA`, `ISNUMBER`, `ISODD`, `ISTEXT`, `N`, `NA` |
| financieel | `FV`, `NPER`, `NPV`, `PMT`, `PV` |
| techniek | `CONVERT` |

## Ontbrekende kandidaten

`ACCRINT`, `ACCRINTM`, `ACOSH`, `ACOT`, `ACOTH`, `AMORDEGRC`, `AMORLINC`, `ARABIC`, `ARRAYTOTEXT`, `ASC`, `ASINH`, `ATANH`, `BAHTTEXT`, `BASE`, `BESSELI`, `BESSELJ`, `BESSELK`, `BESSELY`, `BETA.DIST`, `BETA.INV`, `BETADIST`, `BETAINV`, `BIN2DEC`, `BIN2HEX`, `BIN2OCT`, `BINOM.DIST`, `BINOM.DIST.RANGE`, `BINOM.INV`, `BINOMDIST`, `BITAND`, `BITLSHIFT`, `BITOR`, `BITRSHIFT`, `BITXOR`, `CALL`, `CEILING.MATH`, `CEILING.PRECISE`, `CELL`, `CHIDIST`, `CHIINV`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `CHISQ.TEST`, `CHITEST`, `COMBINA`, `COMPLEX`, `CONFIDENCE`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `COT`, `COTH`, `COUPDAYBS`, `COUPDAYS`, `COUPDAYSNC`, `COUPNCD`, `COUPNUM`, `COUPPCD`, `CRITBINOM`, `CSC`, `CSCH`, `CUBEKPIMEMBER`, `CUBEMEMBER`, `CUBEMEMBERPROPERTY`, `CUBERANKEDMEMBER`, `CUBESET`, `CUBESETCOUNT`, `CUBEVALUE`, `CUMIPMT`, `CUMPRINC`, `DAVERAGE`, `DAYS360`, `DB`, `DBCS`, `DCOUNT`, `DCOUNTA`, `DDB`, `DEC2BIN`, `DEC2HEX`, `DEC2OCT`, `DECIMAL`, `DELTA`, `DGET`, `DISC`, `DMAX`, `DMIN`, `DOLLAR`, `DOLLARDE`, `DOLLARFR`, `DPRODUCT`, `DSTDEV`, `DSTDEVP`, `DSUM`, `DURATION`, `DVAR`, `DVARP`, `EFFECT`, `ENCODEURL`, `ERF`, `ERF.PRECISE`, `ERFC`, `ERFC.PRECISE`, `ERROR.TYPE`, `EUROCONVERT`, `EXPON.DIST`, `EXPONDIST`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `F.TEST`, `FACTDOUBLE`, `FDIST`, `FILTERXML`, `FINDB`, `FINV`, `FISHER`, `FISHERINV`, `FLOOR.MATH`, `FLOOR.PRECISE`, `FORECAST.ETS`, `FORECAST.ETS.CONFINT`, `FORECAST.ETS.SEASONALITY`, `FORECAST.ETS.STAT`, `FTEST`, `FVSCHEDULE`, `GAMMA`, `GAMMA.DIST`, `GAMMA.INV`, `GAMMADIST`, `GAMMAINV`, `GAMMALN`, `GAMMALN.PRECISE`, `GAUSS`, `GESTEP`, `GETPIVOTDATA`, `GROUPBY`, `GROWTH`, `HEX2BIN`, `HEX2DEC`, `HEX2OCT`, `HYPGEOM.DIST`, `HYPGEOMDIST`, `IMABS`, `IMAGE`, `IMAGINARY`, `IMARGUMENT`, `IMCONJUGATE`, `IMCOS`, `IMCOSH`, `IMCOT`, `IMCSC`, `IMCSCH`, `IMDIV`, `IMEXP`, `IMLN`, `IMLOG10`, `IMLOG2`, `IMPOWER`, `IMPRODUCT`, `IMREAL`, `IMSEC`, `IMSECH`, `IMSIN`, `IMSINH`, `IMSQRT`, `IMSUB`, `IMSUM`, `IMTAN`, `INFO`, `INTRATE`, `IPMT`, `IRR`, `ISFORMULA`, `ISNONTEXT`, `ISO.CEILING`, `ISOMITTED`, `ISPMT`, `ISREF`, `JIS`, `LEFTB`, `LENB`, `LOGEST`, `LOGINV`, `LOGNORM.DIST`, `LOGNORM.INV`, `LOGNORMDIST`, `MDETERM`, `MDURATION`, `MIDB`, `MINVERSE`, `MIRR`, `MODE.MULT`, `MULTINOMIAL`, `MUNIT`, `NEGBINOM.DIST`, `NEGBINOMDIST`, `NOMINAL`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `NORMINV`, `NORMSDIST`, `NORMSINV`, `OCT2BIN`, `OCT2DEC`, `OCT2HEX`, `ODDFPRICE`, `ODDFYIELD`, `ODDLPRICE`, `ODDLYIELD`, `PDURATION`, `PEARSON`, `PERCENTILE.EXC`, `PERCENTOF`, `PERCENTRANK`, `PERCENTRANK.EXC`, `PERCENTRANK.INC`, `PERMUT`, `PERMUTATIONA`, `PHI`, `PHONETIC`, `PIVOTBY`, `POISSON`, `POISSON.DIST`, `PPMT`, `PRICE`, `PRICEDISC`, `PRICEMAT`, `PROB`, `QUARTILE.EXC`, `RANDARRAY`, `RATE`, `RECEIVED`, `REGEXEXTRACT`, `REGEXREPLACE`, `REGEXTEST`, `REGISTER.ID`, `REPLACEB`, `RIGHTB`, `ROMAN`, `RRI`, `RTD`, `SEARCHB`, `SEC`, `SECH`, `SHEET`, `SHEETS`, `SKEW.P`, `SLN`, `SQRTPI`, `STANDARDIZE`, `STDEVPA`, `STEYX`, `SUMX2MY2`, `SUMX2PY2`, `SUMXMY2`, `SYD`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `T.TEST`, `TBILLEQ`, `TBILLPRICE`, `TBILLYIELD`, `TDIST`, `TINV`, `TRANSLATE`, `TRIMRANGE`, `TTEST`, `TYPE`, `UNICHAR`, `UNICODE`, `VALUETOTEXT`, `VARA`, `VARPA`, `VDB`, `WEBSERVICE`, `WEIBULL`, `WEIBULL.DIST`, `XIRR`, `XNPV`, `YIELD`, `YIELDDISC`, `YIELDMAT`, `Z.TEST`, `ZTEST`.

Deze **290** namen komen uit de bestaande kandidatenlijst; de lijst omvat
niet iedere mogelijke Excel-functie of invoegtoepassing. Een onbekende functie
wordt bij openen gemeld. Een bewaarde bronuitkomst is geen opnieuw berekende
uitkomst. Repareer of vervang zo’n formule voordat je op de uitkomst vertrouwt.

## Berekening en fouten

Wijzigingen rekenen ook afhankelijke cellen op andere werkbladen opnieuw uit.
De geselecteerde foutcel krijgt een uitleg bij de formulebalk. De indicator
onderscheidt een kringverwijzing en een rekenlimiet van de getoonde celwaarde.
Foutcodes blijven canoniek in het bestand; de uitleg volgt de interfacetaal.

Zie de [onafhankelijke formulematrix](tests/2026-11-06-rekenbladmatrix.md) voor
het geteste synthetische corpus, matrix-/uitvloeiende formules en bronbehoud.
Dat historische rapport hoort bij de daar genoemde kernhash; het is geen
nieuwe onafhankelijke beoordeling van de uitgebreide kern in deze werkstand.
De nieuwe kern krijgt afzonderlijke regressie- en opslagcontroles.

Optioneel iteratief rekenen en een volledig praktijkcorpus zijn nog open
acceptatiepunten van [#59](https://github.com/OpenAEC-Foundation/open-office-studio/issues/59).

Herstel dit document na een wijziging van de functiecatalogus met
`node scripts/documenteer-functiedekking.mjs`.
