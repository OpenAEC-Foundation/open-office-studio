# Afzonderlijk vervolg: achtergrondkleur uit themeOverride

Dit is een voorbereid, zelfstandig reproduceerbaar rendererprobleem voor een
latere registratie/claim, afgestemd met de bestaande integratiecoördinator.
Het hoort bij #78, maar valt buiten de huidige enhancement voor accentkleuren
in de achtergrondkiezer. Er is hiervoor geen parallelle productfix gestart.

## Onafhankelijke waarneming

Een PPTX-dia met `a:schemeClr val="accent1"` verwijst via zijn indeling naar
een geldig apart `themeOverride`-deel met een eigen `clrScheme`. De kleur in
dat deel is `#FA1234`; het basis-masterthema bevat `#4F81BD`. De echte
`@betteroffice/pptx` 0.5.1-engine geeft voor `layoutSlide(0).background` toch
`{kind: "solid", color: "#4F81BD"}` terug. De bekende verkeerde SDK-uitkomst
is in de regressie expliciet als beperking bewaard; dat is geen geslaagde
weergave van de overridekleur.

Dit is een gestructureerde layout-/kleurwaarneming met de echte WASM-engine op
Windows en Linux; geen gebruikersmelding, screenshot of native-GUI-waarneming.
Het bestand behoudt de `themeOverride`-inhoud en de indelingsrelatie bij
serialiseren. Het is dus geen aangetoond verlies van die brononderdelen.

De nieuwe achtergrondkiezer maakt deze kleurkeuze begrijpelijk onbeschikbaar
en laat de gebruiker een eigen effen kleur kiezen. Er wordt geen RGB-imitatie
geschreven en geen beperkingstekst met interne SDK-details getoond. Deze guard
herstelt het bestaande renderprobleem niet.

## Fixture en bestandsoracle

De exacte fixture wordt met SHA-256 en engine-uitkomst bewaard in het
[afzonderlijke bewijs bij de #78-enhancement](../tests/2026-11-23-presentatie-thema-achtergrond.md).
Het bestand is afgeleid van de bestaande repository-PPTX
`docs/voorbeelden/Ontwerpvisie.pptx`; alleen de gerichte achtergrond,
overridepart, contenttype en indelingsrelatie zijn toegevoegd.

Controleer onafhankelijk in de ZIP:

1. De eerste dia heeft een effen `a:schemeClr` met waarde `accent1`.
2. De dia verwijst naar zijn echte `slideLayout`-onderdeel.
3. Dat onderdeel heeft een interne relatie van type
   `http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride`
   naar `ppt/theme/qaOverride.xml`.
4. De contenttype-overrides declareren dit deel als
   `application/vnd.openxmlformats-officedocument.themeOverride+xml`.
5. `qaOverride.xml` heeft wortel `a:themeOverride`, met een volledig
   `a:clrScheme` waarvan `a:accent1/a:srgbClr/@val` gelijk is aan `FA1234`.
6. Het basis-masterthema heeft voor dezelfde accentkleur `4F81BD`.

Daarna: echte engine initialiseren, fixture openen, `layoutSlide(0)` lezen,
opslaan en met een verse handle heropenen. Verwacht is de overridekleur,
werkelijk wordt de masterkleur teruggegeven. Het exacte bytes-/relatiebewijs
is vastgelegd; geen volledige XSD-conformiteitsvalidatie wordt daarmee geclaimd.

De primaire [Open XML-beschrijving van Slide Layout parts](https://download.microsoft.com/download/e/1/4/e14fb96f-83b8-4a2a-84db-7fa8acbe061a/Office%20Open%20XML%20Part%201%20-%20Fundamentals.pdf)
staat Theme Override-relaties toe. De
[ThemeOverridePart-documentatie](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.packaging.themeoverridepart?view=openxml-3.0.1)
beschrijft het aparte onderdeel. Dit is een ander mechanisme dan
`p:clrMapOvr`/`a:overrideClrMapping`; die kleurmapping werkt in de gerichte
nieuwe achtergrondregressies wel.

## Latere afgebakende acceptatie

- De oorspronkelijke `schemeClr` wordt via de werkelijke themeOverride-keten
  naar `#FA1234` gerenderd, met juiste voorrang van dia/indeling/master.
- Een gewone masterkleur zonder override blijft dezelfde kleur opleveren.
- Overridepart, IDs, relaties, overige dia's, tekst/notities en andere thema-
  onderdelen blijven behouden door edit/save/fresh reopen.
- De achtergrondkiezer mag de huidige beperking pas opheffen nadat de echte
  engine en browserroute aantonen dat de overridekleur wordt weergegeven.
- Geen algemene SmartArt/ODF/themafont-/native-platformclaim uit deze ene case.

Open én gesloten issues met `themeOverride`, `theme override`, themakleur en
theme-color/background zijn doorzocht; de beschrijving/voortgang van #78 is
gelezen. Geen specifieke bestaande melding is gevonden. De coördinator heeft
opdracht gegeven dit bewijs afzonderlijk te bewaren voor latere registratie;
de huidige #78-claim is hierdoor niet uitgebreid.
