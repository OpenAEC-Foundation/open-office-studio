# Native controle, 1 november 2026: alpha 38

**2026.44.9-alpha.38** corrigeert drie Notities-fouten. Een paginawissel bewaart de samenhang tussen de zichtbare oude pagina en haar editors totdat het nieuwe werkdraadantwoord arriveert. De zichtbare formaatgreep staat nu in de werkelijke rechteronderhoek. Ongedaan maken van conceptinvoer bouwt ook de Markdown-preview opnieuw uit de ongewijzigde bron op.

Drie aanvullende regressietests faalden vóór de correcties: dezelfde editorcachepanic als in de echte alpha37-release, een niet-werkende zichtbare greep en een achtergebleven conceptpreview. Alle twaalf gerichte Notities-proeven slagen nu. De greepproef gebruikt de zichtbare bediening op 75%, 100% en 150% zoom en controleert precieze bronafmetingen en één bronexacte undo. De overgangsproef rendert expliciet vóór het werkdraadantwoord.

Rustfmt en Clippy zijn groen. De volledige ronde met 671 vastgelegde bronbestanden loopt nog. De platformbouwen en echte alpha38-vensterhertest zijn nog niet afgerond. De [oorspronkelijke alpha37-afkeuringen](notities-2026-11-01-alpha37/LEESMIJ.md) blijven ongewijzigd bewaard.

Alle dertig migratieacceptaties blijven false. De oorspronkelijke UI-vergelijkingen, volledige suitefuncties, ontbrekende modules en overige platform-/installatiecontroles blijven open. Geen stabiele native vrijgave of voltooiing op 100%.
